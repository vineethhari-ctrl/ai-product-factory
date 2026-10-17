// Per-task model routing: default order, .env overrides, per-model parameters, and the router's order.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";

const dir = mkdtempSync(path.join(tmpdir(), "apf-routing-"));
process.env.DATA_DIR = dir;
process.env.AI_MONTHLY_BUDGET_USD = "0";
for (const k of Object.keys(process.env)) if (/^AI_(ORDER|CLAUDE_MODEL|GEMINI_MODEL|GEMINI_FALLBACK)_/.test(k)) delete process.env[k];
delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY;

const { providerOrder, claudeRoute, geminiRoute, geminiModels, hasProviderKey, describeRouting } = await import("../server/routing");
const { callLLMJSON, setProviderForTests, AIUnavailableError } = await import("../server/llmRouter");
const { runWithUsageContext, usageReport, currentAIStatus } = await import("../server/usage");
const { callGeminiJSON, classifyGeminiError, setGeminiClientForTests } = await import("../server/geminiClient");

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); };
const quiet = async <T>(fn: () => Promise<T>) => { const w = console.warn; console.warn = () => {}; try { return await fn(); } finally { console.warn = w; } };

// Defaults: each task asks the provider suited to it first
t("Understand Business: Gemini first, Claude backup", providerOrder("analyze-material").join() === "gemini,claude");
t("Generate BRD: Claude first, Gemini backup", providerOrder("generate-definition").join() === "claude,gemini");
t("Build Prototype: Claude first, Gemini backup", providerOrder("generate-prototype-ui").join() === "claude,gemini");
t("Change Impact: Claude first, Gemini backup", providerOrder("analyze-change").join() === "claude,gemini");
t("BRD runs on Sonnet 5.5 at high effort, no temperature", JSON.stringify(claudeRoute("generate-definition")) === JSON.stringify({ model: "claude-sonnet-5-5", maxTokens: 32768, effort: "high" }), JSON.stringify(claudeRoute("generate-definition")));
t("Change Impact runs on Haiku 4.5 with temperature, no effort", (() => { const r = claudeRoute("analyze-change"); return r.model === "claude-haiku-4-5" && r.temperature === 0.5 && r.effort === undefined; })());
t("Change Impact backup is Gemini Flash", geminiRoute("analyze-change").model === "gemini-3.6-flash");

// .env overrides
process.env.AI_ORDER_GENERATE_DEFINITION = "gemini, Claude";
t("order override", providerOrder("generate-definition").join() === "gemini,claude");
process.env.AI_ORDER_GENERATE_DEFINITION = "nonsense";
t("invalid order override falls back to the default", (await quiet(async () => providerOrder("generate-definition"))).join() === "claude,gemini");
delete process.env.AI_ORDER_GENERATE_DEFINITION;
process.env.AI_CLAUDE_MODEL_GENERATE_DEFINITION = "claude-opus-5-5";
t("model override: Opus for the BRD keeps effort, no temperature", JSON.stringify(claudeRoute("generate-definition")) === JSON.stringify({ model: "claude-opus-5-5", maxTokens: 32768, effort: "high" }));
process.env.AI_CLAUDE_MODEL_GENERATE_DEFINITION = "claude-haiku-4-5";
t("model override to Haiku drops effort and caps output at 64k", (() => { const r = claudeRoute("generate-definition"); return r.model === "claude-haiku-4-5" && r.effort === undefined && r.maxTokens <= 64000; })());
delete process.env.AI_CLAUDE_MODEL_GENERATE_DEFINITION;
process.env.AI_CLAUDE_MODEL_ANALYZE_CHANGE = "claude-sonnet-5-5";
t("model override from Haiku to Sonnet drops temperature (Sonnet 5.5 rejects it)", claudeRoute("analyze-change").temperature === undefined);
delete process.env.AI_CLAUDE_MODEL_ANALYZE_CHANGE;
process.env.AI_GEMINI_MODEL_ANALYZE_MATERIAL = "gemini-x-pro";
t("Gemini model override", geminiRoute("analyze-material").model === "gemini-x-pro" && geminiRoute("analyze-material").temperature === 0.2);
delete process.env.AI_GEMINI_MODEL_ANALYZE_MATERIAL;

// Router order with stand-in providers
const schema = z.object({ by: z.string() });
const calls: string[] = [];
const stub = (name: string, answer: boolean) => async () => { calls.push(name); return answer ? { by: name } : null; };
let restore = [setProviderForTests("gemini", stub("gemini", true)), setProviderForTests("claude", stub("claude", true))];
process.env.GEMINI_API_KEY = "g"; process.env.ANTHROPIC_API_KEY = "c";
let n = 0;
const run = (task: any) => runWithUsageContext("tester", `P${n++}`, () => quiet(() => callLLMJSON(task, `prompt ${n}`, schema)));

calls.length = 0;
t("both keys: BRD goes to Claude only", (await run("generate-definition"))?.by === "claude" && calls.join() === "claude");
calls.length = 0;
t("both keys: Understand Business goes to Gemini only", (await run("analyze-material"))?.by === "gemini" && calls.join() === "gemini");

restore.forEach((r) => r());
restore = [setProviderForTests("gemini", stub("gemini", true)), setProviderForTests("claude", stub("claude", false))];
calls.length = 0;
t("primary fails: backup answers", (await run("generate-definition"))?.by === "gemini" && calls.join() === "claude,gemini");

restore.forEach((r) => r());
restore = [setProviderForTests("gemini", stub("gemini", true)), setProviderForTests("claude", stub("claude", true))];
delete process.env.ANTHROPIC_API_KEY;
calls.length = 0;
t("Gemini key only: every task runs on Gemini", (await run("generate-definition"))?.by === "gemini" && (await run("analyze-change"))?.by === "gemini" && !calls.includes("claude"));
process.env.ANTHROPIC_API_KEY = "c"; delete process.env.GEMINI_API_KEY;
calls.length = 0;
t("Claude key only: every task runs on Claude", (await run("analyze-material"))?.by === "claude" && !calls.includes("gemini"));
delete process.env.ANTHROPIC_API_KEY;
calls.length = 0;
t("no key: no provider is called (offline engine)", (await run("generate-definition")) === null && calls.length === 0);
restore.forEach((r) => r());

// Start-up log
process.env.ANTHROPIC_API_KEY = "c";
const lines = describeRouting();
t("start-up log names the models and marks missing keys", lines.some((l) => l === "generate-definition: claude-sonnet-5-5 -> (gemini-4-argon: no key) -> (gemini-3.1-pro-preview: no key) -> offline engine"), lines.join(" | "));
t("calls that billed no tokens are not counted", usageReport("tester", "P0").team.monthClicks === 0); // stubs report no tokens
delete process.env.ANTHROPIC_API_KEY;

// Placeholder keys copied from .env.example count as no key
process.env.GEMINI_API_KEY = "MY_GEMINI_API_KEY";
t("placeholder Gemini key is treated as no key", !hasProviderKey("gemini"));
process.env.GEMINI_API_KEY = '"AIzaReal123"';
t("a real key (even quoted) is used", hasProviderKey("gemini"));
delete process.env.GEMINI_API_KEY;

// Second Gemini model
t("Gemini 4 Argon is the main Gemini model for the heavy steps, Pro is its backup", geminiModels("generate-prototype-ui").join() === "gemini-4-argon,gemini-3.1-pro-preview" && geminiModels("research-prototype")[0] === "gemini-4-argon");
process.env.AI_GEMINI_MODEL_GENERATE_PROTOTYPE_UI = "gemini-3.1-pro-preview";
t("Pro falls back to Flash", geminiModels("generate-prototype-ui").join() === "gemini-3.1-pro-preview,gemini-3.6-flash");
delete process.env.AI_GEMINI_MODEL_GENERATE_PROTOTYPE_UI;
t("Flash route falls back to Pro", geminiModels("analyze-change").join() === "gemini-3.6-flash,gemini-3.1-pro-preview");
process.env.AI_GEMINI_MODEL_ANALYZE_MATERIAL = "gemini-3.6-flash";
t("an override to Flash still gets Pro as the second model", geminiModels("analyze-material").join() === "gemini-3.6-flash,gemini-3.1-pro-preview");
t("a model is never listed twice", new Set(geminiModels("analyze-material")).size === geminiModels("analyze-material").length);
delete process.env.AI_GEMINI_MODEL_ANALYZE_MATERIAL;
process.env.AI_GEMINI_FALLBACK_GENERATE_DEFINITION = "none";
t("fallback can be switched off", geminiModels("generate-definition").join() === "gemini-4-argon");
process.env.AI_GEMINI_FALLBACK_GENERATE_DEFINITION = "gemini-a, gemini-b";
t("fallback override", geminiModels("generate-definition").join() === "gemini-4-argon,gemini-a,gemini-b");
delete process.env.AI_GEMINI_FALLBACK_GENERATE_DEFINITION;

t("503 is classed as busy", classifyGeminiError({ status: 503, message: "The model is overloaded" }) === "busy");
t("429 is classed as quota", classifyGeminiError({ message: '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}' }) === "quota");
t("404 is classed as model not available", classifyGeminiError({ status: 404, message: "models/x is not found" }) === "unavailable-model");
t("bad key is classed as key", classifyGeminiError({ status: 400, message: "API key not valid. Please pass a valid API key." }) === "key");

// Gemini client with a stand-in SDK: Pro busy -> Flash answers; the failures are recorded for the BA
const tried: string[] = [];
const fakeGemini = (answer: (model: string) => unknown) => ({ models: { generateContent: async ({ model }: { model: string }) => { tried.push(model); return answer(model); } } });
const ok = (model: string) => ({ text: JSON.stringify({ by: model }), candidates: [{ finishReason: "STOP" }], usageMetadata: {} });
const busy = () => { throw Object.assign(new Error("503 UNAVAILABLE: The model is overloaded."), { status: 503 }); };
const realTimeout = globalThis.setTimeout;
(globalThis as any).setTimeout = (fn: () => void) => realTimeout(fn, 0); // skip the retry backoff
process.env.GEMINI_API_KEY = "g";

let restoreClient = setGeminiClientForTests(fakeGemini((m) => (m.includes("argon") ? busy() : ok(m))));
const viaFlash = await runWithUsageContext("tester", "PF1", () => quiet(async () => ({ r: await callLLMJSON("generate-prototype-ui", "fallback prompt 1", schema), s: currentAIStatus() })));
t("Argon busy (3 tries) -> Pro answers", viaFlash.r?.by === "gemini-3.1-pro-preview" && tried.join() === "gemini-4-argon,gemini-4-argon,gemini-4-argon,gemini-3.1-pro-preview", tried.join());
t("status says the AI answered, with the model", viaFlash.s?.outcome === "ai" && viaFlash.s.model === "gemini-3.1-pro-preview", JSON.stringify(viaFlash.s));
restoreClient();

tried.length = 0;
restoreClient = setGeminiClientForTests(fakeGemini(() => busy()));
const callCatching = (project: string, prompt: string) => runWithUsageContext("tester", project, () => quiet(async () => {
  let r: unknown = null, err: unknown = null;
  try { r = await callLLMJSON("generate-prototype-ui", prompt, schema); } catch (e) { err = e; }
  return { r, err, s: currentAIStatus() };
}));
const allBusy = await callCatching("PF2", "fallback prompt 2");
t("both models busy with a key set: an error, not a silent offline answer", allBusy.r === null && allBusy.err instanceof AIUnavailableError && allBusy.s?.outcome === "failed", JSON.stringify(allBusy.s));
t("the error and status say why, per model", allBusy.s?.failures?.length === 2 && allBusy.s.failures.every((f) => f.kind === "busy") && /overloaded/.test((allBusy.err as Error)?.message ?? ""));
t("status names the button", allBusy.s?.button === "Build Prototype");
process.env.AI_OFFLINE_ON_FAILURE = "true";
const optIn = await callCatching("PF2b", "fallback prompt 2b");
t("AI_OFFLINE_ON_FAILURE=true: old behaviour, null for the offline engine", optIn.r === null && optIn.err === null && optIn.s?.outcome === "offline-failed", JSON.stringify(optIn.s));
delete process.env.AI_OFFLINE_ON_FAILURE;
restoreClient();

tried.length = 0;
restoreClient = setGeminiClientForTests(fakeGemini(() => { throw Object.assign(new Error("API key not valid"), { status: 400 }); }));
const badKey = await runWithUsageContext("tester", "PF3", () => quiet(() => callGeminiJSON("generate-prototype-ui", "p", schema)));
t("rejected key: the second model is not tried", badKey === null && tried.length === 1);
restoreClient();

tried.length = 0;
restoreClient = setGeminiClientForTests(fakeGemini((m) => (m.includes("argon") ? { text: "", candidates: [{ finishReason: "MAX_TOKENS" }], usageMetadata: {} } : ok(m))));
const cut = await runWithUsageContext("tester", "PF4", () => quiet(() => callGeminiJSON("generate-prototype-ui", "p", schema)));
t("cut-off answer: the second model is tried", cut?.by === "gemini-3.1-pro-preview" && tried.length === 2);
restoreClient();

tried.length = 0;
let seenContents: unknown;
restoreClient = setGeminiClientForTests({ models: { generateContent: async (req: { model: string; contents: unknown }) => { seenContents = req.contents; return ok(req.model); } } });
await runWithUsageContext("tester", "PF5", () => quiet(() => callLLMJSON("generate-prototype-ui", "with image", schema, undefined, { images: [{ mimeType: "image/png", data: "iVBORw0KGgo=" }] })));
const parts = (seenContents as any)?.[0]?.parts;
t("reference image is sent to Gemini before the prompt", Array.isArray(parts) && parts[0]?.inlineData?.mimeType === "image/png" && parts[1]?.text === "with image");
restoreClient();

// Research call: Google Search grounding, JSON in text (no JSON mode), pages read become sources
let seenConfig: any;
restoreClient = setGeminiClientForTests({ models: { generateContent: async (req: { model: string; config: unknown }) => {
  seenConfig = req.config;
  return { text: "Here is the brief:\n```json\n" + JSON.stringify({ by: req.model }) + "\n```", candidates: [{ finishReason: "STOP", groundingMetadata: { groundingChunks: [{ web: { uri: "https://example.com/a", title: "A" } }] } }], usageMetadata: {} };
} } });
const researched = await runWithUsageContext("tester", "PF7", () => quiet(() => callLLMJSON("research-prototype", "research prompt", z.object({ by: z.string(), sources: z.array(z.object({ title: z.string(), url: z.string() })).optional() }), undefined, { webSearch: true })));
t("web search: Google Search tool on, no JSON mode", Array.isArray(seenConfig?.tools) && "googleSearch" in seenConfig.tools[0] && seenConfig.responseMimeType === undefined);
t("web search: JSON read from prose, pages read added as sources", researched?.by === "gemini-4-argon" && researched?.sources?.[0]?.url === "https://example.com/a", JSON.stringify(researched));
t("research has its own route: Gemini first, then Claude", providerOrder("research-prototype").join() === "gemini,claude");
restoreClient();

const statusOf = async (prompt: string) => runWithUsageContext("tester", "PF6", () => quiet(async () => { await callLLMJSON("generate-prototype-ui", prompt, schema); return currentAIStatus(); }));
restoreClient = setGeminiClientForTests(fakeGemini(ok));
await statusOf("cached prompt");
t("same request again: status says saved answer", (await statusOf("cached prompt"))?.outcome === "cache");
restoreClient();
delete process.env.GEMINI_API_KEY;
t("no key: status says no key", (await statusOf("no key prompt"))?.outcome === "offline-no-key");
(globalThis as any).setTimeout = realTimeout;

rmSync(dir, { recursive: true, force: true });

// Gemini service: regular API or Vertex, chosen by Google's own variable unless the app's setting overrides it
{
  const saved: Record<string, string | undefined> = {};
  const names = ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_LOCATION", "GOOGLE_GENAI_USE_VERTEXAI", "AI_GEMINI_BACKEND"];
  for (const n of names) { saved[n] = process.env[n]; delete process.env[n]; }
  const { geminiBackend, geminiAuth } = await import("../server/routing");
  process.env.GEMINI_API_KEY = "g1";
  t("default: the regular Gemini API with GEMINI_API_KEY", geminiBackend() === "api" && geminiAuth()?.apiKey === "g1" && geminiAuth()?.backend === "api");
  process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
  process.env.GOOGLE_API_KEY = "v1";
  process.env.GOOGLE_CLOUD_PROJECT = "proj-1";
  process.env.GOOGLE_CLOUD_LOCATION = "global";
  t("Google's variable switches to Vertex and uses the Vertex key", geminiBackend() === "vertex" && geminiAuth()?.backend === "vertex" && geminiAuth()?.apiKey === "v1");
  process.env.AI_GEMINI_BACKEND = "api";
  t("AI_GEMINI_BACKEND=api keeps the regular API even when the PC variable says Vertex", geminiBackend() === "api" && geminiAuth()?.apiKey === "g1");
  delete process.env.AI_GEMINI_BACKEND;
  delete process.env.GOOGLE_API_KEY;
  process.env.GEMINI_API_KEY = "regular-gemini-key";
  t("on Vertex a regular Gemini key is never used: the project sign-in is", JSON.stringify(geminiAuth()) === JSON.stringify({ backend: "vertex", project: "proj-1", location: "global" }), JSON.stringify(geminiAuth()));
  delete process.env.GEMINI_API_KEY;
  t("Vertex without a key signs in to the project with the PC's Google sign-in", JSON.stringify(geminiAuth()) === JSON.stringify({ backend: "vertex", project: "proj-1", location: "global" }), JSON.stringify(geminiAuth()));
  t("Vertex counts as configured with only a project", hasProviderKey("gemini"));
  const { geminiClientOptions } = await import("../server/geminiClient");
  const { GoogleGenAI } = await import("@google/genai");
  const vertexProject = geminiClientOptions(geminiAuth()!);
  t("client options: Vertex project mode", JSON.stringify(vertexProject) === JSON.stringify({ vertexai: true, project: "proj-1", location: "global" }));
  t("client options: the regular API says so explicitly", geminiClientOptions({ backend: "api", apiKey: "k" }).vertexai === false);
  const built = [vertexProject, geminiClientOptions({ backend: "vertex", apiKey: "k" }), geminiClientOptions({ backend: "api", apiKey: "k" })].map((o) => { try { return new GoogleGenAI(o as any); } catch (e) { return String(e); } });
  t("the Google library accepts every option set (a PC-wide Vertex variable does not break the regular API)", built.every((b) => typeof b !== "string") && (built[2] as any).vertexai === false && (built[1] as any).vertexai === true, built.filter((b) => typeof b === "string").join("; "));
  delete process.env.GOOGLE_CLOUD_PROJECT;
  process.env.GEMINI_API_KEY = "regular-gemini-key";
  t("on Vertex, a regular Gemini key alone is not a way to sign in", geminiAuth() === null);
  delete process.env.GEMINI_API_KEY;
  t("Vertex with nothing to sign in with is not configured", geminiAuth() === null && !hasProviderKey("gemini"));
  process.env.GOOGLE_API_KEY = "MY_GOOGLE_API_KEY";
  t("a placeholder Vertex key is ignored", geminiAuth() === null);
  for (const n of names) { if (saved[n] === undefined) delete process.env[n]; else process.env[n] = saved[n]; }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
