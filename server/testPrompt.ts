import type { ProductDefinition } from "../src/types";
import { definitionDigest } from "./definitionDigest";

/**
 * Prompt for the test suite: use cases, scenarios, executable test cases and a Gherkin feature, written for THIS
 * product from its finished BRD. Domain-neutral: nothing here names an industry; every noun, field, status and rule
 * the model uses comes from the definition below.
 */
export function buildTestPrompt(def: ProductDefinition): string {
  const codes = def.businessRules.map((r) => r.code).join(", ");
  return `ROLE: You are a principal QA architect. You write the test suite a delivery team will run before this product goes live. Your tests must be specific to THIS product: use its own records, field names, statuses, roles and rules. A test that could belong to any product is a failure.

${definitionDigest(def)}

WHAT TO PRODUCE (every item traced to the definition above):
1. useCases: one formal use case per journey (up to 12). primaryActor and secondaryActors are roles or systems named above. preCondition, trigger, mainFlow (the journey's steps in the user's words, expanded where needed), alternativeFlows (at least two per use case: a business rule being broken, and a permission or system failure), postCondition, sourceTraceability (journey id and the rule codes involved).
2. scenarios (30-44): the coverage matrix. For EVERY business rule (${codes || "none"}) write at least one POSITIVE and one NEGATIVE scenario, and set ruleCode to that rule's code. Add: lifecycle scenarios (each allowed status change, and a change the lifecycle forbids; ruleCode "LIFECYCLE"), BOUNDARY scenarios for the tightest field limits (on the limit and just past it; ruleCode "VALIDATION"), access scenarios (each role against an action it must not perform; ruleCode "ACCESS"), integration failure scenarios (a named system times out, returns an error, returns duplicates; ruleCode "INTEGRATION"), audit-trail scenarios (ruleCode "AUDIT"), and EDGE scenarios for concurrency, repeated submission, and a record that is edited while another user works on it. riskRating reflects the cost of the failure: CRITICAL for money, safety, privacy, compliance or data integrity; HIGH for broken core flows; MEDIUM and LOW otherwise.
3. testCases (30-40): executable. For each: a title that states the behaviour, vector (POSITIVE, NEGATIVE, BOUNDARY or EDGE), targetModule (a module or record name above), preconditions (the state the data must be in, with real statuses), testPayload (a JSON string using the record's REAL field names and values that fit its constraints; for a negative or boundary test, the value that breaks or sits on the limit), executionSteps (3-7 steps a tester can follow on the named screens, naming the role who signs in), expectedResult (measurable: the status the record ends in, the message the user sees, the audit entry written), traces (rule codes, journey ids, screen or record names).
4. gherkinFeature: one Gherkin file as a single string. A Feature with a Background, one Scenario per critical business rule tagged with its code, a Scenario Outline for the lifecycle with an Examples table of allowed and forbidden status changes, and a Scenario Outline for field limits with real field names and values. Use the product's own words in Given/When/Then.

QUALITY RULES:
- Use only field names, statuses, roles, screens and rule codes that appear above. Never invent a rule code. If a rule is marked INFERRED, say so in the scenario objective ("(inferred rule: confirm with the business)").
- Money, quantities, dates and identifiers in payloads must be realistic and consistent with the field's constraints.
- Do not write generic tests (login, "page loads", "API returns 200") unless they prove one of the rules or flows above.
- No timestamps and no random ids. Use ids UC-001, SCN-001, TC-001 in order.
- Every scenario needs at least one test case that proves it, either by its ruleCode in the test case traces or by its objective.

Return ONLY valid JSON, no prose before or after, in exactly this shape:
{
  "useCases": [{"id": "UC-001", "title": "", "primaryActor": "", "secondaryActors": [""], "preCondition": "", "trigger": "", "mainFlow": [""], "alternativeFlows": [{"step": "When ...", "action": "The product ..."}], "postCondition": "", "sourceTraceability": "journey id · rule codes"}],
  "scenarios": [{"id": "SCN-001", "type": "POSITIVE" | "NEGATIVE" | "BOUNDARY" | "EDGE", "module": "", "objective": "", "testVector": "the kind of input", "riskRating": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW", "ruleCode": "a rule code above, or LIFECYCLE, VALIDATION, ACCESS, INTEGRATION, AUDIT", "verificationMethod": ""}],
  "testCases": [{"id": "TC-001", "title": "", "vector": "POSITIVE" | "NEGATIVE" | "BOUNDARY" | "EDGE", "targetModule": "", "preconditions": "", "testPayload": "{\\"field\\": \\"value\\"}", "executionSteps": [""], "expectedResult": "", "traces": [""]}],
  "gherkinFeature": "@tag\\nFeature: ..."
}`;
}
