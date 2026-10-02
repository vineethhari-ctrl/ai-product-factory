// Thin input, no LLM: a product name alone must still yield a complete, valid, stable prototype.
delete process.env.GEMINI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

import { readFileSync } from "node:fs";
import { analyzeBusinessMaterial, generateProductDefinition, generatePrototypeUI } from "../server/aiReasoningService";
import { deriveOperatorRole, deriveSubject } from "../server/blueprint";
import { parseBrief } from "../server/briefParser";
import { validateRecord, withSystemFields } from "../src/services/validationEngine";
import type { ProductDefinition } from "../src/types";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); };
const quiet = async <T>(fn: () => Promise<T>) => { const w = console.warn, l = console.log; console.warn = console.log = () => {}; try { return await fn(); } finally { console.warn = w; console.log = l; } };

t("subject: product-type words dropped, plural singularised", deriveSubject("Warranty Claims Portal") === "Warranty Claim", deriveSubject("Warranty Claims Portal"));
t("subject: acronyms kept", deriveSubject("Fleet EV Tracker") === "Fleet EV", deriveSubject("Fleet EV Tracker"));
t("subject: falls back to BU, then a neutral noun", deriveSubject("Portal", "Field Inspections") === "Field Inspection" && deriveSubject("App") === "Request");

t("subject: head phrase before a preposition, activity noun as record", deriveSubject("Bay planning for Job Controller in the Service workshop") === "Bay Plan", deriveSubject("Bay planning for Job Controller in the Service workshop"));
t("subject: product-type role words dropped", deriveSubject("Volunteer Shift Planner") === "Volunteer Shift", deriveSubject("Volunteer Shift Planner"));
t("operator role: taken from 'for <role>'", deriveOperatorRole("Bay planning for Job Controller in the Service workshop") === "Job Controller" && deriveOperatorRole("Portal for Service Requests") === undefined);

async function pipeline(name: string, bu: string, description = ""): Promise<ProductDefinition> {
  const u = await quiet(() => analyzeBusinessMaterial([], name, bu, description));
  const d = await quiet(() => generateProductDefinition(u, name, bu));
  return quiet(() => generatePrototypeUI(d));
}

// Three unlike inputs; the engine knows none of them.
for (const [name, bu] of [["Warranty Claims Portal", "After-Sales"], ["Volunteer Shift Planner", "Community Programs"], ["Lab Sample Tracker", "Research Ops"]]) {
  const def = await pipeline(name, bu);
  const tag = `[${name}]`;
  t(`${tag} benchmark applied`, def.benchmark?.applied === true);
  t(`${tag} at least 6 screens`, def.screens.length >= 6, String(def.screens.length));
  t(`${tag} all five layouts used`, new Set(def.screens.map((s) => s.layoutType)).size === 5);
  t(`${tag} every screen has a full UI blueprint`, def.screens.every((s) => s.ui && s.ui.kpis.length >= 3 && s.ui.table.rows.length >= 5 && s.ui.primaryActions.length >= 2 && s.ui.detailPanels.length >= 2));
  t(`${tag} status is the last column`, def.screens.every((s) => /status|state|stage/i.test(s.ui!.table.columns.at(-1)!)), def.screens.map((s) => s.ui!.table.columns.join("/")).join(" ; "));
  t(`${tag} rows match column count`, def.screens.every((s) => s.ui!.table.rows.every((r) => r.length === s.ui!.table.columns.length)));
  t(`${tag} no placeholder cells`, def.screens.every((s) => s.ui!.table.rows.flat().every((c) => c && c !== "—" && !/undefined|NaN/.test(c))));
  t(`${tag} filter chips match sample rows`, def.screens.every((s) => s.ui!.filters.slice(1).every((f) => s.ui!.table.rows.some((r) => r.some((c) => c.toLowerCase().includes(f.toLowerCase()))))));
  const form = def.screens.find((s) => s.layoutType === "form-wizard")!;
  const entity = def.dataEntities.find((e) => e.name === form.ui!.entity);
  t(`${tag} form screen edits a real entity with a lifecycle`, !!entity?.lifecycle);
  if (entity) {
    const record = { title: "Sample request title", category: "STANDARD", priority: "MEDIUM", requesterEmail: "a@example.com" };
    t(`${tag} a well-formed record validates`, validateRecord(withSystemFields(entity), record).length === 0, JSON.stringify(validateRecord(withSystemFields(entity), record)));
    t(`${tag} reference number is system-set`, validateRecord(withSystemFields(entity), { ...record, referenceNumber: "X-1" }).some((i) => i.path === "referenceNumber" && i.code === "system_field"));
    t(`${tag} conditional rule fires`, validateRecord(withSystemFields(entity), { ...record, priority: "CRITICAL" }).some((i) => i.path === "dueDate" && i.code === "required"));
  }
  t(`${tag} read-only auditor persona present`, def.permissions.some((p) => p.accessLevel === "Read Only") && def.personas.some((p) => p.permissions.some((x) => /read only/i.test(x))));
  t(`${tag} predictions are INFERRED and tagged`, def.screens.every((s) => s.confidence === "INFERRED" && s.evidence.some((e) => e.startsWith("Industry benchmark"))));
  t(`${tag} BU is asked to validate`, def.openQuestions.some((q) => q.id === "oq-benchmark-validation" && q.urgency === "blocking"));
  t(`${tag} navigation covers every screen`, def.screens.every((s) => def.navigation.some((n) => n.screenId === s.id)));
}

// The user named in the product name becomes the operator persona.
const named = await pipeline("Bay planning for Job Controller in the Service workshop", "Operations");
t("named role becomes the operator persona", named.personas.some((p) => p.name === "Job Controller") && named.userJourneys.some((j) => j.persona === "Job Controller"));
t("named product: screens use the derived subject", named.screens.some((s) => s.name === "Bay Plan Work Queue"), named.screens.map((s) => s.name).join(", "));

// A definition saved by the old engine (one placeholder screen, legacy UI) is upgraded on Build Prototype.
const stale = JSON.parse(JSON.stringify(named)) as ProductDefinition;
stale.screens = [{ id: "scr-1", name: "Primary Application Screen", module: "Core Module", layoutType: "dashboard", components: [], purpose: "No UI screenshots uploaded.", confidence: "MISSING", evidence: [],
  ui: { ...named.screens[0].ui!, benchmarkNote: "Generic enterprise workbench pattern. Upload materials and regenerate." } }];
const upgraded = await quiet(() => generatePrototypeUI(stale));
t("stale placeholder definition is rebuilt", upgraded.screens.length >= 6 && !upgraded.screens.some((s) => s.name === "Primary Application Screen"), upgraded.screens.map((s) => s.name).join(", "));
t("legacy UI is never reused", upgraded.screens.every((s) => !/^Generic enterprise workbench/.test(s.ui?.benchmarkNote ?? "")));
t("upgrade does not duplicate open questions", new Set(upgraded.openQuestions.map((q) => q.id)).size === upgraded.openQuestions.length);

// A brief that describes a process drives the prototype: stages, parties and parts come from its words.
const BRIEF = `Northbeam runs a Widget 360 programme with ASPs (Authorised Service Partners) who assemble and maintain widgets.
Each widget has parts such as housing, sensor module, power pack and cable set, etc. The platform must give traceability
across the widget lifecycle: Request → Widget configuration → Order → Assembly & serialisation → Inspection → Handover → Support → Renewal
The key requirement is a proof of record for every widget, shared between ASPs, installers and the customer/installer network.`;
const parsed = parseBrief(BRIEF, "Widget Portal for ASPs");
t("brief: stages from the arrow chain, in order, clause text trimmed", JSON.stringify(parsed.stages) === JSON.stringify(["Request", "Widget Configuration", "Order", "Assembly & Serialisation", "Inspection", "Handover", "Support", "Renewal"]), JSON.stringify(parsed.stages));
t("brief: subject from 'X 360'", parsed.subject === "Widget", String(parsed.subject));
t("brief: parties from acronym definition, role plurals and slash groups", ["ASP", "Installer", "Customer"].every((p) => parsed.parties.includes(p)), parsed.parties.join(","));
t("brief: parts from a 'such as' list", parsed.parts?.name === "Part" && parsed.parts.types.join(",") === "Housing,Sensor Module,Power Pack,Cable Set", JSON.stringify(parsed.parts));
t("brief: no chain means no stages", parseBrief("We need a portal for partners. It must be fast.").stages.length === 0);

const proc = await (async () => {
  const u = await quiet(() => analyzeBusinessMaterial([], "Widget Portal for ASPs", "Operations", BRIEF));
  const d = await quiet(() => generateProductDefinition(u, "Widget Portal for ASPs", "Operations"));
  return { u, d: await quiet(() => generatePrototypeUI(d)) };
})();
const pd = proc.d;
t("process: understanding carries the parsed brief", proc.u.blueprintBrief?.stages.length === 8 && pd.blueprintBrief?.subject === "Widget");
t("process: every stage is covered by a work screen", parsed.stages.slice(1).every((st) => pd.screens.some((sc) => sc.name.split(" + ").includes(st))), pd.screens.map((s) => s.name).join(" | "));
t("process: first stage is the intake form on the lifecycle entity", (() => { const f = pd.screens.find((s) => s.layoutType === "form-wizard"); const e = pd.dataEntities.find((x) => x.name === f?.ui?.entity); return f?.name === "New Request" && e?.lifecycle?.initial === "Request"; })());
t("process: lifecycle states are the stages plus hold and cancel", JSON.stringify(pd.dataEntities[0].lifecycle?.states) === JSON.stringify([...parsed.stages, "On Hold", "Cancelled"]));
t("process: stage order is enforced", (() => { const e = withSystemFields(pd.dataEntities[0]); return validateRecord(e, { status: "Inspection" }, "update", { existing: { status: "Request" } }).some((i) => i.code === "invalid_transition") && !validateRecord(e, { status: "Widget Configuration" }, "update", { existing: { status: "Request" } }).some((i) => i.path === "status"); })());
t("process: 360 view shows the full stage timeline and parts", (() => { const v = pd.screens.find((s) => s.layoutType === "profile-360")!.ui!; return v.detailPanels.some((p) => p.title === "Lifecycle Timeline" && p.items.length === 8) && v.detailPanels.some((p) => p.items.some((i) => i.label === "Sensor Module")); })());
t("process: parties become personas, with the auditor kept read-only", ["ASP", "Installer", "Customer"].every((p) => pd.personas.some((x) => x.name === p)) && pd.permissions.some((p) => p.role === "Compliance Auditor" && p.accessLevel === "Read Only"));
t("process: parts entity with unique serials", pd.dataEntities.some((e) => e.name === "Part" && e.fields.some((f) => f.name === "serialNumber" && f.constraints?.unique)));
t("process: stage screens filter on stages present in their rows", pd.screens.filter((s) => s.id.startsWith("scr-bp-stage")).every((s) => s.ui!.filters.slice(1).every((f) => s.ui!.table.rows.some((r) => r.includes(f)))));
t("process: rows match columns on every screen", pd.screens.every((s) => s.ui!.table.rows.every((r) => r.length === s.ui!.table.columns.length)));
t("process: everything predicted is tagged for BU review", pd.screens.every((s) => s.confidence === "INFERRED" && s.evidence[0].startsWith("Industry benchmark")) && pd.openQuestions.some((q) => q.id === "oq-benchmark-validation"));

// Stable: the same input renders the same prototype.
const a = await pipeline("Warranty Claims Portal", "After-Sales");
const b = await pipeline("Warranty Claims Portal", "After-Sales");
t("deterministic sample data", JSON.stringify(a.screens.map((s) => s.ui)) === JSON.stringify(b.screens.map((s) => s.ui)));

// Rich input is left alone.
const rich = await quiet(() => analyzeBusinessMaterial(
  [1, 2, 3].map((i) => ({ id: `m${i}`, filename: `notes-${i}.txt`, fileType: "text" as const, sizeBytes: 1, uploadedAt: "", status: "ready" as const, contentSnippet: "The Case Manager must approve every Refund Request. ".repeat(40) })),
  "Refund Desk", "Finance"));
t("rich input: no blueprint applied", !rich.benchmark && !rich.screens.some((s) => s.id.startsWith("scr-bp-")));

// Domain neutrality: the blueprint names no business domain.
const src = ["blueprint.ts", "processBlueprint.ts", "briefParser.ts"].map((f) => readFileSync(new URL(`../server/${f}`, import.meta.url), "utf8")).join("\n").toLowerCase();
const domains = ["vehicle", "patient", "claim", "insurance", "fleet", "loan", "invoice", "student", "dealer", "clinic", "shipment"];
t("blueprint, process blueprint and brief parser are domain-neutral", domains.every((d) => !src.includes(d)), domains.filter((d) => src.includes(d)).join(","));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
