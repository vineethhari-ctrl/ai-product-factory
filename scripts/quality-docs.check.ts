/**
 * Test suite and engineering plan: derived from the BRD (not generic templates), written by a model when one is
 * configured, with coverage guaranteed and fallbacks. Run: npm run check:docs
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "docs-"));
process.env.DATA_DIR = dir;
process.env.AI_CACHE_DAYS = "0";
for (const k of ["AI_PROJECT_BUTTON_LIMIT", "AI_USER_BUTTON_LIMIT", "AI_USER_DAILY_TOKENS", "AI_MONTHLY_BUDGET_USD"]) process.env[k] = "0";
for (const k of Object.keys(process.env)) if (/^AI_(ORDER|CLAUDE_MODEL|GEMINI_MODEL|GEMINI_FALLBACK)_/.test(k)) delete process.env[k];
delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.GOOGLE_GENAI_USE_VERTEXAI; delete process.env.AI_GEMINI_BACKEND; delete process.env.GOOGLE_CLOUD_PROJECT; delete process.env.GOOGLE_API_KEY;

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); };

const BRIEF = `Hi team,

We want one place to follow every loan request, because today nobody knows where a request is. An applicant first submits a form, then the clerk checks the documents, then the officer assesses the risk, then the manager approves the amount, then the cashier releases the money and later the auditor reviews the file.

Problems today: applicants keep calling to ask for status. Approvals take days because they go over email.

A request cannot be approved without a complete document set. Amounts above 10000 must be approved by the manager. Money must not be released before approval. Every file has to be reviewed within 30 days.

We will track approval time, rework rate and applicant satisfaction.

It must talk to the core ledger, the identity service, and send SMS updates to applicants.`;

(async () => {
  const { analyzeBusinessMaterial, generateProductDefinition, generateEngineeringPackageData } = await import("../server/aiReasoningService");
  const { generateTestSuite } = await import("../server/testSuiteService");
  const { generateEngineeringPlan, attachPlan, buildApiContracts, buildEngineeringPlan } = await import("../server/engineeringPlan");
  const { buildTestSuite, ensureCoverage } = await import("../src/services/testSuite");
  const { TestSuiteSchema, EngineeringPlanSchema } = await import("../server/aiSchemas");
  const { setProviderForTests, AIUnavailableError } = await import("../server/llmRouter");
  const { providerOrder } = await import("../server/routing");
  const { buildTestPrompt } = await import("../server/testPrompt");
  const { buildEngineeringPrompt } = await import("../server/engineeringPrompt");
  const quiet = async <T,>(f: () => Promise<T>): Promise<T> => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await f(); } finally { console.log = l; console.warn = w; } };

  const u = await quiet(() => analyzeBusinessMaterial([], "Loan Desk", "Lending", BRIEF));
  const def = await quiet(() => generateProductDefinition(u, "Loan Desk", "Lending"));
  const codes = def.businessRules.map((r) => r.code);

  // ── Offline: derived from the BRD, not generic templates ─────────────────
  const off = await quiet(() => generateTestSuite(def));
  t("no key: the rules-based suite answers", off.origin === "OFFLINE" && off.testCases.length >= 12, `${off.testCases.length}`);
  t("every business rule has a scenario and a test case", off.coverage.rulesCovered === off.coverage.rulesTotal && off.coverage.rulesTotal > 0, JSON.stringify(off.coverage));
  t("every journey has a use case; every record is touched by a test", off.coverage.journeysCovered === off.coverage.journeysTotal && off.coverage.entitiesCovered === off.coverage.entitiesTotal, JSON.stringify(off.coverage));
  const text = JSON.stringify(off);
  const fieldNames = def.dataEntities.flatMap((e) => e.fields.filter((f) => f.source !== "system" && f.required).map((f) => f.name));
  t("tests use the product's own rule text and record fields", def.businessRules.every((r) => text.includes(r.rule.slice(0, 30).replace(/"/g, '\\"'))) && fieldNames.some((f) => text.includes(`\\"${f}\\"`)), fieldNames.join());
  t("no leftover generic template tests (offline queue, bearer token, packet burst)", !/offline queue|bearer|packet|chaos/i.test(text));
  t("the Gherkin feature carries rule codes, a lifecycle outline and field limits", off.gherkinFeature.includes(`@${codes[0].toLowerCase()}`) && /Scenario Outline: .* status changes/.test(off.gherkinFeature) && /field limits/.test(off.gherkinFeature));
  t("every payload is valid JSON", off.testCases.every((c) => { try { JSON.parse(c.testPayload); return true; } catch { return false; } }));
  t("a rule test does not pretend to break the rule with a made-up payload: it tells the tester to arrange the condition", off.testCases.filter((c) => c.vector === "NEGATIVE" && c.traces?.some((x) => codes.includes(x))).every((c) => c.executionSteps.some((s) => /Arrange the condition/.test(s))));
  t("deterministic: the same BRD gives the same suite", JSON.stringify({ ...buildTestSuite(def), generatedAt: "" }) === JSON.stringify({ ...buildTestSuite(def), generatedAt: "" }));

  // ── AI: a model's suite, checked ─────────────────────────────────────────
  process.env.GEMINI_API_KEY = "g";
  const base = buildTestSuite(def);
  const modelAnswer = TestSuiteSchema.parse({
    useCases: base.useCases.slice(0, 2),
    // Leaves most rules uncovered, invents a rule code, and writes a payload that is not JSON.
    scenarios: [{ ...base.scenarios[0], ruleCode: codes[0] }, { ...base.scenarios[1], ruleCode: "BR-999" }, { ...base.scenarios[2], ruleCode: "ACCESS" }],
    testCases: [{ ...base.testCases[0], testPayload: "not json at all", traces: [codes[0]] }, { ...base.testCases[1] }],
    gherkinFeature: "Feature: model feature\n  Scenario: one",
  });
  const calls: Array<{ task: string; prompt: string }> = [];
  let restore = setProviderForTests("gemini", async (task, prompt) => { calls.push({ task, prompt }); return task === "generate-test-suite" ? modelAnswer : null; });
  const ai = await quiet(() => generateTestSuite(def));
  restore();
  t("a model is asked with the BRD's rule codes and fields in the prompt", calls[0]?.task === "generate-test-suite" && codes.every((c) => calls[0].prompt.includes(c)) && calls[0].prompt.includes(def.dataEntities[0].name));
  t("the model's suite is used (origin AI) and ids are renumbered", ai.origin === "AI" && ai.useCases[0].id === "UC-001" && ai.scenarios[0].id === "SCN-001" && ai.testCases[0].id === "TC-001");
  t("an invented rule code is not evidence for any rule", ai.scenarios.every((s) => !["BR-999"].includes(s.ruleCode)) && ai.scenarios[1].ruleCode === "GENERAL");
  t("a payload that is not JSON is repaired", ai.testCases.every((c) => { try { JSON.parse(c.testPayload); return true; } catch { return false; } }));
  t("rules the model left untested are covered by the server, and the suite says which", (ai.addedForCoverage?.length ?? 0) > 0 && ai.coverage.rulesCovered === ai.coverage.rulesTotal, JSON.stringify(ai.coverage));
  t("ensureCoverage on a complete suite adds nothing", !ensureCoverage(def, base).addedForCoverage);
  const words = /\b(vehicle|dealer|hospital|patient|airline|battery|warranty|insurance|pharmacy|retail)\b/i;
  t("both prompts are domain-neutral: nothing but the BRD's own words", !words.test(buildTestPrompt(def)) && !words.test(buildEngineeringPrompt(def)));

  restore = setProviderForTests("gemini", async () => null);
  let err: unknown; try { await quiet(() => generateTestSuite(def)); } catch (e) { err = e; }
  restore();
  t("keys set but every provider failed: AIUnavailableError (the browser keeps the old result and offers Retry)", err instanceof AIUnavailableError);
  restore = setProviderForTests("gemini", async (task) => (task === "generate-test-suite" ? TestSuiteSchema.parse({ ...modelAnswer, testCases: [] }) : null));
  const empty = await quiet(() => generateTestSuite(def));
  restore();
  t("a model that wrote no test cases at all: the rules-based suite stands in", empty.origin === "OFFLINE");

  // ── Engineering ──────────────────────────────────────────────────────────
  delete process.env.GEMINI_API_KEY;
  const contracts = buildApiContracts(def);
  const names = def.dataEntities.map((e) => e.name);
  t("API contracts: list, create, read, change for every record", names.every((n) => ["GET", "POST", "PATCH"].every((m) => contracts.some((c) => c.method === m && c.description.includes(n)))) , `${contracts.length}`);
  t("a record with a status gets a status-change endpoint that names the allowed changes", contracts.some((c) => c.endpoint.endsWith("/status") && /allowed changes/i.test(c.description) && /409/.test(c.description)));
  t("each integration gets an endpoint", def.integrations.every((i) => contracts.some((c) => c.description.includes(i.system))));
  t("no placeholder 'recordsCount: 10' module endpoints any more", !JSON.stringify(generateEngineeringPackageData(def, [])).includes("recordsCount"));
  const offPlan = await quiet(() => generateEngineeringPlan(def));
  t("no key: a rules-based plan with quality targets, security, backlog and risks", offPlan.origin === "OFFLINE" && offPlan.nonFunctional.length >= 6 && offPlan.security.length >= 4 && offPlan.backlog.length >= 3 && offPlan.risks.length >= 3 && offPlan.testStrategy.length >= 3);
  t("the plan names the BRD's rules and records", offPlan.architectureOverview.includes(codes[0]) && names.every((n) => offPlan.architectureOverview.includes(n)));

  process.env.GEMINI_API_KEY = "g";
  const rules = buildEngineeringPlan(def);
  const full = EngineeringPlanSchema.parse({ ...rules, architectureOverview: "# Model architecture\n" + "The product enforces its rules in the API. ".repeat(20), apiContracts: buildApiContracts(def) });
  const ecalls: string[] = [];
  restore = setProviderForTests("gemini", async (task, prompt) => { ecalls.push(task); return task === "generate-engineering" ? (ecalls.push(prompt), full) : null; });
  const aiPlan = await quiet(() => generateEngineeringPlan(def));
  restore();
  t("a model writes the plan (origin AI) from a prompt that carries the BRD", aiPlan.origin === "AI" && aiPlan.architectureOverview.startsWith("# Model architecture") && codes.every((c) => (ecalls[1] ?? "").includes(c)));
  restore = setProviderForTests("gemini", async (task) => (task === "generate-engineering" ? EngineeringPlanSchema.parse({ ...full, apiContracts: [], services: [], security: [] }) : null));
  const thin = await quiet(() => generateEngineeringPlan(def));
  restore();
  t("sections a model left empty are filled from the rules; too few contracts are replaced", thin.apiContracts!.length >= def.dataEntities.length * 2 && thin.services.length >= 2 && thin.security.length >= 4);
  const pkg = attachPlan(generateEngineeringPackageData(def, []), aiPlan);
  t("the package carries the plan, real contracts and the plan in the requirements document", !!pkg.plan && pkg.apiRequirements.length === aiPlan.apiContracts!.length && /Architecture and delivery plan/.test(pkg.functionalRequirementsMarkdown));
  restore = setProviderForTests("gemini", async () => null);
  let err2: unknown; try { await quiet(() => generateEngineeringPlan(def)); } catch (e) { err2 = e; }
  restore();
  t("every provider failed: AIUnavailableError", err2 instanceof AIUnavailableError);
  delete process.env.GEMINI_API_KEY;

  // ── Routing ──────────────────────────────────────────────────────────────
  t("both documents ask Gemini first (one Vertex setup runs everything), Claude as backup", providerOrder("generate-test-suite").join() === "gemini,claude" && providerOrder("generate-engineering").join() === "gemini,claude");

  rmSync(dir, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
