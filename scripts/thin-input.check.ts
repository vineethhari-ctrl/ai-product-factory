// Thin input, no LLM: a product name alone must still yield a complete, valid, stable prototype.
delete process.env.GEMINI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

import { readFileSync } from "node:fs";
import { analyzeBusinessMaterial, generateProductDefinition, generatePrototypeUI } from "../server/aiReasoningService";
import { deriveSubject } from "../server/blueprint";
import { validateRecord, withSystemFields } from "../src/services/validationEngine";
import type { ProductDefinition } from "../src/types";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); };
const quiet = async <T>(fn: () => Promise<T>) => { const w = console.warn, l = console.log; console.warn = console.log = () => {}; try { return await fn(); } finally { console.warn = w; console.log = l; } };

t("subject: product-type words dropped, plural singularised", deriveSubject("Warranty Claims Portal") === "Warranty Claim", deriveSubject("Warranty Claims Portal"));
t("subject: acronyms kept", deriveSubject("Fleet EV Tracker") === "Fleet EV", deriveSubject("Fleet EV Tracker"));
t("subject: falls back to BU, then a neutral noun", deriveSubject("Portal", "Field Inspections") === "Field Inspection" && deriveSubject("App") === "Request");

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
const src = readFileSync(new URL("../server/blueprint.ts", import.meta.url), "utf8").toLowerCase();
const domains = ["vehicle", "patient", "claim", "insurance", "fleet", "loan", "invoice", "student", "dealer", "clinic", "shipment"];
t("blueprint is domain-neutral", domains.every((d) => !src.includes(d)), domains.filter((d) => src.includes(d)).join(","));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
