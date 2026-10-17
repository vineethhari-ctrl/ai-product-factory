// Live check: runs real products through the real AI (your key, from .env) and writes a report of everything that
// went wrong or needed fixing, so all problems can be fixed in one pass instead of one per try.
//
//   npm run check:live                 2 sample products (names only)
//   npm run check:live -- 4            all 4 sample products
//   npm run check:live -- "My product" your own product name(s); the report then contains AI text about it
//
// Costs real tokens (roughly 50-150k per product). Usage limits are off for this run and it is not added to the
// team's usage log. The report is written to live-check-report.md (not committed to git).
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "apf-live-"));
// Set before .env is read: .env never overrides values already set.
process.env.DATA_DIR = dir;
for (const k of ["AI_PROJECT_BUTTON_LIMIT", "AI_USER_BUTTON_LIMIT", "AI_USER_DAILY_TOKENS", "AI_MONTHLY_BUDGET_USD"]) process.env[k] = "0";
process.env.AI_OFFLINE_ON_FAILURE = "false";
await import("dotenv/config");

const { describeRouting, hasProviderKey, geminiBackend, geminiAuth } = await import("../server/routing");
const { analyzeBusinessMaterial, generateProductDefinition, generatePrototypeUI } = await import("../server/aiReasoningService");
const { AIUnavailableError } = await import("../server/llmRouter");
const { runWithUsageContext, currentAICalls, usageReport } = await import("../server/usage");
type AIStatus = ReturnType<typeof currentAICalls>[number];

const SAMPLES: Array<[string, string]> = [
  ["Field Inspection Tracker", "Operations"],
  ["Volunteer Shift Planner", "Community Programs"],
  ["Spare Parts Ordering Portal", "After-Sales"],
  ["Customer Onboarding Desk", "Retail Banking"],
];

const args = process.argv.slice(2);
const count = Number(args.find((a) => /^\d+$/.test(a)) ?? 2);
const named = args.filter((a) => !/^\d+$/.test(a)).map((n): [string, string] => [n, "Business Unit"]);
const products = named.length ? named : SAMPLES.slice(0, Math.max(1, Math.min(count, SAMPLES.length)));

if (!hasProviderKey("gemini") && !hasProviderKey("claude")) {
  console.error("No AI key found. Put GEMINI_API_KEY (or ANTHROPIC_API_KEY) in the .env file in this folder, then run again.");
  process.exit(1);
}

interface StepResult {
  step: string;
  ok: boolean;
  seconds: number;
  calls: AIStatus[];
  error?: string;
  checks: Array<[string, boolean]>;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function step<T>(name: string, fn: () => Promise<T>, check: (r: T) => Array<[string, boolean]>): Promise<{ result: StepResult; value: T | null }> {
  const started = Date.now();
  const before = currentAICalls().length;
  let value: T | null = null;
  let error: string | undefined;
  try {
    value = await fn();
  } catch (e) {
    error = e instanceof AIUnavailableError ? e.message : `${(e as Error)?.name ?? "Error"}: ${(e as Error)?.message ?? e}`;
  }
  const calls = currentAICalls().slice(before);
  const checks = value ? check(value) : [];
  return { result: { step: name, ok: !error && checks.every(([, ok]) => ok), seconds: Math.round((Date.now() - started) / 1000), calls, error, checks }, value };
}

const lines: string[] = [];
const out = (s = "") => { lines.push(s); };
let problems = 0;

out(`# Live check report`);
out(`${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC. Products: ${products.map((p) => p[0]).join(", ")}.`);
out("");
out(`Gemini service: ${geminiAuth() ? (geminiBackend() === "vertex" ? "Vertex AI" : "regular Gemini API") : "not configured"}.`);
out("Routing used:");
for (const l of describeRouting()) out(`- ${l}`);

let totalTokens = 0, totalCost = 0;
for (const [i, [name, bu]] of products.entries()) {
  const user = `live-check-${i + 1}`, project = `live-${i + 1}`;
  console.log(`\n=== ${name} (${bu}) ===`);
  const results = await runWithUsageContext(user, project, async () => {
    const res: StepResult[] = [];
    const a = await step("Understand Business", () => analyzeBusinessMaterial([], name, bu, ""), (u) => [
      ["at least 2 users", u.personas.length >= 2],
      ["at least 3 screens", u.screens.length >= 3],
      ["questions for both teams", ["BU", "TECH"].every((x) => (u.clarifications ?? []).some((c) => c.audience === x))],
    ]);
    res.push(a.result);
    if (!a.value) return res;
    await pause(4000);
    const d = await step("Generate BRD", () => generateProductDefinition(a.value!, name, bu, "v1.0"), (def) => [
      ["at least 4 screens", def.screens.length >= 4],
      ["records with fields", def.dataEntities.length >= 1 && def.dataEntities.every((e) => e.fields.length >= 2)],
      ["every screen has a design", def.screens.every((s) => !!s.ui)],
      ["open questions labelled for a team", def.openQuestions.every((q) => q.audience === "BU" || q.audience === "TECH")],
    ]);
    res.push(d.result);
    if (!d.value) return res;
    await pause(4000);
    const p = await step("Build Prototype", () => generatePrototypeUI(d.value!), (def) => [
      ["every screen designed by the AI", def.screens.every((s) => s.ui?.origin === "AI")],
      ["research on similar apps", !!def.designResearch],
      ["a colour theme", !!def.uiTheme],
    ]);
    res.push(p.result);
    return res;
  });
  const usage = usageReport(user, project).me;
  totalTokens += usage.tokensUsed;
  totalCost += usage.costUsd;

  out("");
  out(`## ${name} (${bu})`);
  out(`Tokens: ${usage.tokensUsed.toLocaleString("en-US")} (about $${usage.costUsd.toFixed(2)})`);
  out("");
  out("| Step | Result | Took | AI calls |");
  out("|---|---|---|---|");
  for (const r of results) {
    if (!r.ok) problems++;
    const calls = r.calls.map((c) => `${c.task}: ${c.outcome}${c.model ? ` (${c.model})` : ""}${c.corrected ? ", corrected" : ""}${c.repairs?.length ? `, ${c.repairs.length} fixes` : ""}`).join("; ");
    out(`| ${r.step} | ${r.error ? "FAILED" : r.ok ? "ok" : "ok, but checks failed"} | ${r.seconds}s | ${calls || "-"} |`);
  }
  for (const r of results) {
    const failedChecks = r.checks.filter(([, ok]) => !ok).map(([c]) => c);
    const failures = r.calls.flatMap((c) => c.failures ?? []);
    const repairs = r.calls.flatMap((c) => (c.repairs ?? []).map((x) => `${c.task}: ${x}`));
    if (!r.error && !failedChecks.length && !failures.length && !repairs.length) continue;
    out("");
    out(`**${r.step}**`);
    if (r.error) out(`- Error: ${r.error}`);
    for (const c of failedChecks) out(`- Check failed: ${c}`);
    for (const f of failures) out(`- ${f.message} [${f.kind}]`);
    for (const x of repairs.slice(0, 25)) out(`- Fixed: ${x}`);
    if (repairs.length > 25) out(`- ... ${repairs.length - 25} more fixes`);
  }
  if (i < products.length - 1) await pause(8000);
}

out("");
out(`## Summary`);
out(`${problems === 0 ? "All steps worked." : `${problems} step(s) failed or did not pass their checks.`} Total tokens ${totalTokens.toLocaleString("en-US")} (about $${totalCost.toFixed(2)} at list prices).`);

const report = lines.join("\n") + "\n";
writeFileSync("live-check-report.md", report);
rmSync(dir, { recursive: true, force: true });
console.log("\n" + report);
console.log("Report saved to live-check-report.md in this folder.");
process.exit(problems ? 1 : 0);
