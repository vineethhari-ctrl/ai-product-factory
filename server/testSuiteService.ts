import type { ProductDefinition, TestSuite } from "../src/types";
import { buildTestSuite, computeCoverage, ensureCoverage, testSuiteSignature, weakTestCases } from "../src/services/testSuite";
import { callLLMJSON, type Refinement } from "./llmRouter";
import { TestSuiteSchema } from "./aiSchemas";
import { buildTestPrompt } from "./testPrompt";

/**
 * The test suite for a finished BRD. A model writes it when one is configured; the rules-based suite
 * (src/services/testSuite.ts) answers otherwise. Either way the server checks coverage: a business rule the
 * model left untested gets a scenario and a test case added, and the suite says which.
 */

const pad = (n: number) => String(n).padStart(3, "0");
const SPECIAL = new Set(["LIFECYCLE", "VALIDATION", "ACCESS", "INTEGRATION", "AUDIT", "GENERAL"]);

function finalize(def: ProductDefinition, ai: ReturnType<typeof TestSuiteSchema.parse>): TestSuite {
  const known = new Set(def.businessRules.map((r) => r.code));
  const json = (s: string) => { try { JSON.parse(s); return s; } catch { return JSON.stringify({ note: s.slice(0, 200) }, null, 2); } };
  const scenarios = ai.scenarios.slice(0, 48).map((s, i) => ({
    ...s,
    id: `SCN-${pad(i + 1)}`,
    // A rule code the BRD does not have is not evidence for any rule.
    ruleCode: known.has(s.ruleCode) || SPECIAL.has(s.ruleCode) ? s.ruleCode : "GENERAL",
  }));
  const testCases = ai.testCases.slice(0, 48).map((t, i) => ({
    ...t,
    id: `TC-${pad(i + 1)}`,
    testPayload: json(t.testPayload),
    passStatus: "READY" as const,
    traces: (t.traces ?? []).filter(Boolean),
  }));
  const suite: TestSuite = {
    origin: "AI",
    generatedAt: new Date().toISOString(),
    basedOn: testSuiteSignature(def),
    useCases: ai.useCases.slice(0, 14).map((u, i) => ({ ...u, id: `UC-${pad(i + 1)}` })),
    scenarios,
    testCases,
    gherkinFeature: ai.gherkinFeature.trim().slice(0, 20000),
    coverage: { rulesTotal: 0, rulesCovered: 0, journeysTotal: 0, journeysCovered: 0, entitiesTotal: 0, entitiesCovered: 0 },
  };
  return ensureCoverage(def, { ...suite, coverage: computeCoverage(def, suite) });
}

const norm = (x: unknown) => String(x ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The quality bar for test cases: 3 to 7 steps and a measurable expected result. A model sometimes writes rule-breach tests
 * with two steps; Gemini is asked once, in the same click, to rewrite only those, and the rewrite replaces a case only when it
 * is better (a rewrite never makes a case weaker, and a rewrite that does not fit the schema is dropped).
 */
export const testCaseRefinement: Refinement = {
  check: (data) => weakTestCases(data.testCases ?? []).slice(0, 14).map((w) => `${w.id} "${w.title}": ${w.reasons}`),
  ask: `Your previous answer is valid JSON, but these test cases are too thin for a QA lead to run. Rewrite ONLY these test cases: give each 3 to 7 concrete executionSteps (the role who signs in, the screen, the data state to arrange, the action, and how the tester observes the result; for a refused action include checking that the record is unchanged and what is, or is not, written to the audit trail) and an expectedResult that is measurable (the status the record ends in, the exact message the user sees, the audit entry written). Keep each id, title, vector, targetModule, preconditions, testPayload and traces as they are. Return ONLY a JSON object {"testCases": [...]} that holds just the rewritten test cases, no explanation. The test cases to rewrite:`,
  merge: (data, patch) => {
    const list: any[] = Array.isArray((patch as any)?.testCases) ? (patch as any).testCases : Array.isArray(patch) ? (patch as any[]) : [];
    const byId = new Map(list.map((x) => [String(x?.id ?? "").trim(), x]));
    const byTitle = new Map(list.map((x) => [norm(x?.title), x]));
    const steps = (t: any) => (Array.isArray(t?.executionSteps) ? t.executionSteps.filter((x: unknown) => typeof x === "string" && x.trim()) : []);
    const better = (old: any, cand: any) => {
      const a = weakTestCases([old]).length, b = weakTestCases([cand]).length;
      return b < a || (b === a && steps(cand).length > steps(old).length && String(cand.expectedResult ?? "").length >= String(old.expectedResult ?? "").length);
    };
    return {
      ...data,
      testCases: (data.testCases ?? []).map((tc: any) => {
        const n = byId.get(tc.id) ?? byTitle.get(norm(tc.title));
        if (!n || typeof n !== "object") return tc;
        const cand = { ...tc, ...n, id: tc.id, executionSteps: steps(n), expectedResult: String(n.expectedResult ?? tc.expectedResult ?? "") };
        return better(tc, cand) ? cand : tc;
      }),
    };
  },
};

/** Throws AIUnavailableError when keys are set and every provider failed (the endpoint answers 503). */
export async function generateTestSuite(def: ProductDefinition): Promise<TestSuite> {
  const parsed = await callLLMJSON("generate-test-suite", buildTestPrompt(def), TestSuiteSchema, undefined, { refine: testCaseRefinement });
  // A model that wrote no test cases at all gives nothing to keep; the rules-based suite stands in and says so.
  if (!parsed || parsed.testCases.length === 0) return buildTestSuite(def);
  return finalize(def, parsed);
}
