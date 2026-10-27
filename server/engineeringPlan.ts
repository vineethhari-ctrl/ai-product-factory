import type { DataEntityDefinition, EngineeringPackage, EngineeringPlan, ProductDefinition } from "../src/types";
import { sampleRecord } from "../src/services/testSuite";
import { resolveFieldConstraints, withSystemFields } from "../src/services/validationEngine";
import { callLLMJSON } from "./llmRouter";
import { EngineeringPlanSchema } from "./aiSchemas";
import { buildEngineeringPrompt } from "./engineeringPrompt";
import { plural } from "./blueprint";

/**
 * Engineering plan for a finished BRD: per-record API contracts, services, events, quality targets, security,
 * integration contracts, backlog, risks and test strategy. A model writes it when one is configured
 * (`generateEngineeringPlan`); `buildEngineeringPlan` derives it from the BRD by rules otherwise, and
 * `buildApiContracts` always gives the package real contracts, never one placeholder endpoint per module.
 * Domain-neutral: every name comes from the definition.
 */

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const json = (v: unknown) => JSON.stringify(v, null, 2);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const writers = (def: ProductDefinition) => {
  const w = def.permissions.filter((p) => p.accessLevel === "Read/Write" || p.accessLevel === "Full Admin").map((p) => p.role);
  return w.length ? w : def.personas.map((p) => p.name).slice(0, 3);
};
const readers = (def: ProductDefinition) => (def.permissions.length ? def.permissions.map((p) => p.role) : def.personas.map((p) => p.name));

type Contract = NonNullable<EngineeringPlan["apiContracts"]>[number];

/** List, create, read, change and (where there is a status) status-change endpoints for every record, plus one per integration. */
export function buildApiContracts(def: ProductDefinition): Contract[] {
  const out: Contract[] = [];
  const w = writers(def).join(", ");
  const r = readers(def).join(", ");
  for (const e of def.dataEntities.slice(0, 8)) {
    const base = `/api/v1/${slug(plural(e.name))}`;
    const full = withSystemFields(e);
    const sample = sampleRecord(e);
    const lc = e.lifecycle;
    const stored = { id: "<generated>", ...sample, ...(lc ? { [lc.statusField]: lc.initial } : {}), createdAt: "<server time>", createdBy: "<signed-in user>", rowVersion: 1 };
    const rules = [
      `Validation 422: ${full.fields.filter((f) => f.required && f.source !== "system").slice(0, 4).map((f) => f.name).join(", ") || "required fields"} are required; formats and limits follow the data dictionary.`,
      "Role not allowed 403. Not found 404.",
      ...(lc ? [`Invalid status change 409: only ${lc.transitions.length} defined changes are allowed (initial status "${lc.initial}").`] : []),
    ].join(" ");
    out.push({ endpoint: base, method: "GET", description: `List ${plural(e.name)} (filter by ${lc ? lc.statusField : "any field"}, page, sort). Roles: ${r}. ${rules}`, requestBodySample: "None. Query: ?page=1&pageSize=25" + (lc ? `&${lc.statusField}=${encodeURIComponent(lc.initial)}` : ""), responseBodySample: json({ items: [stored], page: 1, pageSize: 25, total: 1 }) });
    out.push({ endpoint: base, method: "POST", description: `Create a ${e.name}. Roles: ${w}. System fields are set by the server and rejected if sent. ${rules}`, requestBodySample: json(sample), responseBodySample: json(stored) });
    out.push({ endpoint: `${base}/{id}`, method: "GET", description: `Read one ${e.name} with its history. Roles: ${r}. ${rules}`, requestBodySample: "None", responseBodySample: json(stored) });
    out.push({ endpoint: `${base}/{id}`, method: "PATCH", description: `Change business fields of a ${e.name}; immutable fields and system fields are refused. Send the rowVersion you read so a concurrent change is detected (409). Roles: ${w}. ${rules}`, requestBodySample: json({ rowVersion: 1, ...Object.fromEntries(Object.entries(sample).slice(0, 2)) }), responseBodySample: json({ ...stored, rowVersion: 2 }) });
    if (lc) {
      const next = lc.transitions.find((t) => t.from === lc.initial)?.to ?? lc.states[1] ?? lc.initial;
      out.push({ endpoint: `${base}/{id}/status`, method: "POST", description: `Move a ${e.name} from one ${lc.statusField} to another. Allowed changes: ${lc.transitions.slice(0, 10).map((t) => `${t.from} to ${t.to}`).join("; ")}. A reason is required where the rules say so. Roles: ${w}. ${rules}`, requestBodySample: json({ to: next, reason: "<required where a rule says so>", rowVersion: 1 }), responseBodySample: json({ ...stored, [lc.statusField]: next, rowVersion: 2 }) });
    }
  }
  for (const i of def.integrations.slice(0, 6)) {
    out.push({ endpoint: `/api/v1/integrations/${slug(i.system)}/events`, method: "POST", description: `Exchange data with ${i.system} (${i.protocol}): ${i.purpose}. Idempotent by event id; failures are retried with backoff and shown to an administrator.`, requestBodySample: json({ eventId: "<unique>", type: "<event type>", payload: {} }), responseBodySample: json({ accepted: true, eventId: "<unique>" }) });
  }
  return out;
}

/** The plan derived from the BRD by rules; used when no model is configured. */
export function buildEngineeringPlan(def: ProductDefinition): EngineeringPlan {
  const modules = def.modules.length ? def.modules : [{ id: "m1", name: def.productName, description: def.objective, screens: [], confidence: "INFERRED" as const, evidence: [] }];
  // The module whose screens work on the record most owns it; a module that only uses records says so.
  const owner = (e: DataEntityDefinition) => {
    const name = e.name.toLowerCase();
    const score = (m: (typeof modules)[number]) => def.screens.filter((s) => s.module === m.name && (s.name.toLowerCase().includes(name) || s.purpose.toLowerCase().includes(name) || s.ui?.entity === e.name)).length;
    return [...modules].sort((a, b) => score(b) - score(a))[0].name;
  };
  const lcEntity = def.dataEntities.find((e) => e.lifecycle);
  const sensitive = def.dataEntities.flatMap((e) => withSystemFields(e).fields.filter((f) => ["pii", "financial", "credential"].includes(resolveFieldConstraints(f).sensitivity ?? "none")).map((f) => `${e.name}.${f.name} (${resolveFieldConstraints(f).sensitivity})`));
  const ruleLines = def.businessRules.slice(0, 12).map((r) => `- ${r.code}: ${r.rule}`).join("\n");
  const statusRules = def.businessRules.filter((r) => /stage|status|order|skip|hold|cancel/i.test(r.rule)).map((r) => r.code);
  const immutableRules = def.businessRules.filter((r) => /never be (?:edited|altered|changed)|cannot be (?:edited|altered|changed)|immutab|append/i.test(r.rule)).map((r) => r.code);

  const architectureOverview = [
    `# Architecture for ${def.productName}`,
    "",
    `The product is a web application with a role-aware API, one relational data store, background jobs and an integration layer${def.integrations.length ? ` for ${def.integrations.slice(0, 4).map((i) => i.system).join(", ")}` : ""}. ${modules.length} module${modules.length > 1 ? "s" : ""} (${modules.map((m) => m.name).join(", ")}) are delivered as separate parts of one deployable, so they can be split into services later without changing the contracts.`,
    "",
    "## Where the business rules are enforced",
    ruleLines || "- (no business rules were stated)",
    "",
    `Field formats, limits, required fields and the rules between fields are enforced by the API on every write, and the same checks run in the browser for fast feedback. ${lcEntity?.lifecycle ? `Status changes of ${lcEntity.name} are accepted only along the lifecycle ${lcEntity.lifecycle.states.join(" > ")}; anything else returns 409.${statusRules.length ? ` Rules ${statusRules.join(", ")} are checked in the status-change step.` : ""}` : ""}`,
    "",
    "## Audit and integrity",
    `Every create, change and status change writes an append-only audit entry (who, when, old and new values, reason). ${immutableRules.length ? `Rules ${immutableRules.join(", ")} require past entries to stay unaltered, so the audit table allows inserts only.` : "Audit entries cannot be edited or deleted by the application."}`,
    "",
    "## Data",
    `${def.dataEntities.length} record type${def.dataEntities.length > 1 ? "s" : ""} (${def.dataEntities.map((e) => e.name).join(", ")}) with system fields (id, created and updated stamps, row version) added by the server. Rules that need storage (uniqueness, capacity, references) are enforced in the database and the API, and listed in the data dictionary.${sensitive.length ? ` Sensitive fields: ${sensitive.slice(0, 6).join(", ")}.` : ""}`,
  ].join("\n");

  const services = modules.slice(0, 8).map((m) => {
    const owned = def.dataEntities.filter((e) => owner(e) === m.name);
    return {
      name: m.name,
      responsibility: m.description,
      owns: owned.map((e) => e.name),
      exposes: owned.flatMap((e) => [`/api/v1/${slug(plural(e.name))}`]).slice(0, 4),
      dependsOn: ["Identity and roles", "Audit trail", ...(def.integrations.length ? ["Integration layer"] : [])],
    };
  });

  const events = def.dataEntities.filter((e) => e.lifecycle).flatMap((e) =>
    e.lifecycle!.states.slice(0, 6).map((st) => ({
      name: `${slug(e.name)}.${slug(st)}`,
      producer: owner(e),
      consumers: ["Audit trail", ...(def.notifications.length ? ["Notifications"] : []), ...def.integrations.slice(0, 1).map((i) => i.system)],
      payloadSample: json({ id: "<id>", status: st, changedBy: "<user>", reason: "<where required>" }),
    }))
  ).slice(0, 10);

  const nonFunctional: EngineeringPlan["nonFunctional"] = [
    { area: "Performance", requirement: "Lists, search and record pages stay fast at the expected peak.", target: "95% of list and record requests under 2 seconds with 50 concurrent users (assumption: confirm the real volume with the business)", howVerified: "Load test against the API with realistic data volume" },
    { area: "Availability", requirement: "The product is available during business hours.", target: "99.5% monthly, planned maintenance outside business hours", howVerified: "Uptime monitoring and a monthly report" },
    { area: "Security", requirement: "Every screen and action checks the user's role.", target: "Zero actions reachable without the right role; sensitive fields masked for roles without a need to know", howVerified: "Automated access tests per role (see the test suite) and a security review before release" },
    { area: "Audit", requirement: "Every change is traceable.", target: "100% of creates, changes and status changes have an audit entry with user, time, old and new values", howVerified: "Automated test; monthly sample check" },
    { area: "Data retention", requirement: "Records and audit entries are kept as long as the business and regulator require.", target: "Retention period to be confirmed by the business; archived data stays searchable", howVerified: "Retention job test and a restore drill" },
    { area: "Resilience", requirement: `The product keeps working when ${def.integrations[0]?.system ?? "another system"} is down.`, target: "No lost or duplicated records; pending items visible to users; automatic retry within 15 minutes of recovery", howVerified: "Fault-injection test with a stubbed system" },
    { area: "Usability", requirement: "A new user completes the main task without training; errors say what to fix.", target: "Main task in under 5 minutes in a trial with 5 users", howVerified: "Moderated usability session on the prototype and the build" },
    { area: "Device support", requirement: "Works on current desktop browsers, and on phones for screens outside parties use.", target: "Last 2 versions of the main browsers; phone width 360 px and up", howVerified: "Cross-browser and device checks on release candidates" },
  ];

  const security = [
    `Sign-in through the organisation's identity provider (single sign-on); roles (${def.personas.map((p) => p.name).slice(0, 6).join(", ")}) are mapped from it.`,
    "Every API call checks the role against the endpoint's allowed roles; the screen hides actions the role cannot use, but the API is the control.",
    ...(sensitive.length ? [`Sensitive fields (${sensitive.slice(0, 5).join(", ")}) are masked for roles without a need to know and never written to logs.`] : []),
    immutableRules.length ? `The audit table is insert-only at database level (rules ${immutableRules.join(", ")}).` : "The audit trail is append-only and cannot be edited or deleted through the application.",
    "Secrets and keys live in a secret store, never in code or the browser; the AI provider keys stay on the server.",
    "Input is validated on the server for every write; unsafe patterns are rejected; request size is capped.",
    "Outside parties see only their own records (row-level filter on the API).",
  ];

  const integrationContracts = def.integrations.slice(0, 8).map((i) => ({
    system: i.system,
    direction: "Two-way (confirm with the tech team)",
    protocol: i.protocol,
    dataExchanged: i.purpose,
    failureHandling: "Idempotent by event id; retry with exponential backoff; queue while the system is down; alert an administrator after repeated failure; manual repair screen for stuck items.",
  }));

  const backlog = modules.slice(0, 8).map((m) => {
    const screens = def.screens.filter((s) => s.module === m.name).slice(0, 4);
    return {
      epic: m.name,
      stories: (screens.length ? screens : def.screens.slice(0, 2)).map((s) => {
        const rules = def.businessRules.filter((r) => r.context && s.name.toLowerCase().includes(r.context.toLowerCase().split(" ")[0])).slice(0, 2);
        const action = s.ui?.primaryActions?.[0] ?? "complete my work";
        return {
          title: `As a user of ${s.name}, I can ${action.toLowerCase()}`,
          acceptance: [s.purpose, ...rules.map((r) => `${r.code}: ${r.rule}`), "The action is recorded in the audit trail"].slice(0, 4),
          traces: [s.name, ...rules.map((r) => r.code)],
        };
      }),
    };
  });
  backlog.push({ epic: "Foundation", stories: [
    { title: "As a user, I sign in and see only what my role allows", acceptance: ["Single sign-on works", "Each role sees its own menu and records", "Unauthorised API calls return 403"], traces: ["ACCESS"] },
    { title: "As an auditor, I can trace every change", acceptance: ["Each change shows who, when, old and new values", "Entries cannot be edited"], traces: ["AUDIT"] },
  ] });
  if (def.integrations.length) backlog.push({ epic: "Integrations", stories: def.integrations.slice(0, 4).map((i) => ({ title: `As an administrator, I can see and repair failed exchanges with ${i.system}`, acceptance: ["Failures are retried and listed", "A stuck item can be repaired by hand", "No duplicates after recovery"], traces: [i.system] })) });

  const risks = [
    ...def.openQuestions.filter((q) => q.status === "open" && q.urgency === "blocking").slice(0, 3).map((q) => ({ risk: `Open question: ${clip(q.question, 120)}`, impact: "Blocks design or build of the part it concerns", mitigation: "Get the answer from the owning team before the sprint that needs it" })),
    ...def.assumptions.filter((a) => a.riskLevel !== "low").slice(0, 3).map((a) => ({ risk: `Assumption: ${clip(a.statement, 120)}`, impact: `Rework if wrong (risk ${a.riskLevel})`, mitigation: "Validate with the business in the first review of the prototype" })),
    { risk: "Real data volumes are unknown", impact: "Performance targets may miss", mitigation: "Agree a volume estimate with the business and load-test early" },
    ...(def.integrations.length ? [{ risk: `Interfaces to ${def.integrations.slice(0, 2).map((i) => i.system).join(" and ")} are not yet specified by their owners`, impact: "Delays in integration work", mitigation: "Get interface documents and a test environment from each owner in sprint 1" }] : []),
  ].slice(0, 8);

  return {
    origin: "OFFLINE",
    architectureOverview,
    services,
    events,
    nonFunctional,
    security,
    integrationContracts,
    backlog,
    deployment: [
      "Three environments (development, test, production) with the same configuration shape; production data never copied down without masking.",
      "Continuous integration runs type checks, unit tests, API contract tests and the test suite on every change.",
      "Database changes are versioned migrations, applied automatically and reversible.",
      "Configuration and secrets come from the environment and a secret store.",
      "Release by pipeline with a one-step rollback; schema changes are backward compatible for one release.",
      "Monitoring covers request latency, error rate, queue depth for integrations, and failed status changes; alerts go to the owning team.",
    ],
    risks,
    testStrategy: [
      "Unit tests for the validation engine and the status-change rules (every allowed and forbidden change).",
      "API contract tests for every endpoint listed in the contracts, including the 403, 404, 409 and 422 cases.",
      "End-to-end tests from the generated test suite, one per business rule and one per journey.",
      "Role-based access tests: every role against every restricted action.",
      "Resilience tests with stubbed integrations (timeout, error, duplicate).",
      "Performance test of the heaviest list and record pages at the agreed volume.",
    ],
    apiContracts: buildApiContracts(def),
  };
}

const cap = <T>(items: T[] | undefined, n: number): T[] => (items ?? []).slice(0, n);

/** Keep what a model wrote, bounded and valid; fill any section it left empty from the rules-based plan. */
function finalizePlan(def: ProductDefinition, ai: ReturnType<typeof EngineeringPlanSchema.parse>): EngineeringPlan {
  const base = buildEngineeringPlan(def);
  const pick = <T>(mine: T[], theirs: T[], min: number) => (mine.length >= min ? mine : theirs);
  const safeJson = (s: string) => { try { JSON.parse(s); return s; } catch { return json({ note: clip(s, 200) }); } };
  const entityCount = def.dataEntities.length;
  const apiContracts = cap(ai.apiContracts, 60).map((c) => ({ ...c, endpoint: c.endpoint.startsWith("/") ? c.endpoint : `/${c.endpoint}`, requestBodySample: c.requestBodySample.startsWith("{") || c.requestBodySample.startsWith("[") ? safeJson(c.requestBodySample) : c.requestBodySample, responseBodySample: safeJson(c.responseBodySample) }));
  return {
    origin: "AI",
    architectureOverview: ai.architectureOverview.trim().length > 200 ? ai.architectureOverview : base.architectureOverview,
    services: pick(cap(ai.services, 10), base.services, 2),
    events: pick(cap(ai.events, 14).map((e) => ({ ...e, payloadSample: safeJson(e.payloadSample) })), base.events, 2),
    nonFunctional: pick(cap(ai.nonFunctional, 14), base.nonFunctional, 5),
    security: pick(cap(ai.security, 12), base.security, 4),
    integrationContracts: def.integrations.length ? pick(cap(ai.integrationContracts, 10), base.integrationContracts, 1) : cap(ai.integrationContracts, 10),
    backlog: pick(cap(ai.backlog, 10).map((e) => ({ ...e, stories: cap(e.stories, 6) })), base.backlog, 3),
    deployment: pick(cap(ai.deployment, 10), base.deployment, 3),
    risks: pick(cap(ai.risks, 10), base.risks, 3),
    testStrategy: pick(cap(ai.testStrategy, 10), base.testStrategy, 3),
    // A model that wrote too few contracts to cover the records gets the rules-based ones instead.
    apiContracts: apiContracts.length >= Math.max(3, entityCount * 2) ? apiContracts : base.apiContracts,
  };
}

/** The plan from a model, or the rules-based plan when no model is configured. Throws AIUnavailableError when keys are set and every provider failed. */
export async function generateEngineeringPlan(def: ProductDefinition): Promise<EngineeringPlan> {
  const parsed = await callLLMJSON("generate-engineering", buildEngineeringPrompt(def), EngineeringPlanSchema);
  return parsed ? finalizePlan(def, parsed) : buildEngineeringPlan(def);
}

/** Put the plan on the package; its API contracts replace the placeholder per-module endpoints. */
export function attachPlan(pkg: EngineeringPackage, plan: EngineeringPlan): EngineeringPackage {
  const contracts = plan.apiContracts?.length ? plan.apiContracts : pkg.apiRequirements;
  const planMarkdown = [
    "",
    "### 8. Architecture and delivery plan",
    plan.architectureOverview,
    "",
    "#### Quality targets",
    ...plan.nonFunctional.map((n) => `- **${n.area}:** ${n.requirement} Target: ${n.target}. Verified by: ${n.howVerified}.`),
    "",
    "#### Security controls",
    ...plan.security.map((s) => `- ${s}`),
    "",
    "#### Risks",
    ...plan.risks.map((r) => `- ${r.risk} (impact: ${r.impact}; mitigation: ${r.mitigation})`),
  ].join("\n");
  return {
    ...pkg,
    plan,
    apiRequirements: contracts,
    endpoints: contracts.map((c) => `${c.method} ${c.endpoint}`),
    functionalRequirementsMarkdown: `${pkg.functionalRequirementsMarkdown}\n${planMarkdown}`,
  };
}
