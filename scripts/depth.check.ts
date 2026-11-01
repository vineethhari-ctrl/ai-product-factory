/**
 * The depth rule: every substantial AI click is sent the deep-dive directive as the system instruction, on both providers
 * and on every path (normal, web search, corrective retry), and answers cached under an older directive are not reused.
 * Run: npm run check:depth
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "depth-"));
for (const k of ["AI_PROJECT_BUTTON_LIMIT", "AI_USER_BUTTON_LIMIT", "AI_USER_DAILY_TOKENS", "AI_MONTHLY_BUDGET_USD"]) process.env[k] = "0";
delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.GOOGLE_GENAI_USE_VERTEXAI; delete process.env.AI_GEMINI_BACKEND;
delete process.env.GOOGLE_API_KEY; delete process.env.GOOGLE_CLOUD_PROJECT; delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); };
const quiet = async <T,>(f: () => Promise<T>): Promise<T> => { const l = console.log, w = console.warn, e = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {}; try { return await f(); } finally { console.log = l; console.warn = w; console.error = e; } };

(async () => {
  const { depthDirective, DEPTH_VERSION } = await import("../server/depth");
  const { TASK_ROUTE } = await import("../server/routing");
  const { setGeminiClientForTests, callGeminiJSON } = await import("../server/geminiClient");
  const { setClaudeClientForTests, callClaudeJSON } = await import("../server/claudeClient");
  const { callLLMJSON, setProviderForTests, routerCacheKey } = await import("../server/llmRouter");
  const { cacheKey, writeCache } = await import("../server/usage");

  const tasks = Object.keys(TASK_ROUTE) as Array<keyof typeof TASK_ROUTE>;
  const heavy = tasks.filter((x) => x !== "analyze-change");

  // ── the directive itself ──
  t("every substantial task gets the deep-dive directive", heavy.every((x) => (depthDirective(x) ?? "").includes("deepest, most careful effort")));
  t("every substantial task also gets its own 'what the best answer is' line", heavy.every((x) => /For this task the best answer/.test(depthDirective(x) ?? "")), heavy.filter((x) => !/For this task/.test(depthDirective(x) ?? "")).join(", "));
  t("the small, fast Change Impact call is left alone (2,048-token ceiling)", depthDirective("analyze-change") === undefined);
  t("the directive tells the model to self-check coverage, use the input's own names and answer only in the asked format", heavy.every((x) => { const d = depthDirective(x)!; return /check your work against the instructions/.test(d) && /own names/.test(d) && /exactly the format/.test(d); }));
  t("the task's own rules win over the directive", heavy.every((x) => /task's rules win/.test(depthDirective(x)!)));
  t("the directive never asks for invented facts or named companies", heavy.every((x) => /Never invent facts/.test(depthDirective(x)!) && /Never name a real company/.test(depthDirective(x)!)));
  const all = heavy.map((x) => depthDirective(x)).join("\n");
  t("domain-neutral: no industry named", !/\b(vehicle|dealer|warranty|bank|loan|hospital|patient|insurance|retail|airline|fleet|automotive)\b/i.test(all));

  // ── Gemini: system instruction on the normal call, the web-search call and the corrective retry ──
  const schema = z.object({ answer: z.string() });
  const geminiParams: any[] = [];
  let geminiReplies: string[] = [];
  const geminiStub = { models: { generateContent: async (p: any) => { geminiParams.push(p); const text = geminiReplies.shift() ?? JSON.stringify({ answer: "ok" }); return { text, candidates: [{ finishReason: "STOP" }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } }; } } };
  let restore = setGeminiClientForTests(geminiStub);
  await quiet(() => callGeminiJSON("generate-proposal", "PROMPT", schema));
  t("Gemini: the directive is the system instruction, not mixed into the prompt", geminiParams[0]?.config?.systemInstruction === depthDirective("generate-proposal") && geminiParams[0]?.contents === "PROMPT");
  t("Gemini: JSON mode and the route's ceiling are kept", geminiParams[0]?.config?.responseMimeType === "application/json" && geminiParams[0]?.config?.maxOutputTokens > 0);
  geminiParams.length = 0;
  await quiet(() => callGeminiJSON("research-prototype", "PROMPT", schema, undefined, undefined, true));
  t("Gemini: the web-search call carries the directive too", geminiParams[0]?.config?.systemInstruction === depthDirective("research-prototype") && !!geminiParams[0]?.config?.tools);
  geminiParams.length = 0;
  geminiReplies = ["not json at all", JSON.stringify({ answer: "fixed" })];
  const corrected = await quiet(() => callGeminiJSON("generate-definition", "PROMPT", schema));
  t("Gemini: the corrective retry carries the directive too", geminiParams.length >= 2 && geminiParams.every((p) => p.config?.systemInstruction === depthDirective("generate-definition")) && corrected?.answer === "fixed", `${geminiParams.length} calls`);
  geminiParams.length = 0;
  await quiet(() => callGeminiJSON("analyze-change", "PROMPT", schema));
  t("Gemini: no system instruction for Change Impact", geminiParams[0] && !("systemInstruction" in geminiParams[0].config));
  restore();

  // ── Claude: system prompt on the structured call and the web-search call ──
  const claudeParams: any[] = [];
  const claudeStub = { messages: { stream: (p: any) => { claudeParams.push(p); return { finalMessage: async () => ({ usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn", parsed_output: { answer: "ok" }, content: [{ type: "text", text: JSON.stringify({ answer: "ok" }) }] }) }; } } };
  restore = setClaudeClientForTests(claudeStub);
  await quiet(() => callClaudeJSON("generate-test-suite", "PROMPT", schema));
  t("Claude: the directive is the system prompt; the user turn is the task prompt", claudeParams[0]?.system === depthDirective("generate-test-suite") && claudeParams[0]?.messages?.[0]?.content === "PROMPT");
  t("Claude: no temperature sent to Sonnet/Opus 5.5 alongside it (would be a 400)", claudeParams[0] && !("temperature" in claudeParams[0]) || /haiku/.test(claudeParams[0]?.model ?? ""));
  claudeParams.length = 0;
  await quiet(() => callClaudeJSON("research-prototype", "PROMPT", schema, undefined, true));
  t("Claude: the web-search call carries the directive too", claudeParams[0]?.system === depthDirective("research-prototype") && Array.isArray(claudeParams[0]?.tools));
  claudeParams.length = 0;
  await quiet(() => callClaudeJSON("analyze-change", "PROMPT", schema));
  t("Claude: no system prompt for Change Impact", claudeParams[0] && !("system" in claudeParams[0]));
  restore();

  // ── cache: an answer stored under the old key (no directive version) is not served ──
  process.env.AI_CACHE_DAYS = "30";
  process.env.GEMINI_API_KEY = "g";
  writeCache(cacheKey("generate-proposal", "SAME PROMPT"), { answer: "OLD, written before the depth rule" });
  let calls = 0;
  restore = setProviderForTests("gemini", async () => { calls++; return { answer: "NEW" }; });
  const first = await quiet(() => callLLMJSON("generate-proposal", "SAME PROMPT", schema));
  const second = await quiet(() => callLLMJSON("generate-proposal", "SAME PROMPT", schema));
  restore();
  t("an answer cached before the depth rule is not reused; the model is asked again", first?.answer === "NEW" && calls === 1);
  t("the new answer is cached and reused (the cache still works)", second?.answer === "NEW" && calls === 1);
  t("the directive version is part of the router's cache key", routerCacheKey("generate-proposal", "SAME PROMPT") !== cacheKey("generate-proposal", "SAME PROMPT") && DEPTH_VERSION.length > 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
