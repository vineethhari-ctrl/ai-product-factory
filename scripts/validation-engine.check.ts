import { INITIAL_PRODUCT_DEFINITION } from "../src/data/defaultData";
import { validateRecord, withSystemFields, entityToSQL, isSafePattern, sanitizeConstraints, evaluateRules, canTransition } from "../src/services/validationEngine";
import { validateRecordHandler } from "../server/recordRoute";
import { normalizeDefinitionConstraints } from "../server/constraints";
import type { DataEntityDefinition } from "../src/types";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); };
const has = (issues: { path: string; code: string }[], path: string, code: string) => issues.some((i) => i.path === path && i.code === code);
const base = { id: "e", description: "", relationships: [], confidence: "INFERRED" as const, evidence: [] };

// Domain A: the fleet demo entity (legacy type strings, no constraints object)
const vehicle = INITIAL_PRODUCT_DEFINITION.dataEntities.find((e) => e.name === "Vehicle")!;
t("A legacy string(17) accepts 17 chars", validateRecord(vehicle, { vin: "1FTFW1ED4NFA99021", make: "x", model: "y", odometerMiles: 10 }).every((i) => i.path !== "vin"));
t("A legacy string(17) rejects 18 chars", has(validateRecord(vehicle, { vin: "1FTFW1ED4NFA990211" }), "vin", "maxLength"));
t("A legacy number rejects text", has(validateRecord(vehicle, { odometerMiles: "abc" }), "odometerMiles", "type"));
t("A missing required field is reported on create", has(validateRecord(vehicle, {}), "vin", "required"));
t("A partial update does not demand required fields", !validateRecord(vehicle, { odometerMiles: 5 }, "update").some((i) => i.code === "required"));
t("A natural key suppresses an injected id", !withSystemFields(vehicle).fields.some((f) => f.name === "id"));
t("A audit fields are injected", ["createdAt", "createdBy", "updatedAt", "updatedBy", "rowVersion"].every((n) => withSystemFields(vehicle).fields.some((f) => f.name === n && f.source === "system")));
t("A client cannot set system fields", has(validateRecord(vehicle, { vin: "1FTFW1ED4NFA99021", createdAt: "2026-01-01T00:00:00Z" }), "createdAt", "system_field"));
t("A unknown fields are rejected", has(validateRecord(vehicle, { nope: 1 }), "nope", "unknown_field"));

// Domain B: scheduling-shaped entity, only generic names
const booking: DataEntityDefinition = { ...base, name: "Slot Reservation", fields: [
  { name: "mode", type: "enum(ONSITE, REMOTE)", required: true },
  { name: "address", type: "string", required: false, constraints: { maxLength: 120 } },
  { name: "startAt", type: "datetime", required: true },
  { name: "endAt", type: "datetime", required: true },
  { name: "notes", type: "text", required: false, constraints: { format: "free-text", minLength: 5, maxLength: 20 } },
  { name: "contactEmail", type: "email", required: true },
  { name: "backupPhone", type: "phone", required: false },
  { name: "email2", type: "email", required: false },
], lifecycle: { statusField: "status", states: ["DRAFT", "CONFIRMED", "CANCELLED", "DONE"], initial: "DRAFT", transitions: [{ from: "DRAFT", to: "CONFIRMED" }, { from: "CONFIRMED", to: "DONE" }, { from: "DRAFT", to: "CANCELLED" }] },
  rules: [
    { id: "r1", kind: "conditional", when: { field: "mode", op: "eq", value: "ONSITE" }, effect: "required", target: "address", message: "Address is required for onsite." },
    { id: "r2", kind: "conditional", when: { field: "mode", op: "eq", value: "REMOTE" }, effect: "forbidden", target: "address", message: "No address for remote." },
    { id: "r3", kind: "compare", left: "startAt", op: "lt", right: "endAt", message: "End must be after start." },
    { id: "r4", kind: "mutuallyExclusive", fields: ["backupPhone", "email2"], message: "Give one backup contact." },
  ] };
const ok = { mode: "REMOTE", startAt: "2026-10-01T09:00:00Z", endAt: "2026-10-01T10:00:00Z", contactEmail: "a@b.co" };
t("B valid record passes", validateRecord(booking, ok).length === 0, JSON.stringify(validateRecord(booking, ok)));
t("B conditional required", has(validateRecord(booking, { ...ok, mode: "ONSITE" }), "address", "required"));
t("B conditional forbidden", has(validateRecord(booking, { ...ok, address: "x" }), "address", "forbidden"));
t("B evaluateRules drives forms", evaluateRules(withSystemFields(booking), { mode: "ONSITE" }).required.has("address") && evaluateRules(withSystemFields(booking), { mode: "REMOTE" }).forbidden.has("address"));
t("B compare rule", has(validateRecord(booking, { ...ok, endAt: "2026-10-01T08:00:00Z" }), "startAt", "compare"));
t("B mutually exclusive", validateRecord(booking, { ...ok, backupPhone: "+14155550100", email2: "z@y.co" }).some((i) => i.code === "mutually_exclusive"));
t("B bad email", has(validateRecord(booking, { ...ok, contactEmail: "nope" }), "contactEmail", "format"));
t("B bad phone", has(validateRecord(booking, { ...ok, backupPhone: "0415" }), "backupPhone", "format"));
t("B impossible date", has(validateRecord(booking, { ...ok, startAt: "2026-02-30T09:00:00Z" }), "startAt", "format"));
t("B minLength", has(validateRecord(booking, { ...ok, notes: "abc" }), "notes", "minLength"));
t("B create must start at initial state", has(validateRecord(booking, { ...ok, status: "DONE" }), "status", "invalid_initial_state"));
t("B valid transition", !validateRecord(booking, { status: "CONFIRMED" }, "update", { existing: { status: "DRAFT" } }).some((i) => i.path === "status"));
t("B invalid transition", has(validateRecord(booking, { status: "DONE" }, "update", { existing: { status: "DRAFT" } }), "status", "invalid_transition"));
t("B canTransition helper", canTransition(booking.lifecycle!, "DRAFT", "CANCELLED") && !canTransition(booking.lifecycle!, "DONE", "DRAFT"));

// Domain C: unrelated (money, codes, together-rules)
const claim: DataEntityDefinition = { ...base, name: "Claim", fields: [
  { name: "claimRef", type: "string", required: true, constraints: { format: "identifier", pattern: "^(\\d{3}-){2}\\d{4}$", unique: true } },
  { name: "amount", type: "decimal", required: true, constraints: { format: "decimal", min: 0.01, max: 1000000, precision: 2, sensitivity: "financial" } },
  { name: "currency", type: "string", required: true, constraints: { format: "currency-code" } },
  { name: "discount", type: "number", required: false, constraints: { format: "percentage" } },
  { name: "step5", type: "number", required: false, constraints: { format: "integer", min: 0, max: 100, step: 5 } },
  { name: "reviewerId", type: "string", required: false }, { name: "reviewedAt", type: "datetime", required: false },
], rules: [{ id: "t", kind: "requiredTogether", fields: ["reviewerId", "reviewedAt"], message: "Reviewer and time go together." }] };
const c0 = { claimRef: "123-456-7890", amount: "10.50", currency: "USD" };
t("C valid record passes", validateRecord(claim, c0).length === 0, JSON.stringify(validateRecord(claim, c0)));
t("C pattern enforced", has(validateRecord(claim, { ...c0, claimRef: "12-34" }), "claimRef", "pattern"));
t("C precision", has(validateRecord(claim, { ...c0, amount: "10.505" }), "amount", "precision"));
t("C range", has(validateRecord(claim, { ...c0, amount: 0 }), "amount", "min"));
t("C currency code", has(validateRecord(claim, { ...c0, currency: "usd" }), "currency", "format"));
t("C percentage default range", has(validateRecord(claim, { ...c0, discount: 120 }), "discount", "max"));
t("C step", has(validateRecord(claim, { ...c0, step5: 7 }), "step5", "step"));
t("C requiredTogether", has(validateRecord(claim, { ...c0, reviewerId: "u1" }), "reviewedAt", "required_together"));

// Untrusted patterns
t("safe: bounded group repeat allowed", isSafePattern("^(\\d{3}-){2}\\d{4}$"));
t("unsafe: nested quantifier rejected", !isSafePattern("^(a+)+$"));
t("unsafe: quantified alternation rejected", !isSafePattern("^(a|aa)+$"));
t("unsafe: backreference rejected", !isSafePattern("(a)\\1"));
t("unsafe: invalid regex rejected", !isSafePattern("([a-z"));
t("unsafe: over-long rejected", !isSafePattern("a".repeat(500)));
const w: string[] = [];
t("sanitize drops unsafe pattern + warns", sanitizeConstraints({ pattern: "^(a+)+$", maxLength: 5 }, (m) => w.push(m), "x").pattern === undefined && w.length === 1);
t("sanitize fixes min>max", (() => { const o = sanitizeConstraints({ min: 9, max: 1 }, () => {}, "x"); return o.min === undefined && o.max === undefined; })());
const t0 = Date.now();
validateRecord({ ...base, name: "E", fields: [{ name: "f", type: "string", required: false, constraints: { pattern: "^(a+)+$" } }] }, { f: "a".repeat(40) + "!" });
t("catastrophic pattern does not hang the engine", Date.now() - t0 < 200, `${Date.now() - t0}ms`);

// SQL
const sql = entityToSQL(claim);
t("SQL has NOT NULL/UNIQUE/CHECK and no undefined", /NOT NULL/.test(sql) && /UNIQUE/.test(sql) && /CHECK \(amount IS NULL OR amount >= 0.01\)/.test(sql) && /num_nonnulls\(reviewerid, reviewedat\) IN \(0, 2\)/.test(sql) && !/undefined/.test(sql), sql);
const sqlB = entityToSQL(booking);
t("SQL conditional/compare/enum", /CHECK \(NOT \(mode = 'ONSITE'\) OR address IS NOT NULL\)/.test(sqlB) && /startat IS NULL OR endat IS NULL OR startat < endat/.test(sqlB) && /status IN \('DRAFT'/.test(sqlB), sqlB);

// Model-output normalisation
const dirty = normalizeDefinitionConstraints({ ...INITIAL_PRODUCT_DEFINITION, dataEntities: [{ ...base, name: "Thing", fields: [
  { name: "code", type: "string", required: true, format: "identifier", pattern: "^(x+)+$", maxLength: 10, origin: "INFERRED" } as any,
  { name: "created_at", type: "string", required: false } as any,
], rules: [{ id: "bad", kind: "compare", left: "code", op: "lt", right: "ghost", message: "m" }] }] } as any);
const th = dirty.definition.dataEntities[0];
t("normalize: unsafe pattern dropped, others kept", th.fields[0].constraints?.pattern === undefined && th.fields[0].constraints?.maxLength === 10 && th.fields[0].constraints?.format === "identifier");
t("normalize: flat props folded away", !("format" in th.fields[0]) && !("maxLength" in th.fields[0]));
t("normalize: alias overlay keeps name, becomes system", th.fields.some((f) => f.name === "created_at" && f.source === "system"));
t("normalize: rule with unknown field dropped + warned", (th.rules ?? []).length === 0 && dirty.warnings.some((x) => x.includes("ghost")));
t("normalize: system fields present", th.fields.some((f) => f.name === "id" && f.source === "system"));
t("normalize: inferred count reported", dirty.inferredCount >= 1);

// Route handler (mock req/res)
const call = (body: unknown) => { let status = 200, payload: any; const res: any = { status(c: number) { status = c; return res; }, json(p: unknown) { payload = p; return res; } }; validateRecordHandler({ body } as any, res); return { status, payload }; };
const good = call({ entity: claim, record: c0 });
t("route: valid -> 200 valid:true", good.status === 200 && good.payload.valid === true, JSON.stringify(good));
const bad = call({ entity: claim, record: { ...c0, amount: -1 } });
t("route: invalid -> 422 with issues", bad.status === 422 && bad.payload.issues[0].path === "amount", JSON.stringify(bad));
const mal = call({ entity: { name: "X" }, record: {} });
t("route: malformed -> 400 with issues[]", mal.status === 400 && Array.isArray(mal.payload.issues), JSON.stringify(mal));
const evil = call({ entity: { ...claim, fields: [{ name: "f", type: "string", required: false, constraints: { pattern: "^(a+)+$" } }] }, record: { f: "a".repeat(40) + "!" } });
t("route: unsafe client pattern is neutralised (200)", evil.status === 200, JSON.stringify(evil));
const big = call({ entity: claim, record: { f: "x".repeat(1_100_000) } });
t("route: oversize -> 413", big.status === 413, String(big.status));

// Pipeline on the local engine (no LLM keys in this process) + schema acceptance
(async () => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  const { INITIAL_BUSINESS_UNDERSTANDING } = await import("../src/data/defaultData");
  const { generateProductDefinition, generateEngineeringPackageData } = await import("../server/aiReasoningService");
  const { ProductDefinitionSchema } = await import("../server/aiSchemas");
  const { zodOutputFormat } = await import("@anthropic-ai/sdk/helpers/zod");

  const def = await generateProductDefinition(INITIAL_BUSINESS_UNDERSTANDING, "Any Product", "Any Unit");
  const ents = def.dataEntities;
  t("pipeline: definition has entities", ents.length > 0);
  t("pipeline: every entity has system fields", ents.every((e) => e.fields.some((f) => f.source === "system" && f.origin === "SYSTEM")));
  t("pipeline: legacy audit columns became system fields (name kept)", ents.some((e) => e.fields.some((f) => f.name === "created_at" && f.source === "system")));
  t("pipeline: BU review question added when fields were inferred", def.openQuestions.some((q) => q.id === "oq-constraint-validation"));
  const pkg = generateEngineeringPackageData(def, []);
  t("pipeline: SQL carries constraints (NOT NULL, CHECK) and no undefined", /NOT NULL/.test(pkg.dataModelSQL) && /CHECK \(/.test(pkg.dataModelSQL) && !/undefined/.test(pkg.dataModelSQL));
  t("pipeline: requirements doc has a validation section", pkg.functionalRequirementsMarkdown.includes("### 8. Data Validation Rules"));

  // A realistic model response (flat constraints, lifecycle, rules, entity link) must validate for the Gemini path
  const screen = { id: "s1", name: "S", module: "M", layoutType: "form-wizard", components: ["c"], purpose: "p", confidence: "INFERRED", evidence: ["Industry benchmark: x"],
    ui: { kpis: [{ label: "K", value: "1", trend: "up", delta: "+1" }], filters: ["All"], table: { title: "T", columns: ["A", "Status"], rows: [["a", "Active"]] }, detailPanels: [{ title: "P", items: [{ label: "l", value: "v" }] }], primaryActions: ["Go"], entity: "Thing" } };
  const sample = { objective: "o", personas: [], modules: [], screens: [screen], navigation: [], userJourneys: [], businessRules: [], integrations: [], permissions: [], notifications: [], validations: [], assumptions: [], openQuestions: [], evidenceMapping: [],
    dataEntities: [{ id: "e1", name: "Thing", description: "d", relationships: [], confidence: "INFERRED", evidence: ["x"],
      fields: [{ name: "code", type: "string", required: true, format: "identifier", maxLength: 12, pattern: "^[A-Z]{2}-\\d{4}$", unique: true, origin: "INFERRED" }, { name: "state", type: "enum", required: true, format: "enum", enumValues: ["NEW", "DONE"] }],
      lifecycle: { statusField: "state", states: ["NEW", "DONE"], initial: "NEW", transitions: [{ from: "NEW", to: "DONE" }] },
      rules: [{ id: "r1", kind: "conditional", when: { field: "state", op: "eq", value: "DONE" }, effect: "required", target: "code", message: "m" }],
      crossRecordRules: ["Codes must be unique across all records."] }] };
  const parsed = ProductDefinitionSchema.safeParse(sample);
  t("schema: realistic model output validates", parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues[0]));
  let jsonLen = 0;
  try { jsonLen = JSON.stringify((zodOutputFormat(ProductDefinitionSchema) as any).schema).length; } catch { jsonLen = -1; }
  t("schema: converts to a structured-output JSON schema", jsonLen > 0, String(jsonLen));
  console.log(`      (structured-output schema size: ${jsonLen} chars)`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
