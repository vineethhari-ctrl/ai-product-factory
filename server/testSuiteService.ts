import type { ProductDefinition, TestSuite } from "../src/types";
import { buildTestSuite, computeCoverage, ensureCoverage, testSuiteSignature } from "../src/services/testSuite";
import { callLLMJSON } from "./llmRouter";
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

/** Throws AIUnavailableError when keys are set and every provider failed (the endpoint answers 503). */
export async function generateTestSuite(def: ProductDefinition): Promise<TestSuite> {
  const parsed = await callLLMJSON("generate-test-suite", buildTestPrompt(def), TestSuiteSchema);
  // A model that wrote no test cases at all gives nothing to keep; the rules-based suite stands in and says so.
  if (!parsed || parsed.testCases.length === 0) return buildTestSuite(def);
  return finalize(def, parsed);
}
