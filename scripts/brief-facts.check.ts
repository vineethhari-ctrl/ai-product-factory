/**
 * The BU's own words (problems, KPIs, rules, who does each stage) must reach the BRD and the prototype
 * design on the AI path too, not only on the offline engine. Run: npm run check:brief
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "brief-"));
process.env.DATA_DIR = dir;
process.env.AI_CACHE_DAYS = "0";
for (const k of ["AI_PROJECT_BUTTON_LIMIT", "AI_USER_BUTTON_LIMIT", "AI_USER_DAILY_TOKENS", "AI_MONTHLY_BUDGET_USD"]) process.env[k] = "0";
delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.GOOGLE_GENAI_USE_VERTEXAI;

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); };

const BRIEF = `Goal: One shared record per request, from first contact to close.

Journey: Intake → Review → Approval → Fulfilment → Closure

Who does what: clerks log intake, reviewers check review, managers approve approval, packers pack fulfilment and members confirm closure.

Stakeholders / parties: Clerks, Reviewers, Managers, Packers, Members

Pain points today: status is chased by phone; approvals take days; the same member is entered twice.

Rules: an intake needs a contact; approval above 500 needs a manager; closure needs member sign-off.

KPIs: intake-to-approval days, first-time-right rate, member satisfaction.

Integrations: Member register, Payment gateway.`;

(async () => {
  const { analyzeBusinessMaterial, generateProductDefinition } = await import("../server/aiReasoningService");
  const { BusinessUnderstandingSchema, ProductDefinitionSchema } = await import("../server/aiSchemas");
  const { setProviderForTests } = await import("../server/llmRouter");
  const quiet = async <T,>(f: () => Promise<T>): Promise<T> => { const l = console.log, w = console.warn; console.log = () => {}; if (!process.env.DEBUG) console.warn = () => {}; try { return await f(); } finally { console.log = l; console.warn = w; } };

  // A model answer that, like a real one, knows nothing about the parsed brief.
  const u0 = await quiet(() => analyzeBusinessMaterial([], "Request Desk", "Operations", BRIEF));
  const d0 = await quiet(() => generateProductDefinition(u0, "Request Desk", "Operations"));
  const { blueprintBrief: _b, ...uAnswer } = u0 as any;
  const { blueprintBrief: _c, problemStatement: _p, successMetrics: _s, ...dAnswer } = d0 as any;
  // The offline definition has system-added fields a model never writes; drop them so the stand-in fits the AI schema.
  dAnswer.dataEntities = dAnswer.dataEntities.map((e: any) => ({ ...e, fields: e.fields.filter((f: any) => f.origin !== "SYSTEM" && f.source !== "system").map(({ source: _s, ...f }: any) => f) }));
  const evidence = Object.entries(d0.evidenceMapping ?? {}).map(([topic, sources]) => ({ topic, sources }));

  process.env.GEMINI_API_KEY = "g";
  const restore = setProviderForTests("gemini", async (task) =>
    task === "analyze-material" ? BusinessUnderstandingSchema.parse({ ...uAnswer, inferredIndustry: "Operations" })
    : task === "generate-definition" ? ProductDefinitionSchema.parse({ ...dAnswer, evidenceMapping: evidence })
    : null);
  const u = await quiet(() => analyzeBusinessMaterial([], "Request Desk", "Operations", BRIEF));
  const d = await quiet(() => generateProductDefinition(u, "Request Desk", "Operations"));
  restore();
  // A model that does list its own problems keeps them.
  const restore2 = setProviderForTests("gemini", async (task) => (task === "generate-definition" ? ProductDefinitionSchema.parse({ ...dAnswer, problemStatement: ["Model's own item"], evidenceMapping: evidence }) : null));
  const d2 = await quiet(() => generateProductDefinition(u, "Request Desk", "Operations"));
  restore2();
  delete process.env.GEMINI_API_KEY;

  t("AI understanding carries the parsed brief", u.blueprintBrief?.stages.length === 5 && !!u.blueprintBrief?.goal, JSON.stringify(u.blueprintBrief));
  t("AI definition keeps the brief (stage owners reach the prototype design)", d.blueprintBrief?.stageOwners?.[2] === "Manager", JSON.stringify(d.blueprintBrief?.stageOwners));
  t("AI definition fills problems from the brief when the model left them out", d.problemStatement?.length === 3, JSON.stringify(d.problemStatement));
  t("AI definition fills KPIs from the brief when the model left them out", d.successMetrics?.length === 3, JSON.stringify(d.successMetrics));
  t("a model's own problem list is not overwritten", d2.problemStatement?.join() === "Model's own item", JSON.stringify(d2.problemStatement));
  rmSync(dir, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
