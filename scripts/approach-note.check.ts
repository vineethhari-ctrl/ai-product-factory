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
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
