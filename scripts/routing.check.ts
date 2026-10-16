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
const { callLLMJSON, setProviderForTests } = await import("../server/llmRouter");
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
t("start-up log names the models and marks missing keys", lines.some((l) => l === "generate-definition: claude-sonnet-5-5 -> (gemini-3.1-pro-preview: no key) -> (gemini-3.6-flash: no key) -> offline engine"), lines.join(" | "));
t("calls that billed no tokens are not counted", usageReport("tester", "P0").team.monthClicks === 0); // stubs report no tokens
delete process.env.ANTHROPIC_API_KEY;

// Placeholder keys copied from .env.example count as no key
process.env.GEMINI_API_KEY = "MY_GEMINI_API_KEY";
t("placeholder Gemini key is treated as no key", !hasProviderKey("gemini"));
process.env.GEMINI_API_KEY = '"AIzaReal123"';
t("a real key (even quoted) is used", hasProviderKey("gemini"));
delete process.env.GEMINI_API_KEY;

// Second Gemini model
t("Pro routes fall back to Flash", geminiModels("generate-prototype-ui").join() === "gemini-3.1-pro-preview,gemini-3.6-flash");
t("Flash route falls back to Pro", geminiModels("analyze-change").join() === "gemini-3.6-flash,gemini-3.1-pro-preview");
process.env.AI_GEMINI_MODEL_ANALYZE_MATERIAL = "gemini-3.6-flash";
t("an overridden model is not tried twice", geminiModels("analyze-material").join() === "gemini-3.6-flash");
delete process.env.AI_GEMINI_MODEL_ANALYZE_MATERIAL;
process.env.AI_GEMINI_FALLBACK_GENERATE_DEFINITION = "none";
t("fallback can be switched off", geminiModels("generate-definition").join() === "gemini-3.1-pro-preview");
process.env.AI_GEMINI_FALLBACK_GENERATE_DEFINITION = "gemini-a, gemini-b";
t("fallback override", geminiModels("generate-definition").join() === "gemini-3.1-pro-preview,gemini-a,gemini-b");
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

let restoreClient = setGeminiClientForTests(fakeGemini((m) => (m.includes("pro") ? busy() : ok(m))));
const viaFlash = await runWithUsageContext("tester", "PF1", () => quiet(async () => ({ r: await callLLMJSON("generate-prototype-ui", "fallback prompt 1", schema), s: currentAIStatus() })));
t("Pro busy (3 tries) -> Flash answers", viaFlash.r?.by === "gemini-3.6-flash" && tried.join() === "gemini-3.1-pro-preview,gemini-3.1-pro-preview,gemini-3.1-pro-preview,gemini-3.6-flash", tried.join());
t("status says the AI answered, with the model", viaFlash.s?.outcome === "ai" && viaFlash.s.model === "gemini-3.6-flash", JSON.stringify(viaFlash.s));
restoreClient();

tried.length = 0;
restoreClient = setGeminiClientForTests(fakeGemini(() => busy()));
const allBusy = await runWithUsageContext("tester", "PF2", () => quiet(async () => ({ r: await callLLMJSON("generate-prototype-ui", "fallback prompt 2", schema), s: currentAIStatus() })));
t("both models busy: offline engine, status explains why", allBusy.r === null && allBusy.s?.outcome === "offline-failed" && allBusy.s.failures?.length === 2 && allBusy.s.failures.every((f) => f.kind === "busy"), JSON.stringify(allBusy.s));
t("status names the button", allBusy.s?.button === "Build Prototype");
restoreClient();

tried.length = 0;
restoreClient = setGeminiClientForTests(fakeGemini(() => { throw Object.assign(new Error("API key not valid"), { status: 400 }); }));
const badKey = await runWithUsageContext("tester", "PF3", () => quiet(() => callGeminiJSON("generate-prototype-ui", "p", schema)));
t("rejected key: the second model is not tried", badKey === null && tried.length === 1);
restoreClient();

tried.length = 0;
restoreClient = setGeminiClientForTests(fakeGemini((m) => (m.includes("pro") ? { text: "", candidates: [{ finishReason: "MAX_TOKENS" }], usageMetadata: {} } : ok(m))));
const cut = await runWithUsageContext("tester", "PF4", () => quiet(() => callGeminiJSON("generate-prototype-ui", "p", schema)));
t("cut-off answer: the second model is tried", cut?.by === "gemini-3.6-flash" && tried.length === 2);
restoreClient();

tried.length = 0;
let seenContents: unknown;
restoreClient = setGeminiClientForTests({ models: { generateContent: async (req: { model: string; contents: unknown }) => { seenContents = req.contents; return ok(req.model); } } });
await runWithUsageContext("tester", "PF5", () => quiet(() => callLLMJSON("generate-prototype-ui", "with image", schema, undefined, { images: [{ mimeType: "image/png", data: "iVBORw0KGgo=" }] })));
const parts = (seenContents as any)?.[0]?.parts;
t("reference image is sent to Gemini before the prompt", Array.isArray(parts) && parts[0]?.inlineData?.mimeType === "image/png" && parts[1]?.text === "with image");
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
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
