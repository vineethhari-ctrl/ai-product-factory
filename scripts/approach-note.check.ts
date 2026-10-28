/**
 * Solution Approach Note: written from the BRD, no fixed wording. Run: npm run check:approach
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "apn-"));
process.env.AI_CACHE_DAYS = "0";
for (const k of ["AI_PROJECT_BUTTON_LIMIT", "AI_USER_BUTTON_LIMIT", "AI_USER_DAILY_TOKENS", "AI_MONTHLY_BUDGET_USD"]) process.env[k] = "0";
delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.GOOGLE_GENAI_USE_VERTEXAI; delete process.env.AI_GEMINI_BACKEND;

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); };

const BRIEF = `Problems today: applicants keep calling to ask for status. Approvals take days because they go over email.

An applicant first submits a form, then the clerk checks the documents, then the manager approves, then the cashier releases the money.

A request cannot be approved without a complete document set. Amounts above 10000 must be approved by the manager. Money must not be released before approval.

We will track approval time, rework rate and applicant satisfaction.

It must talk to the core ledger, the identity service, and send SMS updates to applicants.`;

(async () => {
  const { analyzeBusinessMaterial, generateProductDefinition } = await import("../server/aiReasoningService");
  const { buildApproachNote, approachNoteText } = await import("../src/services/approachNote");
  const quiet = async <T,>(f: () => Promise<T>): Promise<T> => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await f(); } finally { console.log = l; console.warn = w; } };
  const u = await quiet(() => analyzeBusinessMaterial([], "Loan Desk", "Lending", BRIEF));
  const def = await quiet(() => generateProductDefinition(u, "Loan Desk", "Lending"));
  const n = buildApproachNote(def);
  const text = approachNoteText(def, n);

  t("problems are the BU's own, not assumptions", n.asIsProblemStatement.some((p) => /call|status|email|days/i.test(p)) && !n.asIsProblemStatement.some((p) => def.assumptions.some((a) => p === a.statement)), JSON.stringify(n.asIsProblemStatement));
  t("assumptions are listed separately", n.assumptions.length === def.assumptions.length);
  const covered = new Set(n.phasedExecutionStrategy.flatMap((p) => def.modules.filter((m) => p.focus.includes(m.name)).map((m) => m.name)));
  t("every module is in the roadmap", covered.size === def.modules.length, `${covered.size}/${def.modules.length}`);
  t("each phase names the screens it delivers", n.phasedExecutionStrategy.every((p) => p.delivers.length > 0));
  t("every integration lands in a phase", def.integrations.every((i) => n.phasedExecutionStrategy.some((p) => p.delivers.some((d) => d.includes(i.system)))));
  t("risks differ: no repeated boilerplate mitigation", new Set(n.keyRisksAndMitigations.map((r) => r.mitigation)).size === n.keyRisksAndMitigations.length && n.keyRisksAndMitigations.length >= 2);
  t("risks are not the open questions pasted in", !n.keyRisksAndMitigations.some((r) => def.openQuestions.some((q) => q.question === r.risk)));
  t("open questions become decisions with a team and a date", n.decisions.length === def.openQuestions.filter((q) => q.status === "open").length && n.decisions.every((d) => d.team && d.neededBy));
  t("the AI's own risks come first when the BRD has them", buildApproachNote({ ...def, risks: [{ risk: "R1", impact: "I1", mitigation: "M1" }] }).keyRisksAndMitigations[0].risk === "R1");
  t("a model's problem statement wins over the parsed brief", buildApproachNote({ ...def, problemStatement: ["Inferred: X goes wrong"] }).asIsProblemStatement[0] === "Inferred: X goes wrong");
  t("no problems stated: says so instead of inventing some", /not stated/i.test(buildApproachNote({ ...def, problemStatement: [], blueprintBrief: undefined }).asIsProblemStatement[0]));
  t("the copy text carries all seven parts", ["1. EXECUTIVE", "2. PROBLEMS", "4. PROPOSED", "5. PHASED", "6. RISKS", "7. DECISIONS"].every((h) => text.includes(h)));
  t("deterministic", JSON.stringify(buildApproachNote(def)) === JSON.stringify(buildApproachNote(def)));
  const src = readFileSync("src/services/approachNote.ts", "utf8");
  t("note code is domain-neutral", !/\b(vehicle|battery|loan|bank|dealer|claim|patient|invoice|warranty|policy)\b/i.test(src));
  // ── AI: a model's note, checked ──────────────────────────────────────────
  const { generateApproachNote } = await import("../server/approachNoteService");
  const { buildApproachPrompt } = await import("../server/approachPrompt");
  const { ApproachNoteSchema } = await import("../server/aiSchemas");
  const { setProviderForTests, AIUnavailableError } = await import("../server/llmRouter");
  const { providerOrder } = await import("../server/routing");
  const { testSuiteSignature } = await import("../src/services/testSuite");
  const { currentApproachNote } = await import("../src/services/approachNote");
  process.env.GEMINI_API_KEY = "g";
  const first = def.modules[0].name;
  const modelNote = ApproachNoteSchema.parse({
    executiveSummary: "A model-written summary.",
    problems: ["Inferred: status is unknown to applicants"],
    assumptions: ["Approvals above the limit go to the manager"],
    solution: ["One paragraph per module."],
    alternatives: [{ option: "Build or integrate the ledger", tradeoff: "Build is slower", recommendation: "Integrate; the core ledger exists" }],
    // Leaves every module but the first out of the roadmap.
    phases: [{ phase: "Phase 1", focus: `Build ${first}.`, timeline: "Sprint 1 - 3", delivers: ["A screen"], exitCriteria: ["Journey 1 passes"] }],
    risks: [{ risk: "R-model", impact: "I", mitigation: "M" }],
    recommendations: [{ ref: "Q1", recommendation: "Answer one" }, { ref: "Q99", recommendation: "Not a question" }],
  });
  const calls: Array<{ task: string; prompt: string }> = [];
  let restore = setProviderForTests("gemini", async (task, prompt) => { calls.push({ task, prompt }); return task === "generate-approach-note" ? modelNote : null; });
  const ai = await quiet(() => generateApproachNote(def));
  restore();
  t("a model is asked with the BRD's modules, rules and open questions in the prompt", calls[0]?.task === "generate-approach-note" && def.modules.every((m) => calls[0].prompt.includes(m.name)) && def.businessRules.every((r) => calls[0].prompt.includes(r.code)) && /Q1 \[/.test(calls[0].prompt));
  t("the model's note is used (origin AI), tied to this BRD", ai.origin === "AI" && ai.executiveSummary === "A model-written summary." && ai.basedOn === testSuiteSignature(def));
  t("the model's problems, options and risks replace the rules-based ones", ai.asIsProblemStatement[0].startsWith("Inferred:") && ai.alternatives.length === 1 && ai.keyRisksAndMitigations[0].risk === "R-model");
  t("modules the model left out are added by the server, and the note says so", def.modules.length < 2 || (ai.addedForCoverage?.length === def.modules.length - 1 && def.modules.slice(1).every((m) => ai.phasedExecutionStrategy.map((p) => p.focus).join(" ").includes(m.name))));
  t("recommendations attach to their own question; an unknown ref is ignored", ai.decisions[0]?.recommendation === "Answer one" && ai.decisions.slice(1).every((d) => !d.recommendation) && ai.decisions.length === n.decisions.length);
  t("team and date of each decision come from the server, not the model", ai.decisions.every((d) => d.team && d.neededBy.startsWith("Before Phase")));
  t("the stored note is shown for the BRD it was written for; a changed BRD falls back to rules", currentApproachNote({ ...def, approachNote: ai }).origin === "AI" && currentApproachNote({ ...def, version: "v9.9", approachNote: ai }).origin === "OFFLINE");
  t("the prompt is domain-neutral", !/\b(vehicle|dealer|hospital|patient|airline|battery|warranty|insurance|pharmacy|retail)\b/i.test(buildApproachPrompt(def)));
  t("Gemini first, Claude as backup", providerOrder("generate-approach-note").join(",") === "gemini,claude");
  restore = setProviderForTests("gemini", async () => null);
  let err: unknown; try { await quiet(() => generateApproachNote(def)); } catch (e) { err = e; }
  restore();
  t("keys set but every provider failed: AIUnavailableError (the browser keeps the old note and offers Retry)", err instanceof AIUnavailableError);
  restore = setProviderForTests("gemini", async (task) => (task === "generate-approach-note" ? ApproachNoteSchema.parse({ ...modelNote, phases: [], solution: [] }) : null));
  const empty = await quiet(() => generateApproachNote(def));
  restore();
  t("a model that wrote no phases and no solution: the rules-based note stands in", empty.origin === "OFFLINE");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
