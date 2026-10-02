// Per-task model routing: default order, .env overrides, per-model parameters, and the router's order.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";

const dir = mkdtempSync(path.join(tmpdir(), "apf-routing-"));
process.env.DATA_DIR = dir;
process.env.AI_MONTHLY_BUDGET_USD = "0";
for (const k of Object.keys(process.env)) if (/^AI_(ORDER|CLAUDE_MODEL|GEMINI_MODEL)_/.test(k)) delete process.env[k];

const { providerOrder, claudeRoute, geminiRoute, describeRouting } = await import("../server/routing");
const { callLLMJSON, setProviderForTests } = await import("../server/llmRouter");
const { runWithUsageContext, usageReport } = await import("../server/usage");

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
t("start-up log names the models and marks missing keys", lines.some((l) => l === "generate-definition: claude-sonnet-5-5 -> (gemini-3.1-pro-preview: no key) -> offline engine"), lines.join(" | "));
t("calls that billed no tokens are not counted", usageReport("tester", "P0").team.monthClicks === 0); // stubs report no tokens
delete process.env.ANTHROPIC_API_KEY;

rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
