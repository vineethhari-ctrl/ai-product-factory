import type { ProductDefinition } from "../src/types";
import { definitionDigest } from "./definitionDigest";

/**
 * Prompt for the engineering plan: how to build what the BRD describes. Domain-neutral: nothing here names an
 * industry; every record, role, rule and system the model uses comes from the definition below.
 */
export function buildEngineeringPrompt(def: ProductDefinition): string {
  return `ROLE: You are a principal software architect handing a finished BRD to the build team. Your plan must be specific to THIS product: use its own records, fields, statuses, roles, rules and systems. A plan that could describe any product is a failure.

${definitionDigest(def)}

WHAT TO PRODUCE:
1. architectureOverview: markdown, 250-450 words: the shape of the solution (clients, API, data store, background work, integration layer), where each business rule is enforced (client, API, database, job) and why, how status changes are validated, how the audit trail is written, how sensitive fields are protected. Name the product's own records and rules.
2. services: 3-8 services or modules. Each: name, responsibility, owns (the records above it is the source of truth for), exposes (its main endpoints or events), dependsOn.
3. apiContracts: for EVERY record above: list (with filters and paging), create, read, change, and, where the record has a status field, a status-change endpoint that rejects a change the lifecycle does not allow. For each integration: the endpoint or webhook the product exposes or calls. Each: endpoint (versioned path, nouns from the records), method, description (who may call it, which roles, what it enforces, the error cases: validation 422, role not allowed 403, invalid status change 409, not found 404), requestBodySample and responseBodySample as JSON strings using the record's REAL field names and values that fit their constraints.
4. events: 4-10 domain events (for example a status change) with producer, consumers and a payload sample using real field names.
5. nonFunctional: 8-12 quality targets written for this product, each with a measurable target and how it is verified: performance of the heaviest screens and queries, availability, data volume and retention, audit, security, privacy, resilience when a named integration is down, accessibility, browser and device support (phone use by outside parties where the screens say so).
6. security: 6-10 concrete controls: how each role is authorised (use the role names above), which fields are masked from which roles, how the audit trail is protected from edits, how secrets and keys are handled, how data of different parties is kept apart if the rules say so.
7. integrationContracts: one per integration above: direction, protocol, dataExchanged, failureHandling (retry, queue, idempotency key, alert, manual repair path).
8. backlog: 4-8 epics (one per module, plus foundation and integrations). 2-5 user stories per epic, each with 2-4 testable acceptance lines and traces (rule codes, journey ids, screen names from above).
9. deployment: 5-8 points: environments, configuration and secrets, database migrations, release and rollback, monitoring and alerts that matter for this product.
10. risks: 5-8 technical and delivery risks specific to this product (use the open questions and assumptions), each with impact and mitigation.
11. testStrategy: 5-8 points: what is tested at unit, API, UI and end-to-end level, which rules need which level, performance and security testing, test data.

QUALITY RULES:
- Use only record, field, status, role, screen and rule names that appear above. Never invent a rule code.
- Targets must be numbers with units (for example "95% of list requests under 1.5 seconds at the expected peak load"). If the BRD gives no volume, state your assumption in the target.
- Flag anything the BRD leaves open (open questions) in risks, not as invented facts.
- No timestamps and no random ids.

Return ONLY valid JSON, no prose before or after, in exactly this shape:
{
  "architectureOverview": "markdown",
  "services": [{"name": "", "responsibility": "", "owns": [""], "exposes": [""], "dependsOn": [""]}],
  "apiContracts": [{"endpoint": "/api/v1/...", "method": "GET" | "POST" | "PUT" | "DELETE" | "PATCH", "description": "", "requestBodySample": "{}", "responseBodySample": "{}"}],
  "events": [{"name": "", "producer": "", "consumers": [""], "payloadSample": "{}"}],
  "nonFunctional": [{"area": "", "requirement": "", "target": "", "howVerified": ""}],
  "security": [""],
  "integrationContracts": [{"system": "", "direction": "", "protocol": "", "dataExchanged": "", "failureHandling": ""}],
  "backlog": [{"epic": "", "stories": [{"title": "As a ... I can ...", "acceptance": [""], "traces": [""]}]}],
  "deployment": [""],
  "risks": [{"risk": "", "impact": "", "mitigation": ""}],
  "testStrategy": [""]
}`;
}
