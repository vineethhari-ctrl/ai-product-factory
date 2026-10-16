// Questions for two audiences: BU Team (plain business language) and BA & Tech Team (technical).
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "apf-questions-"));
process.env.DATA_DIR = dir;
delete process.env.GEMINI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

const qa = await import("../src/services/questionAudience");
const { analyzeBusinessMaterial, generateProductDefinition, generatePrototypeUI, generateEngineeringPackageData } = await import("../server/aiReasoningService");
const { setProviderForTests } = await import("../server/llmRouter");
const { BusinessUnderstandingSchema } = await import("../server/aiSchemas");

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); };
const quiet = async <T>(fn: () => Promise<T>) => { const w = console.warn, l = console.log; console.warn = console.log = () => {}; try { return await fn(); } finally { console.warn = w; console.log = l; } };

try {
  // Classifier
  for (const q of ["Which API endpoint returns the record?", "Should the data be stored in a separate database schema?", "What retry policy and timeouts apply?", "Is SSO with MFA required?", "Do we need a webhook or a message queue?"]) {
    t(`technical -> TECH: "${q}"`, qa.resolveAudience(q) === "TECH");
  }
  for (const q of ["Who approves a request and what happens when it is rejected?", "How many servers does a restaurant shift need?", "Which tenants of the building are notified?", "What treatment protocols apply to a new patient?", "How many containers are loaded per day?", "Which queue does a customer join first?", "When does the poll of members close?"]) {
    t(`business wording stays BU: "${q}"`, qa.resolveAudience(q) === "BU", qa.technicalTerms(q).join(","));
  }
  t("declared BU with jargon moves to TECH", qa.resolveAudience("Which REST endpoint is used?", "BU") === "TECH");
  t("declared TECH stays TECH", qa.resolveAudience("Who approves?", "TECH") === "TECH");

  const ctx = { subject: "Service Request", stages: ["Intake", "Review", "Closure"], role: "Coordinator", askedAt: "2026-01-01T00:00:00.000Z" };
  const bu = qa.defaultBUClarifications(ctx);
  t("default BU questions: at least 5, all BU, no technical terms", bu.length >= 5 && bu.every((c) => c.audience === "BU" && qa.technicalTerms(`${c.question} ${c.impactIfIgnored}`).length === 0),
    bu.map((c) => qa.technicalTerms(`${c.question} ${c.impactIfIgnored}`).join(",")).join(" | "));
  t("default BU questions use the BU's own nouns", bu.some((c) => c.question.includes("service request")) && bu.some((c) => c.question.includes("Intake to Closure")));
  const tech = qa.defaultTechClarifications({ ...ctx, module: "Core", productName: "Portal" });
  t("default tech questions are all TECH and technical", tech.every((c) => c.audience === "TECH" && qa.technicalTerms(c.question).length > 0));

  // Offline pipeline
  const u = await quiet(() => analyzeBusinessMaterial([], "Field Inspections Tracker", "Operations"));
  const cl = u.clarifications ?? [];
  t("offline: both audiences have questions", cl.some((c) => c.audience === "BU") && cl.some((c) => c.audience === "TECH"), cl.map((c) => c.audience).join(","));
  t("offline: every BU clarification is jargon-free", cl.filter((c) => c.audience === "BU").every((c) => qa.technicalTerms(`${c.question} ${c.impactIfIgnored}`).length === 0));
  t("offline: gaps and conflicts are labelled", [...u.missingInformation, ...u.conflicts].every((g) => g.audience === "BU" || g.audience === "TECH"));
  t("offline: clarification ids are unique", new Set(cl.map((c) => c.id)).size === cl.length);

  const d = await quiet(() => generateProductDefinition(u, "Field Inspections Tracker", "Operations"));
  t("definition: every open question labelled", d.openQuestions.length > 0 && d.openQuestions.every((q) => q.audience === "BU" || q.audience === "TECH"));
  t("definition: benchmark question goes to the BU", d.openQuestions.find((q) => q.id === "oq-benchmark-validation")?.audience === "BU");
  t("definition: constraint question goes to BA & Tech", d.openQuestions.find((q) => q.id === "oq-constraint-validation")?.audience === "TECH");
  const p = await quiet(() => generatePrototypeUI(d));
  t("prototype keeps the labels", p.openQuestions.every((q) => q.audience));

  const pkg = JSON.stringify(generateEngineeringPackageData(p, []));
  t("engineering package lists both teams' questions", pkg.includes("Open Questions for the BU Team") && pkg.includes("Open Questions for the BA & Tech Team"));

  // Older saved data without audiences is sorted on the fly
  const legacy: Array<{ question: string; audience?: "BU" | "TECH" }> = [{ question: "Which database stores it?" }, { question: "Who signs off?" }];
  t("forAudience labels old items", qa.forAudience(legacy, "TECH", (x) => x.question).length === 1 && qa.forAudience(legacy, "BU", (x) => x.question).length === 1);

  // LLM path: a model that files a technical question under BU is corrected
  process.env.GEMINI_API_KEY = "test-key-not-used";
  const stubbed = BusinessUnderstandingSchema.parse({
    ...u,
    inferredIndustry: "Stub industry",
    overallSummary: "Stub summary",
    clarifications: [
      { audience: "BU", type: "HIGH: MISSING LOGIC", question: "Which API should send the record to the finance team?", impactIfIgnored: "The integration contract cannot be designed." },
      { audience: "BU", type: "HIGH: MISSING LOGIC", question: "Who signs off a completed record?", impactIfIgnored: "The JSON payload cannot be finalised." },
      { audience: "TECH", type: "MEDIUM: PERMISSION GAP", question: "Which identity provider is used?", impactIfIgnored: "Login cannot be built." },
    ],
  });
  const restore = setProviderForTests("gemini", async () => stubbed);
  try {
    const ai = await quiet(() => analyzeBusinessMaterial([], "Stub Product", "Stub Unit", "llm path"));
    const c = ai.clarifications ?? [];
    t("LLM: BU question with jargon moved to TECH", c.find((x) => x.question.startsWith("Which API"))?.audience === "TECH");
    const signOff = c.find((x) => x.question.startsWith("Who signs off"));
    t("LLM: plain BU question stays BU, its jargon impact is reworded", signOff?.audience === "BU" && qa.technicalTerms(signOff.impactIfIgnored).length === 0, signOff?.impactIfIgnored);
    t("LLM: declared TECH stays TECH", c.find((x) => x.question.startsWith("Which identity"))?.audience === "TECH");
    t("LLM: model questions kept, no defaults added when both teams have some", c.length === 3, String(c.length));
  } finally {
    restore();
    delete process.env.GEMINI_API_KEY;
  }

  // Domain neutrality: no business-domain words in the question code
  const code = ["src/services/questionAudience.ts", "server/questions.ts"].map((f) => readFileSync(f, "utf8")).join("\n");
  const banned = /\b(genset|vehicle|patient|hospital|bank|loan|insurance|policyholder|warranty|dealer|invoice|shipment|freight|student|retail)\b/i;
  t("question code is domain-neutral", !banned.test(code), code.match(banned)?.[0]);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
