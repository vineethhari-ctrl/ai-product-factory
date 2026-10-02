import type {
  BusinessRuleDefinition,
  DataEntityDefinition,
  DataFieldDefinition,
  IntegrationDefinition,
  ModuleDefinition,
  NotificationRule,
  PersonaDefinition,
  ProductDefinition,
  ScreenDefinition,
  ScreenUISpec,
  UserJourneyDefinition,
  ValidationRule,
} from "../src/types";
import { BENCHMARK_TAG } from "./benchmark";
import { resolveFieldConstraints } from "../src/services/validationEngine";

/**
 * Product blueprint for thin input without an LLM.
 *
 * The local engine cannot look up how an industry builds a product, but almost
 * every operational product shares one shape: a record moves through a
 * lifecycle, people capture it, work a queue, approve it and watch the numbers.
 * This module builds that shape around the product's own subject (derived from
 * the name the BU typed), so a product name alone yields a complete,
 * multi-screen prototype. It has no domain knowledge: every noun comes from
 * the BU input, and every item is INFERRED with an "Industry benchmark" tag so
 * the BU confirms it before sign-off.
 *
 * Sample data is generated from a seeded PRNG, so the same definition always
 * renders the same prototype.
 */

export const PATTERN = (p: string) => `${BENCHMARK_TAG}: ${p}`;

// ─── Subject ────────────────────────────────────────────────────────────────

/** Words that name the kind of software rather than what it manages. */
const PRODUCT_SUFFIXES = new Set([
  "portal", "app", "application", "platform", "system", "hub", "suite", "console", "manager",
  "management", "tracker", "tracking", "workbench", "center", "centre", "studio", "cloud", "pro",
  "360", "dashboard", "tool", "tools", "engine", "online", "digital", "solution", "workspace",
  "mvp", "v1", "v2", "prototype", "module", "planner", "scheduler", "the", "a", "an", "for", "and", "of", "my", "new",
]);

function titleWord(w: string): string {
  if (w.length <= 4 && w === w.toUpperCase() && /[A-Z]/.test(w)) return w; // keep acronyms
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

function singular(w: string): string {
  if (w.length <= 3 || w === w.toUpperCase()) return w;
  if (/ies$/i.test(w)) return w.slice(0, -3) + "y";
  if (/(ss|us|is)$/i.test(w)) return w;
  if (/(sh|ch|x)es$/i.test(w)) return w.slice(0, -2);
  if (/s$/i.test(w)) return w.slice(0, -1);
  return w;
}

export function plural(s: string): string {
  if (/[^aeiou]y$/i.test(s)) return s.slice(0, -1) + "ies";
  if (/(s|sh|ch|x)$/i.test(s)) return s + "es";
  return s + "s";
}

/** Activity nouns that name a record better in their object form ("Bay planning" -> "Bay Plan"). */
const ACTIVITY_TO_RECORD: Record<string, string> = {
  planning: "plan", scheduling: "schedule", forecasting: "forecast", rostering: "roster", budgeting: "budget",
};

/** Words that start a qualifier: "Bay planning | for Job Controller | in the workshop". */
const PREPOSITION = /\s+(?:for|in|at|on|with|by|across|within|to|from|via|under)\s+/i;

/**
 * The record the product manages: "Service Requests Portal" -> "Service Request",
 * "Bay planning for Job Controller in the workshop" -> "Bay Plan".
 * The phrase before the first preposition is the product's head; qualifiers after it
 * name who uses it or where, not what it manages.
 */
export function deriveSubject(productName: string, businessUnit = ""): string {
  const pick = (text: string) => {
    const words = text.replace(/[^A-Za-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean)
      .map((w) => ACTIVITY_TO_RECORD[w.toLowerCase()] ?? w);
    const kept = words.filter((w) => !PRODUCT_SUFFIXES.has(w.toLowerCase())).slice(-3);
    if (kept.length === 0) return "";
    kept[kept.length - 1] = singular(kept[kept.length - 1]);
    return kept.map(titleWord).join(" ");
  };
  const head = productName.split(PREPOSITION)[0];
  return pick(head) || pick(productName) || pick(businessUnit) || "Request";
}

/** Generic job-role endings; a "for <role>" qualifier ending in one of these names the main user. */
const ROLE_ENDING = /(controller|manager|planner|dispatcher|coordinator|supervisor|officer|agent|advisor|adviser|analyst|operator|technician|engineer|specialist|lead|administrator|admin|clerk|executive|inspector|auditor|reviewer|approver|assessor|scheduler|owner|associate|representative)s?$/i;

/** The main user the BU named, e.g. "Bay planning for Job Controller in ..." -> "Job Controller". */
export function deriveOperatorRole(productName: string, description = ""): string | undefined {
  for (const text of [productName, description]) {
    const m = text.match(/\bfor\s+(?:the\s+|a\s+|an\s+)?([A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*){0,3})/i);
    if (!m) continue;
    const phrase = m[1].split(PREPOSITION)[0].trim();
    if (ROLE_ENDING.test(phrase)) return phrase.split(/\s+/).map((w, i, a) => titleWord(i === a.length - 1 ? singular(w) : w)).join(" ");
  }
  return undefined;
}

export const DEFAULT_OPERATOR = "Operations Specialist";

export function codePrefix(subject: string): string {
  const letters = subject.split(/\s+/).map((w) => w[0]).join("").toUpperCase();
  return (letters.length >= 2 ? letters : subject.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase()).slice(0, 4) || "REC";
}

// ─── Seeded sample data ─────────────────────────────────────────────────────

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function rng(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Obviously fictional people and organisations; never real personal data. */
export const PEOPLE = ["Priya Raman", "Marcus Chen", "Elena García", "Samuel Okafor", "Hannah Weber", "Diego Alvarez", "Aisha Khan", "Tomás Novak"];
export const ORGS = ["Northwind Group", "Contoso Ltd", "Fabrikam Inc", "Tailspin Partners", "Litware Co", "Adventure Works", "Woodgrove Unit"];
const QUALIFIERS = ["standard intake", "expedited", "renewal", "exception review", "follow-up", "annual cycle", "escalated"];

const humanize = (name: string) =>
  name
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\bid\b/gi, "ID")
    .replace(/^./, (c) => c.toUpperCase());

/** "IN_REVIEW" -> "In Review" so status chips colour and read naturally. */
export const stateLabel = (s: string) =>
  /[a-z]/.test(s) ? s // already a readable label, e.g. a stage from the brief
  : s.toLowerCase().split(/[_\s]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

export const DAY = 86_400_000;
/** Fixed anchor so sample dates do not change between renders. */
export const ANCHOR = Date.UTC(2026, 8, 28);
export const fmtDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

interface SampleContext {
  subject: string;
  entity: DataEntityDefinition;
  rand: () => number;
  /** Status values to cycle through instead of spreading rows over every state. */
  statusCycle?: string[];
}

/** One plausible, domain-neutral value for a field, based on its format and name only. */
function sampleValue(field: DataFieldDefinition, row: number, ctx: SampleContext): string {
  const c = resolveFieldConstraints(field);
  const n = field.name.toLowerCase();
  const r = ctx.rand;
  const lc = ctx.entity.lifecycle;
  if (lc && field.name === lc.statusField) {
    // Lifecycles written as readable labels (stages from a brief) are shown as written.
    const readable = lc.states.some((v) => /[a-z]/.test(v));
    if (ctx.statusCycle?.length) { const v = ctx.statusCycle[row % ctx.statusCycle.length]; return readable ? v : stateLabel(v); }
    if (readable) return lc.states[(row * 3 + 1) % lc.states.length];
    return stateLabel(lc.states[(row * 3 + 1) % lc.states.length]);
  }
  if (c.enumValues?.length) {
    const v = c.enumValues[(row + Math.floor(r() * 2)) % c.enumValues.length];
    // A list that already holds readable labels ("Partner", "ABC") is shown as written.
    return c.enumValues.some((e) => /[a-z]/.test(e)) ? v : stateLabel(v);
  }
  switch (c.format) {
    case "email": {
      const p = PEOPLE[(row + 2) % PEOPLE.length].toLowerCase().normalize("NFD").replace(/[^a-z ]/g, "").split(" ");
      return `${p[0]}.${p[1]}@example.com`;
    }
    case "phone": return `+1 555 01${String(10 + row * 7).padStart(2, "0")}`;
    case "url": return `https://example.com/${n.replace(/[^a-z]/g, "")}/${row + 1}`;
    case "uuid": return `${hashSeed(`${field.name}${row}`).toString(16).padStart(8, "0")}-…`;
    case "date": return fmtDate(ANCHOR + (Math.floor(r() * 30) - 10) * DAY);
    case "datetime": return `${fmtDate(ANCHOR - Math.floor(r() * 12) * DAY)} ${String(8 + Math.floor(r() * 9)).padStart(2, "0")}:${r() > 0.5 ? "30" : "00"}`;
    case "time": return `${String(8 + row).padStart(2, "0")}:${row % 2 ? "30" : "00"}`;
    case "boolean": return r() > 0.4 ? "Yes" : "No";
    case "percentage": return `${(60 + r() * 38).toFixed(1)}%`;
    case "integer": {
      const lo = c.min ?? 1, hi = Math.min(c.max ?? 250, lo + 500);
      return String(Math.floor(lo + r() * (hi - lo)));
    }
    case "decimal": {
      const lo = c.min ?? 100, hi = Math.min(c.max ?? 25_000, lo + 50_000);
      return (lo + r() * (hi - lo)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    case "currency-code": return ["USD", "EUR", "GBP"][row % 3];
    case "country-code": return ["US", "DE", "IN", "GB"][row % 4];
  }
  if (c.format === "identifier" || c.unique || /(^|_)(ref|reference|code|number|no)$|reference|number$/.test(n)) {
    return `${codePrefix(ctx.subject)}-${String(10_240 + row * 37 + Math.floor(r() * 9))}`;
  }
  if (/(assignee|owner|agent|reviewer|approver|user|by$|name$|contact|requester|person)/.test(n)) return PEOPLE[(row * 3) % PEOPLE.length];
  if (/(org|company|account|customer|client|party|vendor|supplier|site|location|branch)/.test(n)) return ORGS[row % ORGS.length];
  if (/(title|subject|summary|label|headline)/.test(n)) return `${ctx.subject} for ${ORGS[row % ORGS.length]} · ${QUALIFIERS[row % QUALIFIERS.length]}`;
  if (/(date|due|deadline|at$)/.test(n)) return fmtDate(ANCHOR + (row * 2 - 4) * DAY);
  if (/(amount|value|cost|price|total|fee|budget)/.test(n)) return (500 + r() * 24_500).toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (/(count|qty|quantity|score)/.test(n)) return String(1 + Math.floor(r() * 40));
  if (/(note|description|comment|reason|detail)/.test(n)) return ["Awaiting supporting document", "Checked against policy", "Customer contacted", "Ready for sign-off"][row % 4];
  return `${humanize(field.name)} ${String.fromCharCode(65 + row)}`;
}

/** Fields worth showing as columns, most identifying first. System and bulky fields are skipped. */
function pickColumns(entity: DataEntityDefinition, max: number): DataFieldDefinition[] {
  // System fields are hidden, except the lifecycle status and a system-generated business key.
  const fields = entity.fields.filter((f) => f.source !== "system" || f.name === entity.lifecycle?.statusField || (resolveFieldConstraints(f).unique && !/^id$/i.test(f.name)));
  const bulky = (f: DataFieldDefinition) => {
    const c = resolveFieldConstraints(f);
    return c.format === "free-text" || /json|text|uuid/i.test(f.type) || c.format === "uuid" || /(^id$|_id$|Id$|created|updated|version)/.test(f.name);
  };
  const score = (f: DataFieldDefinition) => {
    const c = resolveFieldConstraints(f);
    const n = f.name.toLowerCase();
    if (c.unique || c.format === "identifier") return 0;
    if (c.format === "email" || c.format === "phone") return 8; // contact details belong in the detail panel
    if (/(title|name|subject|summary)/.test(n)) return 1;
    if (/(org|customer|client|account|requester)/.test(n)) return 2;
    if (c.enumValues?.length && f.name !== entity.lifecycle?.statusField) return 3;
    if (/(assignee|owner|reviewer)/.test(n)) return 4;
    if (/(due|date|deadline)/.test(n)) return 5;
    if (f.name === entity.lifecycle?.statusField || /status|state/.test(n)) return 6;
    return 7;
  };
  const isStatus = (f: DataFieldDefinition) => f.name === entity.lifecycle?.statusField || /^(status|state|stage)$/i.test(f.name);
  const status = fields.find(isStatus);
  const ranked = fields.filter((f) => !bulky(f) && f !== status).sort((a, b) => score(a) - score(b));
  // The status column is always kept: chips, colours and the selected-record badge depend on it.
  return status ? [...ranked.slice(0, max - 1), status] : ranked.slice(0, max);
}

export interface SampleTable {
  columns: string[];
  rows: string[][];
}

export function sampleTable(entity: DataEntityDefinition, subject: string, seed: string, rowCount = 7, statusCycle?: string[]): SampleTable {
  const rand = rng(seed);
  const ctx: SampleContext = { subject, entity, rand, statusCycle };
  let cols = pickColumns(entity, 6);
  const hasKey = cols.some((f) => resolveFieldConstraints(f).unique || resolveFieldConstraints(f).format === "identifier");
  if (!hasKey) cols = [{ name: "reference", type: "string", required: true, constraints: { format: "identifier" } }, ...pickColumns(entity, 5)];
  const rows = Array.from({ length: rowCount }, (_, i) => cols.map((f) => sampleValue(f, i, ctx)));
  return { columns: cols.map((f) => humanize(f.name)), rows };
}

// ─── Screen UI ──────────────────────────────────────────────────────────────

const PATTERN_NOTES: Record<ScreenDefinition["layoutType"], string> = {
  dashboard: "Mirrors the command-center pattern of leading operations products: headline KPIs first, then the records that need attention.",
  "table-detail": "Mirrors the record-register pattern of mature enterprise products: a filterable grid with the selected record's facts beside it.",
  "split-view": "Mirrors the inbox-and-triage pattern of best-in-class service consoles: work the queue on the left, act on the right without losing context.",
  "form-wizard": "Mirrors the guided-intake pattern of top self-service products: short steps, inline validation and a server-checked submit.",
  "profile-360": "Mirrors the 360-degree record view of leading CRM-style products: every fact, owner and event about one record on one page.",
};

const ACTIONS: Record<ScreenDefinition["layoutType"], (s: string) => string[]> = {
  dashboard: (s) => [`Review At-Risk ${plural(s)}`, "Export Report", "Share Snapshot"],
  "table-detail": (s) => [`New ${s}`, "Assign Owner", "Bulk Update", "Export"],
  "split-view": () => ["Take Ownership", "Approve", "Request Information", "Escalate"],
  "form-wizard": (s) => [`Submit ${s}`, "Save Draft"],
  "profile-360": () => ["Advance Status", "Add Note", "Reassign"],
};

/** Build a complete UI blueprint for a screen from its entity; used whenever no model wrote one. */
export function buildScreenUI(
  screen: Pick<ScreenDefinition, "id" | "name" | "layoutType">,
  entity: DataEntityDefinition | undefined,
  subject: string,
  seedBase: string
): ScreenUISpec {
  const seed = `${seedBase}|${screen.id}`;
  const rand = rng(`${seed}|kpi`);
  const ent: DataEntityDefinition = entity ?? blueprintEntities(subject)[0];
  const table = sampleTable(ent, subject, seed);
  const statusIdx = table.columns.length - 1;
  const statuses = [...new Set(table.rows.map((r) => r[statusIdx]).filter(Boolean))];

  const open = 120 + Math.floor(rand() * 380);
  const awaiting = 8 + Math.floor(rand() * 40);
  const sla = (88 + rand() * 10).toFixed(1);
  const cycle = (1.5 + rand() * 4).toFixed(1);
  const kpis: ScreenUISpec["kpis"] = [
    { label: `Open ${plural(subject)}`, value: open.toLocaleString("en-US"), trend: "up", delta: `+${(2 + rand() * 6).toFixed(1)}% vs last week` },
    { label: "Awaiting Decision", value: String(awaiting), trend: "down", delta: `-${Math.ceil(rand() * 9)} since yesterday` },
    { label: "Within SLA", value: `${sla}%`, trend: Number(sla) >= 93 ? "up" : "flat", delta: "Target 95%" },
    { label: "Avg Cycle Time", value: `${cycle} days`, trend: "down", delta: `-${(rand() * 0.8 + 0.1).toFixed(1)} days vs last month` },
  ];

  const selected = table.rows[0] ?? [];
  const facts = table.columns.slice(1, 5).map((label, i) => ({ label, value: selected[i + 1] ?? "" }));
  const people = [PEOPLE[1], PEOPLE[4]];

  let detailPanels: ScreenUISpec["detailPanels"];
  if (screen.layoutType === "form-wizard") {
    // Steps: the canvas renders the entity form, the step titles group its fields.
    detailPanels = [
      { title: "Basics", items: facts.slice(0, 2) },
      { title: "Details", items: facts.slice(2, 4) },
      { title: "Review & Submit", items: [{ label: "Routing", value: "Automatic, by priority" }, { label: "Expected response", value: "Within 2 business days" }] },
    ];
  } else {
    detailPanels = [
      { title: `${subject} Summary`, items: facts },
      {
        title: "Ownership & SLA",
        items: [
          { label: "Owner", value: people[0] },
          { label: "Approver", value: people[1] },
          { label: "SLA due", value: fmtDate(ANCHOR + 2 * DAY) },
          { label: "Time remaining", value: `${1 + Math.floor(rand() * 30)} h` },
        ],
      },
      {
        title: "Recent Activity",
        items: [
          { label: fmtDate(ANCHOR), value: `Status changed by ${people[0]}` },
          { label: fmtDate(ANCHOR - DAY), value: "Document attached" },
          { label: fmtDate(ANCHOR - 2 * DAY), value: `Created by ${PEOPLE[2]}` },
        ],
      },
    ];
  }

  // Chips that really filter the sample rows (the canvas matches them against cell text).
  const filters = ["All", ...statuses.slice(0, 3)];
  const priorityCol = table.rows.flat().find((v) => /^(high|critical|urgent)$/i.test(v));
  if (priorityCol) filters.push(priorityCol);

  const tableTitle =
    screen.layoutType === "split-view" ? `${subject} Queue`
      : screen.layoutType === "dashboard" ? `${plural(subject)} Needing Attention`
      : screen.layoutType === "form-wizard" ? `Recently Submitted ${plural(subject)}`
      : plural(subject);

  return {
    kpis: screen.layoutType === "form-wizard" ? kpis.slice(0, 3) : kpis,
    filters: [...new Set(filters)],
    table: { title: tableTitle, ...table },
    detailPanels,
    primaryActions: ACTIONS[screen.layoutType](subject),
    ...(screen.layoutType === "form-wizard" ? { entity: ent.name } : {}),
    benchmarkNote: PATTERN_NOTES[screen.layoutType],
  };
}

// ─── Blueprint scope ────────────────────────────────────────────────────────

const inferred = <T extends object>(item: T, pattern: string) =>
  ({ ...item, confidence: "INFERRED" as const, evidence: [PATTERN(pattern)] });

export function blueprintPersonas(subject: string, operator = DEFAULT_OPERATOR): PersonaDefinition[] {
  const s = subject, sp = plural(subject).toLowerCase();
  return [
    inferred({ id: "p-bp-1", name: `${s} Requester`, role: "Requester", keyGoals: [`Raise a ${s.toLowerCase()} in minutes`, "See status without chasing anyone"], permissions: ["Create own records", "View own records"] }, "self-service requester role"),
    inferred({ id: "p-bp-2", name: operator, role: operator === DEFAULT_OPERATOR ? "Specialist" : operator, keyGoals: [`Work the ${s.toLowerCase()} queue in priority order`, "Resolve within SLA"], permissions: ["Read/Write assigned records", "Change status"] }, "queue-based specialist role"),
    inferred({ id: "p-bp-3", name: "Team Lead", role: "Approver", keyGoals: ["Approve or reject decisions", "Balance workload and protect SLA"], permissions: ["Approve", "Reassign", "View team dashboards"] }, "approver and team-lead role"),
    inferred({ id: "p-bp-4", name: "Platform Administrator", role: "Administrator", keyGoals: ["Configure categories, SLAs and routing", "Manage users and roles"], permissions: ["Full Administrative Access"] }, "administrator role"),
    inferred({ id: "p-bp-5", name: "Compliance Auditor", role: "Auditor", keyGoals: [`Trace every decision on ${sp}`, "Export evidence for audits"], permissions: ["Read Only", "Audit Logs"] }, "independent read-only audit role"),
  ];
}

export function blueprintEntities(subject: string): DataEntityDefinition[] {
  const prefix = codePrefix(subject);
  const f = (name: string, type: string, required: boolean, notes: string, constraints: DataFieldDefinition["constraints"] = {}): DataFieldDefinition =>
    ({ name, type, required, notes, constraints, origin: "INFERRED" });
  const states = ["DRAFT", "SUBMITTED", "IN_REVIEW", "ON_HOLD", "APPROVED", "REJECTED", "CLOSED"];
  const main: DataEntityDefinition = {
    id: "ent-bp-1",
    name: subject,
    description: `The ${subject.toLowerCase()} the product exists to capture, route, decide and close.`,
    fields: [
      // Generated on create: the form hides it and the server rejects it from clients.
      { ...f("referenceNumber", "string", true, "Human-readable business key, generated by the system and shown to every user", { format: "identifier", pattern: `^${prefix}-[0-9]{4,8}$`, maxLength: 20, unique: true, immutable: true }), source: "system" },
      f("title", "string", true, "Short summary a reviewer can scan", { format: "text", minLength: 5, maxLength: 120 }),
      f("category", "enum", true, "Routes the record to the right team", { format: "enum", enumValues: ["STANDARD", "EXPEDITED", "EXCEPTION"] }),
      f("priority", "enum", true, "Drives queue order and SLA", { format: "enum", enumValues: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] }),
      f("requesterEmail", "string", true, "Who raised it and receives updates", { format: "email", maxLength: 254, sensitivity: "pii" }),
      f("organization", "string", false, "Party the record is raised for", { format: "text", maxLength: 120 }),
      f("assignee", "string", false, "Specialist currently responsible", { format: "text", maxLength: 80 }),
      f("dueDate", "date", false, "SLA or requested completion date", { format: "date" }),
      f("estimatedValue", "decimal", false, "Monetary value at stake, if any", { format: "decimal", min: 0, max: 100_000_000, precision: 2, sensitivity: "financial" }),
      f("description", "text", false, "Full context for the reviewer", { format: "free-text", maxLength: 4000 }),
      f("decisionReason", "text", false, "Why it was approved, rejected or put on hold", { format: "free-text", maxLength: 2000 }),
      f("status", "enum", true, "Lifecycle state", { format: "enum", enumValues: states }),
    ],
    lifecycle: {
      statusField: "status",
      states,
      initial: "DRAFT",
      transitions: [
        { from: "DRAFT", to: "SUBMITTED" }, { from: "SUBMITTED", to: "IN_REVIEW" },
        { from: "IN_REVIEW", to: "ON_HOLD" }, { from: "ON_HOLD", to: "IN_REVIEW" },
        { from: "IN_REVIEW", to: "APPROVED" }, { from: "IN_REVIEW", to: "REJECTED" },
        { from: "APPROVED", to: "CLOSED" }, { from: "REJECTED", to: "CLOSED" },
      ],
    },
    rules: [
      { id: "bp-r1", kind: "conditional", when: { field: "status", op: "eq", value: "REJECTED" }, effect: "required", target: "decisionReason", message: "Give a reason before rejecting.", origin: "INFERRED" },
      { id: "bp-r2", kind: "conditional", when: { field: "status", op: "eq", value: "ON_HOLD" }, effect: "required", target: "decisionReason", message: "Say what the record is waiting for.", origin: "INFERRED" },
      { id: "bp-r3", kind: "conditional", when: { field: "priority", op: "eq", value: "CRITICAL" }, effect: "required", target: "dueDate", message: "Critical items need a due date.", origin: "INFERRED" },
      { id: "bp-r4", kind: "conditional", when: { field: "category", op: "eq", value: "EXCEPTION" }, effect: "required", target: "description", message: "Describe why this is an exception.", origin: "INFERRED" },
    ],
    crossRecordRules: [
      "referenceNumber is unique across all records and is generated by the system.",
      "assignee must be an active user holding the Specialist or Approver role.",
      `Warn the requester when an open ${subject.toLowerCase()} with the same title and organization already exists.`,
    ],
    relationships: [`${subject} Activity (1:N)`, "Attachment (1:N)", "User (N:1 as assignee)"],
    confidence: "INFERRED",
    evidence: [PATTERN("record-lifecycle pattern: draft, submit, review, decide, close")],
  };
  const activity: DataEntityDefinition = {
    id: "ent-bp-2",
    name: `${subject} Activity`,
    description: `Immutable timeline of comments, status changes and assignments on a ${subject.toLowerCase()}.`,
    fields: [
      f("subjectReference", "string", true, `Reference of the ${subject.toLowerCase()}`, { format: "identifier", maxLength: 20, immutable: true }),
      f("activityType", "enum", true, "What happened", { format: "enum", enumValues: ["COMMENT", "STATUS_CHANGE", "ASSIGNMENT", "ATTACHMENT"], immutable: true }),
      f("fromStatus", "string", false, "Previous status for status changes", { format: "text", maxLength: 40 }),
      f("toStatus", "string", false, "New status for status changes", { format: "text", maxLength: 40 }),
      f("message", "text", false, "Comment text", { format: "free-text", maxLength: 2000 }),
      f("actorEmail", "string", true, "Who did it", { format: "email", maxLength: 254, sensitivity: "pii", immutable: true }),
    ],
    rules: [
      { id: "bp-a1", kind: "conditional", when: { field: "activityType", op: "eq", value: "STATUS_CHANGE" }, effect: "required", target: "toStatus", message: "Record the new status.", origin: "INFERRED" },
      { id: "bp-a2", kind: "conditional", when: { field: "activityType", op: "eq", value: "COMMENT" }, effect: "required", target: "message", message: "Write the comment.", origin: "INFERRED" },
    ],
    crossRecordRules: ["subjectReference must point to an existing record.", "Activity entries are append-only; they are never edited or deleted."],
    relationships: [`${subject} (N:1)`],
    confidence: "INFERRED",
    evidence: [PATTERN("append-only activity timeline")],
  };
  return [main, activity];
}

export function blueprintScreens(subject: string): { modules: ModuleDefinition[]; screens: ScreenDefinition[] } {
  const sp = plural(subject);
  const screens: ScreenDefinition[] = [
    inferred({ id: "scr-bp-1", name: `${subject} Command Center`, module: "Oversight & Insights", layoutType: "dashboard" as const, components: ["KPI tiles", "At-risk list", "Workload by owner"], purpose: `Show leads the health of all ${sp.toLowerCase()} and what needs attention today.` }, "operations command-center dashboard"),
    inferred({ id: "scr-bp-2", name: `${subject} Work Queue`, module: "Work Management", layoutType: "split-view" as const, components: ["Priority-ordered queue", "Record summary", "Decision actions"], purpose: `Let specialists and approvers triage and decide ${sp.toLowerCase()} without leaving the queue.` }, "inbox-and-triage work queue"),
    inferred({ id: "scr-bp-3", name: `${subject} Register`, module: "Work Management", layoutType: "table-detail" as const, components: ["Filterable grid", "Saved views", "Bulk actions"], purpose: `Find, filter and bulk-manage every ${subject.toLowerCase()}.` }, "searchable record register"),
    inferred({ id: "scr-bp-4", name: `New ${subject}`, module: "Intake & Capture", layoutType: "form-wizard" as const, components: ["Stepper", "Validated fields", "Review & submit"], purpose: `Capture a complete, valid ${subject.toLowerCase()} the first time.` }, "guided self-service intake"),
    inferred({ id: "scr-bp-5", name: `${subject} 360`, module: "Work Management", layoutType: "profile-360" as const, components: ["Header with status", "Facts", "Activity timeline"], purpose: `Everything about one ${subject.toLowerCase()}: facts, owner, SLA and history.` }, "360-degree record view"),
    inferred({ id: "scr-bp-6", name: "Performance & SLA Insights", module: "Oversight & Insights", layoutType: "dashboard" as const, components: ["Throughput", "SLA attainment", "Bottleneck by status"], purpose: `Measure throughput, cycle time and SLA attainment across ${sp.toLowerCase()}.` }, "operational analytics dashboard"),
  ];
  const moduleNames = [...new Set(screens.map((s) => s.module))];
  const modules = moduleNames.map((name, i) =>
    inferred({
      id: `mod-bp-${i + 1}`,
      name,
      description: {
        "Oversight & Insights": `Dashboards and reporting across ${sp.toLowerCase()}.`,
        "Work Management": `Queue, register and 360 view for working ${sp.toLowerCase()} to a decision.`,
        "Intake & Capture": `Guided capture of new ${sp.toLowerCase()} with validation.`,
      }[name] ?? name,
      screens: screens.filter((s) => s.module === name).map((s) => s.id),
    }, "capture, work, oversee module split")
  );
  return { modules, screens };
}

export function blueprintJourneys(subject: string, operator = DEFAULT_OPERATOR): UserJourneyDefinition[] {
  const s = subject.toLowerCase();
  return [
    inferred({ id: "uj-bp-1", name: `Raise a ${s}`, persona: `${subject} Requester`, steps: [`Open New ${subject}`, "Fill basics and details; fields validate as they are left", "Review and submit", "Receive reference number and confirmation"], outcome: `A complete ${s} enters the queue with no rework.` }, "self-service intake journey"),
    inferred({ id: "uj-bp-2", name: `Triage and decide a ${s}`, persona: operator, steps: [`Open ${subject} Work Queue sorted by priority`, "Take ownership", "Request information or put on hold if incomplete", "Send to Team Lead for approval"], outcome: "Every record is worked in priority order within SLA." }, "queue triage journey"),
    inferred({ id: "uj-bp-3", name: "Approve or reject", persona: "Team Lead", steps: ["Review the record in the queue", "Check facts and activity in the 360 view", "Approve, or reject with a reason", "Requester is notified"], outcome: "Decisions are fast, justified and traceable." }, "approval journey"),
    inferred({ id: "uj-bp-4", name: "Monitor performance", persona: "Team Lead", steps: [`Open ${subject} Command Center`, "Spot at-risk records", "Reassign workload", "Review SLA trends in Performance & SLA Insights"], outcome: "SLA breaches are prevented, not reported after the fact." }, "operational oversight journey"),
  ];
}

export function blueprintRules(subject: string): BusinessRuleDefinition[] {
  const s = subject.toLowerCase();
  const rules: Array<[string, string, string]> = [
    [`A ${s} can only be submitted when all required fields are valid.`, "Intake", "validated intake"],
    ["Status changes follow the defined lifecycle only; skipped or backward transitions are rejected.", "Lifecycle", "state-machine guard"],
    ["Rejecting or holding a record requires a written reason.", "Decisions", "justified decisions"],
    ["The person who raised a record cannot approve it.", "Segregation of duties", "four-eyes approval"],
    ["Records open past 80% of their SLA are flagged at risk and escalated to the Team Lead at 100%.", "SLA", "SLA escalation"],
    ["Every create, update, status change and export is written to an append-only activity log.", "Audit", "immutable audit trail"],
    ["Personal and financial fields are masked for roles without a need to know.", "Privacy", "least-privilege data access"],
  ];
  return rules.map(([rule, context, pattern], i) =>
    inferred({ id: `br-bp-${i + 1}`, code: `BR-${String(i + 1).padStart(3, "0")}`, rule, context }, pattern)
  );
}

export function blueprintIntegrations(): IntegrationDefinition[] {
  return [
    inferred({ id: "int-bp-1", system: "Identity Provider (SSO)", protocol: "OIDC / SAML 2.0", purpose: "Sign-in and role mapping" }, "enterprise single sign-on"),
    inferred({ id: "int-bp-2", system: "Email & Notification Service", protocol: "REST / Webhook", purpose: "Status, assignment and SLA alerts" }, "event notifications"),
    inferred({ id: "int-bp-3", system: "Document Storage", protocol: "REST (pre-signed URLs)", purpose: "Attachments and supporting evidence" }, "attachment storage"),
    inferred({ id: "int-bp-4", system: "Analytics / BI Export", protocol: "Scheduled export / CDC", purpose: "Reporting on throughput and SLA" }, "operational reporting feed"),
  ];
}

export function blueprintNotifications(subject: string, operator = DEFAULT_OPERATOR): NotificationRule[] {
  return [
    { event: `${subject} submitted`, channel: "Email & In-App", recipient: `${subject} Requester` },
    { event: "Record assigned", channel: "In-App & Push", recipient: operator },
    { event: "Approval requested", channel: "Email & In-App", recipient: "Team Lead" },
    { event: "SLA at risk (80%)", channel: "In-App & Email", recipient: "Team Lead" },
    { event: "Decision made", channel: "Email", recipient: `${subject} Requester` },
  ];
}

export function blueprintValidations(subject: string): ValidationRule[] {
  const prefix = codePrefix(subject);
  return [
    { field: "referenceNumber", validationRule: `System generated, matches ^${prefix}-[0-9]{4,8}$, unique`, errorMessage: "Reference numbers are assigned by the system." },
    { field: "title", validationRule: "Required, 5 to 120 characters", errorMessage: "Give a short title of 5 to 120 characters." },
    { field: "requesterEmail", validationRule: "Required, valid email address", errorMessage: "Enter a valid email address." },
    { field: "dueDate", validationRule: "Required when priority is CRITICAL", errorMessage: "Critical items need a due date." },
    { field: "estimatedValue", validationRule: "Zero or more, two decimal places", errorMessage: "Enter an amount with at most two decimals." },
    { field: "decisionReason", validationRule: "Required when status is REJECTED or ON_HOLD", errorMessage: "Give a reason for this decision." },
  ];
}

/** Best entity for a screen: explicit ui.entity, then a name match, then the first entity with a lifecycle. */
export function entityForScreen(screen: ScreenDefinition, entities: DataEntityDefinition[]): DataEntityDefinition | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (screen.ui?.entity) {
    const exact = entities.find((e) => norm(e.name) === norm(screen.ui!.entity!));
    if (exact) return exact;
  }
  const hay = norm(`${screen.name} ${screen.module} ${screen.purpose}`);
  return (
    entities.filter((e) => norm(e.name).length >= 3 && hay.includes(norm(e.name))).sort((a, b) => b.name.length - a.name.length)[0] ??
    entities.find((e) => e.lifecycle) ??
    entities[0]
  );
}

/** Give every screen without a UI blueprint a complete one. Screens with one are left alone. */
export function ensureScreenUI(definition: ProductDefinition, subjectOverride?: string): ProductDefinition {
  const subject = subjectOverride ?? definition.blueprintBrief?.subject ?? deriveSubject(definition.productName, definition.businessUnit);
  return {
    ...definition,
    screens: definition.screens.map((s) =>
      s.ui ? s : { ...s, ui: buildScreenUI(s, entityForScreen(s, definition.dataEntities), subject, definition.productName) }
    ),
  };
}
