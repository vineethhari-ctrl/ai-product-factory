/**
 * Test-case quality bar: a valid test suite whose rule-breach cases are too thin gets ONE rewrite of just those cases, in the
 * same click, and a rewrite never makes anything worse. Also: readable choice lists in business documents.
 * Run: npm run check:quality
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "quality-"));
process.env.AI_RETRY_SCALE = "0";
process.env.AI_CACHE_DAYS = "0";
for (const k of ["AI_PROJECT_BUTTON_LIMIT", "AI_USER_BUTTON_LIMIT", "AI_USER_DAILY_TOKENS", "AI_MONTHLY_BUDGET_USD"]) process.env[k] = "0";
delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.GOOGLE_GENAI_USE_VERTEXAI; delete process.env.AI_GEMINI_BACKEND;
delete process.env.GOOGLE_API_KEY; delete process.env.GOOGLE_CLOUD_PROJECT; delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); };
const logs: string[] = [];
const quiet = async <T,>(f: () => Promise<T>): Promise<T> => {
  const l = console.log, w = console.warn, e = console.error;
  console.log = (...a) => logs.push(a.join(" ")); console.warn = (...a) => logs.push(a.join(" ")); console.error = () => {};
  try { return await f(); } finally { console.log = l; console.warn = w; console.error = e; }
};

const BRIEF = `Journey: Request Logged → Triaged → Assigned → Resolved → Closed
Who does what: Clerks log requests, supervisors triage them, technicians resolve them, managers close them.
Rules: A request cannot be closed before it is resolved; urgent requests need a supervisor within 2 hours; a closed request cannot be reopened.`;

(async () => {
  const { analyzeBusinessMaterial, generateProductDefinition } = await import("../server/aiReasoningService");
  const { TestSuiteSchema } = await import("../server/aiSchemas");
  const { generateTestSuite } = await import("../server/testSuiteService");
  const { buildTestSuite, weakTestCases } = await import("../src/services/testSuite");
  const { buildTestPrompt } = await import("../server/testPrompt");
  const { setGeminiClientForTests } = await import("../server/geminiClient");
  const D = await import("../src/services/documentMath");
  const { cleanDocument } = await import("../server/documents");

  const u = await quiet(() => analyzeBusinessMaterial([], "Request Desk", "Operations", BRIEF));
  const def = await quiet(() => generateProductDefinition(u, "Request Desk", "Operations"));

  // ── the helper ──
  const ok = { id: "TC-1", title: "ok", executionSteps: ["a", "b", "c"], expectedResult: "The request ends in status CLOSED and the audit trail holds one entry." };
  t("a case with 3+ steps and a measurable result is fine", weakTestCases([ok]).length === 0);
  t("2 steps is weak; a short expected result is weak; the reason says which", weakTestCases([{ ...ok, executionSteps: ["a", "b"] }])[0]?.reasons.includes("only 2 execution step") && /not measurable/.test(weakTestCases([{ ...ok, expectedResult: "It works." }])[0]?.reasons ?? ""));
  const offline = buildTestSuite(def);
  t("the rules-based suite meets the same bar", weakTestCases(offline.testCases).length === 0, JSON.stringify(weakTestCases(offline.testCases).slice(0, 2)));

  // ── the prompt asks for it twice ──
  const prompt = buildTestPrompt(def);
  t("the test prompt demands 3-7 steps for EVERY case, rule-breach tests included, and a self-check", /EVERY test case, rule-breach and negative tests included, has 3 to 7 steps/.test(prompt) && /count the executionSteps of every test case/.test(prompt));

  // ── the live path with a stand-in model ──
  const base = TestSuiteSchema.parse({
    useCases: offline.useCases.map(({ id: _i, ...x }: any) => x).slice(0, 2).map((x: any, i: number) => ({ id: `UC-00${i + 1}`, ...x })),
    scenarios: offline.scenarios.map((s: any) => ({ id: s.id, type: s.type, module: s.module, objective: s.objective, testVector: s.testVector, riskRating: s.riskRating, ruleCode: s.ruleCode, verificationMethod: s.verificationMethod })),
    testCases: offline.testCases.slice(0, 8).map((c: any) => ({ id: c.id, title: c.title, vector: c.vector, targetModule: c.targetModule, preconditions: c.preconditions, testPayload: c.testPayload, executionSteps: c.executionSteps, expectedResult: c.expectedResult, traces: c.traces })),
    gherkinFeature: offline.gherkinFeature,
  } as any);
  const thin = (id: string) => base.testCases.find((c) => c.id === id)!;
  const weakA = { ...base.testCases[1], id: base.testCases[1].id, executionSteps: ["Open the screen", "Try the action"] };
  const weakB = { ...base.testCases[3], executionSteps: ["Open the screen", "Try the action"] };
  const withWeak = { ...base, testCases: base.testCases.map((c) => (c.id === weakA.id ? weakA : c.id === weakB.id ? weakB : c)) };
  const strong = (c: any) => ({ id: c.id, title: c.title, vector: c.vector, targetModule: c.targetModule, preconditions: c.preconditions, testPayload: c.testPayload, traces: c.traces,
    executionSteps: ["Sign in as the supervisor", "Arrange a request in status Resolved", "Attempt the forbidden change on the Request screen", "Check the request is unchanged and no audit entry was written"],
    expectedResult: "The change is refused with the message from the rule, the request stays in status Resolved and no audit entry is written." });

  const requests: any[] = [];
  const replies: string[] = [];
  const stub = { models: { generateContent: async (p: any) => {
    requests.push(p);
    return { text: replies.shift() ?? JSON.stringify(withWeak), candidates: [{ finishReason: "STOP" }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 } };
  } } };
  const restore = setGeminiClientForTests(stub);
  process.env.GEMINI_API_KEY = "g";
  const run = async (rs: string[]) => { requests.length = 0; logs.length = 0; replies.length = 0; replies.push(...rs); return quiet(() => generateTestSuite(def)); };

  // 1. fine on the first try: one request, no rewrite.
  const r0 = await run([JSON.stringify(base)]);
  t("a suite that already meets the bar costs one request", requests.length === 1 && r0.origin === "AI");

  // 2. two thin cases: one follow-up in the same click, only those cases come back, and they replace the weak ones.
  const r1 = await run([JSON.stringify(withWeak), JSON.stringify({ testCases: [strong(weakA), strong(weakB)] })]);
  t("two thin cases: exactly one follow-up request (same click)", requests.length === 2, `${requests.length}`);
  const followUp = JSON.stringify(requests[1]?.contents ?? "");
  t("the follow-up names exactly the thin cases and why, and asks for only those back", followUp.includes(weakA.id) && followUp.includes(weakB.id) && /only 2 execution step/.test(followUp) && /holds just the rewritten test cases/.test(followUp) && !followUp.includes(`"${base.testCases[0].id}" "`));
  t("the follow-up carries the depth directive as the system instruction", requests[1]?.config?.systemInstruction?.includes("deepest, most careful effort"));
  t("the rewritten cases replace the thin ones; the rest are untouched", weakTestCases(r1.testCases).length === 0 && r1.testCases.length === base.testCases.length && r1.testCases[0].executionSteps.join() === base.testCases[0].executionSteps.join());
  t("a rewrite keeps each case's id, title, payload and traces", r1.testCases.every((c, i) => c.title === base.testCases[i].title && c.testPayload.length > 0 && JSON.parse(c.testPayload) !== undefined));
  t("the log says how many were fixed", logs.some((l) => /quality rewrite fixed 2 of 2/.test(l)), logs.filter((l) => /quality/.test(l)).join(" | "));

  // 3. the rewrite is garbage: the first (valid) answer is kept, nothing is lost.
  const r2 = await run([JSON.stringify(withWeak), "this is not json"]);
  t("an unusable rewrite: the first valid suite is kept", r2.origin === "AI" && r2.testCases.length === base.testCases.length && requests.length === 2);

  // 4. the rewrite is no better (still two steps): the old case stays, the rewrite is not forced in.
  const same = { id: weakA.id, title: weakA.title, executionSteps: ["Open it", "Try it"], expectedResult: "x" };
  const r3 = await run([JSON.stringify(withWeak), JSON.stringify({ testCases: [same] })]);
  t("a rewrite that is not better is not used", r3.testCases.find((c) => c.title === weakA.title)?.executionSteps.join() === weakA.executionSteps.join() && r3.testCases.find((c) => c.title === weakA.title)?.expectedResult === weakA.expectedResult);

  // 5. the rewrite breaks the schema: dropped.
  const r4 = await run([JSON.stringify(withWeak), JSON.stringify({ testCases: [{ id: weakA.id, vector: "NOT A VECTOR", executionSteps: ["a", "b", "c"], expectedResult: "A long enough expected result for the check to pass." }] })]);
  t("a rewrite that breaks the schema is dropped; the suite stays valid", r4.origin === "AI" && r4.testCases.length === base.testCases.length);

  // 6. matched by title when the model's rewrite changes the id.
  const r5 = await run([JSON.stringify(withWeak), JSON.stringify({ testCases: [{ ...strong(weakA), id: "TC-99" }] })]);
  t("a rewrite whose id changed is still matched by its title", weakTestCases(r5.testCases).filter((w) => w.title === weakA.title).length === 0);

  // 7. every attempt keeps the system instruction too (first request).
  t("the first request carries the depth directive", !!requests[0]?.config?.systemInstruction);
  restore();
  delete process.env.GEMINI_API_KEY;

  // ── readable choice lists (item 3) ──
  const R = D.readableOption;
  t("a code with a descriptive tail reads as words: EQUIPMENT_ASSET - Reciprocating Compressor", R("EQUIPMENT_ASSET - Reciprocating Compressor") === "Equipment Asset - Reciprocating Compressor");
  t("plain codes read as words, one word or several", R("CRITICAL_SAFETY_HAZARD") === "Critical Safety Hazard" && R("BOOLEAN_PASS_FAIL") === "Boolean Pass Fail" && R("HIGH") === "High" && R("NONE") === "None" && R("NORMAL") === "Normal" && R("DATE") === "Date");
  t("acronyms stay upper-case", R("SLA_BREACH") === "SLA Breach" && R("EV") === "EV" && R("SLA") === "SLA" && R("EV CHARGER") === "EV Charger");
  t("anything already readable is left exactly as written", ["Reciprocating Compressor", "In Progress", "High-Pressure Gas", "Level 2 - Senior", "mixed Case"].every((x) => R(x) === x));
  t("digits and a trailing tail are kept", R("TIER_2 - Fast Track") === "Tier 2 - Fast Track" && R("ISO_9001") === "Iso 9001" || R("ISO_9001") === "ISO 9001");

  const cleaned = cleanDocument({
    name: "Work Order", numberPrefix: "WO", states: ["Draft", "Done"], actions: [], related: {},
    sections: [{ title: "Basics", fields: [
      { label: "Applicable Asset Types", kind: "select", options: ["EQUIPMENT_ASSET - Reciprocating Compressor", "ZONE - Hazardous Process Containment"], sample: "EQUIPMENT_ASSET - Reciprocating Compressor" },
      { label: "Priority Tier", kind: "select", options: ["NORMAL", "HIGH", "EMERGENCY"], sample: "NORMAL" },
      { label: "Already Fine", kind: "select", options: ["Open", "Closed"], sample: "Open" },
    ] }],
  } as any, ["Draft", "Done"], undefined, []);
  const fields = (cleaned as any)?.sections?.flatMap((s: any) => s.fields) ?? [];
  const f = (label: string) => fields.find((x: any) => x.label === label);
  t("a cleaned document's choice lists and samples read as words", f("Applicable Asset Types")?.options.join("|") === "Equipment Asset - Reciprocating Compressor|Zone - Hazardous Process Containment" && f("Applicable Asset Types")?.sample === "Equipment Asset - Reciprocating Compressor" && f("Priority Tier")?.options.join("|") === "Normal|High|Emergency" && f("Priority Tier")?.sample === "Normal", JSON.stringify(fields.map((x: any) => [x.label, x.options, x.sample])));
  t("a sample is always one of its options after cleaning", fields.filter((x: any) => x.options?.length && x.sample).every((x: any) => x.options.includes(x.sample)));
  t("lists that were already readable are untouched", f("Already Fine")?.options.join("|") === "Open|Closed" && f("Already Fine")?.sample === "Open");

  const longOpt = "AST-VRU-03: Ironwood Terminal > Loading Gantry 3 > Vapor Recovery Unit";
  const longDoc: any = cleanDocument({ name: "Order", numberPrefix: "O", states: ["Draft", "Done"], actions: [], related: {}, sections: [{ title: "T", fields: [{ label: "Target Site", kind: "lookup", options: [longOpt, longOpt + " B"], sample: longOpt }] }] } as any, ["Draft", "Done"], undefined, []);
  const lf = longDoc?.sections?.[0]?.fields?.[0];
  t("a long option is not cut shorter than its own sample: the sample is still one of the options", lf?.options?.includes(lf?.sample) && lf?.options?.[0] === longOpt, JSON.stringify(lf));
  const withLines = D.humanizeDocumentStates({ states: ["A"], lines: { columns: [{ label: "Type", options: ["BOOLEAN_PASS_FAIL", "FREE_TEXT"] }, { label: "Note" }], rows: [["BOOLEAN_PASS_FAIL", "NOTE_ONE"], ["FREE_TEXT", "x"]] } } as any) as any;
  t("line columns' options and the sample lines under them read as words; other columns are untouched", withLines.lines.columns[0].options.join("|") === "Boolean Pass Fail|Free Text" && withLines.lines.rows[0][0] === "Boolean Pass Fail" && withLines.lines.rows[1][0] === "Free Text" && withLines.lines.rows[0][1] === "NOTE_ONE");
  t("the same function is idempotent (it runs on the server and again when a document is shown)", JSON.stringify(D.humanizeDocumentStates(withLines)) === JSON.stringify(withLines) && JSON.stringify(D.humanizeDocumentStates(D.humanizeDocumentStates({ states: ["IN_PROGRESS"] } as any))) === JSON.stringify({ states: ["In Progress"] }));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
