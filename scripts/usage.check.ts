// AI usage control: limits, budget, cache, metering and the report. No real provider is called.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";

const dir = mkdtempSync(path.join(tmpdir(), "apf-usage-"));
process.env.DATA_DIR = dir;
Object.assign(process.env, { AI_PROJECT_BUTTON_LIMIT: "3", AI_USER_BUTTON_LIMIT: "3", AI_USER_DAILY_TOKENS: "100000", AI_MONTHLY_BUDGET_USD: "5" });

const usage = await import("../server/usage");
const { callLLMJSON } = await import("../server/llmRouter");
const { runWithUsageContext: as, beginAICall, recordTokens, endAICall, currentNotices, usageReport, blockedReason, cacheKey, writeCache, priceFor } = usage;

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); };
const quiet = async <T>(fn: () => Promise<T>) => { const w = console.warn, l = console.log; console.warn = console.log = () => {}; try { return await fn(); } finally { console.warn = w; console.log = l; } };
/** One metered AI call with the given tokens, as the router and a provider would record it. */
const spend = (user: string, project: string, task: any, inTok: number, outTok: number, model = "gemini-3.1-pro-preview") =>
  as(user, project, async () => { const ok = beginAICall(task); if (ok) { recordTokens(task, model, inTok, outTok); endAICall(task, true); } return { ok, notices: [...currentNotices()] }; });

// Metering and cost
const first = await spend("Asha@Team", "P1", "generate-definition", 10_000, 20_000);
t("a call is allowed and reports its tokens", first.ok && /30,000 AI tokens/.test(first.notices[0] ?? ""), first.notices.join("|"));
t("users are case-insensitive", usageReport("asha@team", "P1").me.tokensUsed === 30_000);
t("cost uses the model's price", Math.abs(usageReport("asha@team", "P1").me.costUsd - (10_000 * priceFor("gemini-3.1-pro-preview")[0] + 20_000 * priceFor("gemini-3.1-pro-preview")[1]) / 1e6) < 1e-9);
process.env.AI_PRICE_TEST_MODEL = "1,2";
t("price override from env", JSON.stringify(priceFor("test-model")) === "[1,2]");

// Per-project limit: 3 per button per 24h, whoever clicks
await spend("ben", "P1", "generate-definition", 100, 100);
await spend("cy", "P1", "generate-definition", 100, 100);
const p4 = await spend("dee", "P1", "generate-definition", 100, 100);
t("4th use of a button on one project is blocked, even by another BA", !p4.ok && /for this project/.test(p4.notices[0] ?? ""), p4.notices.join("|"));
t("blocked message says it ran offline and when it resets", /produced offline \(free\)/.test(p4.notices[0]) && /next AI use from \d{4}-\d\d-\d\d \d\d:\d\d UTC/.test(p4.notices[0]));
t("other buttons on that project are unaffected", (await spend("dee", "P1", "analyze-change", 100, 100)).ok);

// Per-user limit: 3 per button per 24h across projects
await spend("eve", "A", "analyze-material", 100, 100);
await spend("eve", "B", "analyze-material", 100, 100);
await spend("eve", "C", "analyze-material", 100, 100);
const u4 = await spend("eve", "D", "analyze-material", 100, 100);
t("4th use of a button by one BA is blocked across projects", !u4.ok && /You have used "Understand Business" 3 of 3/.test(u4.notices[0] ?? ""), u4.notices.join("|"));
t("blocked calls are not counted", usageReport("eve", "D").buttons.find((b) => b.task === "analyze-material")!.user.used === 3);

// Daily tokens per user
await spend("fay", "F1", "analyze-material", 60_000, 50_000);
const tok = await spend("fay", "F2", "generate-prototype-ui", 10, 10);
t("daily token allowance blocks further AI use", !tok.ok && /AI tokens for the last 24 hours/.test(tok.notices[0] ?? ""), tok.notices.join("|"));
t("report shows tokens left as zero", usageReport("fay", "F2").me.tokensLeft === 0);

// Rolling 24h: old clicks no longer count
t("limits are a rolling 24 hours", blockedReason("analyze-material", "eve", "Z", Date.now() + 86_400_001) === null);

// A call that never reached a provider costs nothing and is not counted
await as("gus", "G", async () => { beginAICall("analyze-material"); endAICall("analyze-material", false); });
t("a failed call with no tokens is not counted", usageReport("gus", "G").buttons.every((b) => b.user.used === 0));

// Monthly budget caps the team
await spend("hal", "H", "generate-definition", 400_000, 400_000);
const over = await spend("ivy", "I", "analyze-change", 10, 10);
t("monthly budget stops all AI calls", !over.ok && /monthly AI budget of \$5.00/.test(over.notices[0] ?? ""), over.notices.join("|"));
const rep = usageReport("ivy", "I");
t("team report: month cost, budget left, by user", rep.team.monthCostUsd > 5 && rep.team.budgetLeftUsd === 0 && rep.team.byUser[0].user === "hal" && rep.team.byDay.length >= 1);
process.env.AI_MONTHLY_BUDGET_USD = "0";
t("budget 0 means no cap", blockedReason("analyze-change", "ivy", "I") === null);

// Router: no provider key -> nothing is cached, metered or limited
const schema = z.object({ answer: z.string() });
delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY;
const before = usageReport("jo", "J").team.monthClicks;
t("no key: router returns null without metering", (await quiet(() => as("jo", "J", () => callLLMJSON("analyze-change", "p", schema)))) === null && usageReport("jo", "J").team.monthClicks === before);

// Router with a key: the cache answers identical requests for free, without reaching any provider
process.env.GEMINI_API_KEY = "test-key-not-used";
writeCache(cacheKey("analyze-change", "same prompt"), { answer: "saved" });
const hit = await as("kim", "K", async () => ({ r: await callLLMJSON("analyze-change", "same prompt", schema), n: [...currentNotices()] }));
t("cache hit returns the saved result", hit.r?.answer === "saved");
t("cache hit is announced and not counted", /reused \(free, not counted\)/.test(hit.n.join("")) && usageReport("kim", "K").buttons.every((b) => b.user.used === 0) && usageReport("kim", "K").me.cacheHits === 1);
t("a different prompt is not a cache hit", cacheKey("analyze-change", "same prompt") !== cacheKey("analyze-change", "same prompt!") && cacheKey("analyze-change", "x") !== cacheKey("generate-definition", "x"));

// Router with a key, over a limit: answers null (offline) without calling any provider
for (let i = 0; i < 3; i++) await spend("lee", "L", "generate-definition", 10, 10);
const lim = await as("lee", "L2", async () => ({ r: await callLLMJSON("generate-definition", "new prompt", schema), n: [...currentNotices()] }));
t("router over a limit returns null for the offline engine", lim.r === null && /produced offline/.test(lim.n.join("")), lim.n.join("|"));

// Persistence: a restart keeps the counts
usage.resetUsageStoreForTests();
t("usage survives a restart", usageReport("asha@team", "P1").me.tokensUsed === 30_000);

rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
