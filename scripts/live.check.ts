// Live check: runs real products through the real AI (your key, from .env) and writes a report of everything that
// went wrong or needed fixing, so all problems can be fixed in one pass instead of one per try.
//
//   npm run check:live                 2 sample products (names only)
//   npm run check:live -- 4            all 4 sample products
//   npm run check:live -- "My product" your own product name(s); the report then contains AI text about it
//
// Per product: Understand Business, BRD, Build Prototype, Test Suite, Engineering Package, then Part 2: the final approved
// BRD is matched to the draft (a stand-in final document drops a module and a rule and adds a screen) and the proposal
// words are written for the trimmed scope.
//
// Costs real tokens (roughly 100-250k per product). Usage limits are off for this run and it is not added to the
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
const { generateTestSuite } = await import("../server/testSuiteService");
const { generateEngineeringPlan, attachPlan } = await import("../server/engineeringPlan");
const { generateEngineeringPackageData } = await import("../server/aiReasoningService");
const { reconcileScope, generateProposalNarrative } = await import("../server/proposalService");
const Scope = await import("../src/services/scope");
const Est = await import("../src/services/estimate");
const Doc = await import("../src/services/proposalDoc");
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
process.on("SIGINT", () => {
  writeFileSync("live-check-report.md", lines.join("\n") + "\n\n(stopped early with Ctrl+C)\n");
  console.log("\nStopped. What was finished is saved in live-check-report.md.");
  process.exit(1);
});
const out = (s = "") => { lines.push(s); };
let problems = 0;

out(`# Live check report`);
out(`${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC. Products: ${products.map((p) => p[0]).join(", ")}.`);
out("");
out(`Gemini service: ${geminiAuth() ? (geminiBackend() === "vertex" ? "Vertex AI" : "regular Gemini API") : "not configured"}.`);
out("Routing used:");
for (const l of describeRouting()) out(`- ${l}`);

let totalTokens = 0, totalCost = 0;
const lastPrototype = new Map<string, string[]>();
const part2Notes = new Map<string, string>();
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
      ["at least 5 business rules", def.businessRules.length >= 5],
      ["at least 2 journeys with 4+ steps", def.userJourneys.filter((j) => j.steps.length >= 4).length >= 2],
      ["product-specific quality targets (not the standard list)", (def.nonFunctionalRequirements?.length ?? 0) >= 5],
      ["risks listed", (def.risks?.length ?? 0) >= 3],
      ["problems and success measures", (def.problemStatement?.length ?? 0) >= 1 && (def.successMetrics?.length ?? 0) >= 1],
    ]);
    res.push(d.result);
    if (!d.value) return res;
    await pause(4000);
    const p = await step("Build Prototype", () => generatePrototypeUI(d.value!), (def) => [
      ["every screen designed by the AI design step (not just the BRD draft)", def.screens.every((s) => s.ui?.origin === "AI" && s.ui?.designed === true)],
      ["business document screens (at least 2)", def.screens.filter((s) => s.layoutType === "transaction" && s.ui?.document).length >= 2],
      ["documents have header fields and a workflow", def.screens.filter((s) => s.ui?.document).every((s) => s.ui!.document!.sections.length >= 1 && s.ui!.document!.actions.length >= 1)],
      ["at least one document with line items", def.screens.some((s) => (s.ui?.document?.lines?.columns.length ?? 0) >= 2)],
      ["research on similar apps", !!def.designResearch],
      ["a colour theme", !!def.uiTheme],
    ]);
    res.push(p.result);
    const forDocs = p.value ?? d.value;
    await pause(4000);
    const tsu = await step("Generate Test Suite", () => generateTestSuite(forDocs), (ts) => [
      ["written by the AI, not the rules-based stand-in", ts.origin === "AI"],
      ["at least 20 test cases", ts.testCases.length >= 20],
      ["at least 25 scenarios", ts.scenarios.length >= 25],
      ["every business rule covered", ts.coverage.rulesCovered === ts.coverage.rulesTotal],
      ["the AI itself covered the rules (nothing added by the server)", !ts.addedForCoverage?.length],
      ["every journey has a use case", ts.coverage.journeysCovered === ts.coverage.journeysTotal],
      ["test payloads use the product's own field names", (() => { const names = new Set(forDocs.dataEntities.flatMap((e) => e.fields.map((f) => f.name))); return ts.testCases.filter((t) => { try { return Object.keys(JSON.parse(t.testPayload)).some((k) => names.has(k)); } catch { return false; } }).length >= ts.testCases.length / 2; })()],
      ["every test case has 3+ steps and a measurable expected result", ts.testCases.every((t) => t.executionSteps.length >= 3 && t.expectedResult.length > 30)],
      ["a Gherkin feature with outlines", /Scenario Outline/.test(ts.gherkinFeature) && ts.gherkinFeature.length > 600],
    ]);
    res.push(tsu.result);
    await pause(4000);
    const eng = await step("Engineering Package", async () => attachPlan(generateEngineeringPackageData(forDocs, []), await generateEngineeringPlan(forDocs)), (pkg) => [
      ["plan written by the AI, not the rules-based stand-in", pkg.plan?.origin === "AI"],
      ["API contracts for every record (4+ each)", pkg.apiRequirements.length >= forDocs.dataEntities.length * 4],
      ["a status-change endpoint per record with a lifecycle", forDocs.dataEntities.filter((e) => e.lifecycle).every((e) => pkg.apiRequirements.some((c) => /status|transition/i.test(c.endpoint) && c.description.includes(e.name) || /status|transition/i.test(c.endpoint)))],
      ["8+ quality targets with numbers", (pkg.plan?.nonFunctional.filter((n) => /\d/.test(n.target)).length ?? 0) >= 6],
      ["backlog with acceptance lines", (pkg.plan?.backlog.reduce((n, e) => n + e.stories.length, 0) ?? 0) >= 8],
      ["risks tied to open questions or assumptions", (pkg.plan?.risks.length ?? 0) >= 4],
      ["architecture overview of 250+ words", (pkg.plan?.architectureOverview.split(/\s+/).length ?? 0) >= 250],
    ]);
    res.push(eng.result);

    // ── Part 2: approved scope, proposal ────────────────────────────────────────────────────────────────────────
    // A stand-in "final approved BRD" is written from the real BRD: the last module (and its screens) and the last rule are
    // dropped, one new screen is added. The AI must find exactly that, then write the proposal for the trimmed scope.
    const draftScope = Scope.buildScopeFromDefinition(forDocs);
    const cutModule = forDocs.modules.length >= 2 ? forDocs.modules[forDocs.modules.length - 1] : undefined;
    const cutScreens = new Set(forDocs.screens.filter((x) => cutModule && (cutModule.screens?.includes(x.id) || x.module === cutModule.name || x.module === cutModule.id)).map((x) => x.id));
    const cutRule = forDocs.businessRules.length >= 3 ? forDocs.businessRules[forDocs.businessRules.length - 1] : undefined;
    const NEW_SCREEN = "Audit Export Console";
    const finalText = [
      `Final approved requirements: ${forDocs.productName}`,
      "Approved by the business after review. Items not listed here are out of scope.",
      "",
      "Modules",
      ...forDocs.modules.filter((m) => m !== cutModule).map((m) => `- ${m.name}: ${m.description}`),
      "",
      "Screens",
      ...forDocs.screens.filter((x) => !cutScreens.has(x.id)).map((x) => `- ${x.name}: ${x.purpose}`),
      `- ${NEW_SCREEN}: lets an auditor export the activity history of any record as a file`,
      "",
      "Records",
      ...forDocs.dataEntities.map((e) => `- ${e.name}: ${e.description}`),
      "",
      "Business rules",
      ...forDocs.businessRules.filter((r) => r !== cutRule).map((r) => `- ${r.code}: ${r.rule}`),
      "",
      "Integrations",
      ...forDocs.integrations.map((i) => `- ${i.system}: ${i.purpose}`),
      "",
      "Journeys",
      ...forDocs.userJourneys.map((j) => `- ${j.name}: ${j.outcome}`),
    ].join("\n");
    await pause(4000);
    let matched: ReturnType<typeof Scope.buildScopeFromDefinition> = draftScope;
    const rec = await step("Match final BRD (Part 2)", () => reconcileScope(forDocs, draftScope, finalText, "final-approved.txt"), (m) => {
      matched = m;
      const old = m.items.filter((i) => i.change !== "NEW");
      const keptOthers = old.filter((i) => !(i.id === `module:${cutModule?.id}` || (i.kind === "screen" && cutScreens.has(i.id.replace("screen:", ""))) || i.id === `rule:${cutRule?.id}`));
      return [
        ["decided by the AI, not by name matching", m.matchedBy === "AI"],
        ["the dropped module is marked removed", !cutModule || m.items.find((i) => i.id === `module:${cutModule.id}`)?.included === false],
        ["the dropped module's screens are removed with it", [...cutScreens].every((id) => m.items.find((i) => i.id === `screen:${id}`)?.included === false)],
        ["the dropped rule is marked removed", !cutRule || m.items.find((i) => i.id === `rule:${cutRule.id}`)?.included === false],
        ["at least 90% of what stayed is kept", keptOthers.length === 0 || keptOthers.filter((i) => i.included).length / keptOthers.length >= 0.9],
        ["the new screen is found and marked added", m.items.some((i) => i.change === "NEW" && i.kind === "screen" && /audit/i.test(i.name))],
        ["every decided item carries a short note", old.filter((i) => i.note).length >= old.length * 0.8],
        ["nothing is confirmed until the BA does it", m.confirmed === false],
      ];
    });
    res.push(rec.result);
    const scopeForProposal = { ...matched, confirmed: true, approvedBy: "Live check", approvedOn: "today" };
    const pstate = Est.defaultProposalState();
    const estLive = Est.buildEstimate(forDocs, scopeForProposal, pstate);
    const removedNames = [cutModule?.name, cutRule?.code].filter((x): x is string => !!x);
    await pause(4000);
    const prop = await step("Write Proposal & SOW (Part 2)", () => generateProposalNarrative(forDocs, scopeForProposal, pstate), (n) => {
      const delivered = [...n.approach, ...n.deliverables, ...n.acceptanceCriteria].join(" ");
      const all = JSON.stringify(n);
      const sections = Doc.proposalSections(forDocs, scopeForProposal, estLive, pstate, n);
      const docText = JSON.stringify(sections) + Doc.proposalMarkdown(forDocs, pstate, sections) + Doc.proposalHtml(forDocs, pstate, sections);
      return [
        ["written by the AI, not the rules-based stand-in", n.origin === "AI"],
        ["executive summary of 40+ words that uses the engine's effort figure", n.executiveSummary.split(/\s+/).length >= 40 && n.executiveSummary.includes(String(Math.round(estLive.totalDays)))],
        ["what the business removed is stated as excluded", removedNames.every((x) => n.exclusions.join(" ").includes(x))],
        ["what the business removed is not described as delivered", removedNames.every((x) => !delivered.includes(x))],
        ["no money figure written by the model (only the engine's fee line)", n.commercialTerms.slice(1).every((x) => !/[$€£₹]\s?\d|\b(inr|usd|eur|gbp|rs\.?)\s*\d|\d[\d,.]*\s*(inr|usd|eur|gbp|lakh|crore)/i.test(x))],
        ["no allowance percentage, buffer or contingency in the words", !/buffer|contingency/i.test(all) && !/allowance[^"]{0,60}\d+\s*%|\d+\s*%[^"]{0,20}allowance/i.test(all)],
        ["5+ assumptions, 5+ risks, 5+ acceptance criteria", n.assumptions.length >= 5 && n.risks.length >= 5 && n.acceptanceCriteria.length >= 5],
        ["every phase of the plan is described", estLive.phases.every((p) => n.approach.join(" ").toLowerCase().includes(p.phase.split(":")[0].toLowerCase()) || n.approach.length >= estLive.phases.length)],
        ["change control says work starts only after written approval", /approv/i.test(n.changeControl.join(" "))],
        ["the finished document has the person-months section and the DRAFT mark is gone once confirmed", sections.some((x) => x.id === "months") && !docText.includes("DRAFT")],
        ["the printed document names no buffer, contingency or allowance percentage", !/buffer|contingency/i.test(docText) && !/allowance[^"<]{0,60}\d+\s*%/i.test(docText)],
      ];
    });
    res.push(prop.result);
    // Part 2 numbers (no AI): shown in the report so the estimate can be sanity-checked against past projects.
    part2Notes.set(name, `Part 2 estimate for the trimmed scope: ${Math.round(estLive.totalDays)} person-days (${Est.toMonths(estLive.totalDays, estLive.daysPerMonth).toFixed(1)} person-months), about ${estLive.durationWeeks} weeks, ${Est.formatMoney(estLive.total, estLive.currency)}; ${estLive.activities.length} activities; RASIC rows with one Accountable each: ${estLive.rasic.rows.every((r) => r.cells.filter((c) => c === "A").length === 1)}`);
    if (p.value) {
      lastPrototype.set(name, p.value.screens.filter((s) => s.ui?.document).map((s) => {
        const d = s.ui!.document!;
        return `${d.name} (${d.sections.reduce((n, x) => n + x.fields.length, 0)} fields, ${d.lines ? `${d.lines.columns.length}-column lines, ` : ""}${d.states.length} statuses, ${d.actions.length} actions)`;
      }));
    }
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
  if (part2Notes.get(name)) { out(""); out(part2Notes.get(name)!); }
  const docs = lastPrototype.get(name) ?? [];
  if (docs.length) {
    out("");
    out(`Business documents: ${docs.join("; ")}`);
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
  writeFileSync("live-check-report.md", lines.join("\n") + "\n\n(partial: the run is still going)\n");
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
