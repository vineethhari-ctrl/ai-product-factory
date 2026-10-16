import type { ProductDefinition } from "../src/types";

/**
 * Prompt for Build Prototype: the AI designs every screen for its job in the BU's process, from the
 * BU's own words (stages, who does each step, journeys, records and rules), and optionally follows
 * the look of a reference screen the BA uploaded.
 *
 * Domain-neutral by rule: no industry, company or product is named here. Every noun the AI uses
 * comes from the definition below. Patterns are described generically ("work queue with side detail").
 * No timestamps or ids beyond the definition's own, so identical requests hit the cache.
 */

const list = (items: string[], max = items.length) => items.slice(0, max).join("; ");

function processSection(def: ProductDefinition): string {
  const brief = def.blueprintBrief;
  if (!brief || brief.stages.length < 2) return "";
  const stages = brief.stages.map((s, i) => `${i + 1}. ${s}${brief.stageOwners?.[i] ? ` (done by ${brief.stageOwners[i]})` : ""}`);
  return [
    "PROCESS IN THE BU'S OWN WORDS (the record moves through these stages in order):",
    ...stages,
    brief.subject ? `Main record: ${brief.subject}` : "",
    brief.parties.length ? `Parties named by the BU: ${list(brief.parties)}` : "",
    brief.parts ? `Child records: ${brief.parts.name} (types: ${list(brief.parts.types)})` : "",
  ].filter(Boolean).join("\n");
}

function entitySection(def: ProductDefinition): string {
  return def.dataEntities.slice(0, 10).map((e) => {
    // System fields (ids, audit stamps) are not shown to business users.
    const fields = e.fields.filter((f) => f.source !== "system").slice(0, 20).map((f) => {
      const c = f.constraints;
      const extras = [f.required ? "required" : "", c?.enumValues?.length ? `one of ${c.enumValues.join("/")}` : ""].filter(Boolean).join(", ");
      return `${f.name} (${f.type}${extras ? `, ${extras}` : ""})`;
    });
    const states = e.lifecycle?.states.length ? `\n  Status values, in order: ${e.lifecycle.states.join(" -> ")}` : "";
    return `- ${e.name}: ${fields.join(", ")}${states}`;
  }).join("\n");
}

export function buildPrototypePrompt(def: ProductDefinition, hasReference: boolean): string {
  const screens = def.screens.map((s, i) =>
    `${i + 1}. id="${s.id}" name="${s.name}" module="${s.module}" current layout="${s.layoutType}"\n   Job: ${s.purpose}${s.components.length ? `\n   Must show: ${list(s.components, 8)}` : ""}`
  ).join("\n");
  const personas = def.personas.map((p) => `- ${p.name} (${p.role}): goals ${list(p.keyGoals, 3)}`).join("\n");
  const journeys = def.userJourneys.slice(0, 8).map((j) => `- ${j.name} (${j.persona}): ${j.steps.join(" -> ")} => ${j.outcome}`).join("\n");
  const rules = def.businessRules.slice(0, 12).map((r) => `- [${r.code}] ${r.rule}`).join("\n");
  const process = processSection(def);

  const reference = hasReference
    ? `
REFERENCE SCREEN (image attached): the BA uploaded a screen they like. Follow its LOOK, not its content:
- Copy its structure: how many KPI tiles, whether there is a side panel, how dense the table is, where the actions sit,
  how filters are shown. Choose the layoutType that is closest to it for screens doing a similar job.
- Do NOT copy its words, names, numbers or data, and do not mention the product it comes from. Everything you write
  must come from this product's definition below.
- If the reference does not fit a screen's job, design that screen for its job instead.
`
    : "";

  return `ROLE: You are a senior product designer. You design working screens for business users from a written product
definition. You design for the job each screen does in the process, for the people who use it.

TASK: Design every screen of the prototype for "${def.productName}" (${def.businessUnit}).
Objective: ${def.objective}
${reference}
${process ? `${process}\n` : ""}
USERS:
${personas || "- (none listed)"}

JOURNEYS:
${journeys || "- (none listed)"}

RECORDS AND THEIR FIELDS:
${entitySection(def) || "- (none listed)"}

BUSINESS RULES:
${rules || "- (none listed)"}

SCREENS TO DESIGN (design every one; keep each screenId exactly):
${screens}

HOW TO DESIGN EACH SCREEN:
1. Start from the job. Ask: who opens this screen, at which stage of the process, and what must they decide or do
   here? Put what they need for that decision first.
2. Use the BU's own words. Screen titles, KPI labels, column names, filters and actions use the nouns and verbs in
   the definition above (stage names, record names, field names, party names). Never write generic labels such as
   "Total Records", "Item", "Entity", "Field 1" or "Process".
3. layoutType, by the job:
   - "dashboard": watch the whole process (counts per stage, what is late, what needs attention)
   - "split-view": work a queue one record at a time (list on the left, the selected record on the right)
   - "table-detail": find and manage many records
   - "form-wizard": capture a new record or complete a stage step by step
   - "profile-360": everything about one record: its stages so far, who did what, child records
4. KPIs: 3-4 numbers this screen's user actually tracks, for its stage (e.g. how many are waiting at this stage and
   how long they wait). Realistic sample values and a short delta such as "+3 vs yesterday".
5. Table: the record this screen works on. 4-7 columns taken from that record's fields (a reference number first,
   status last). 6 sample rows that look real for this business: plausible names, dates and amounts, all different.
   Every row has exactly as many cells as there are columns. Status values come from the record's status values
   listed above when there are any. Where a stage has an owner, include who it is with.
6. Filters: 3-5 chips a user would really click: "All" first, then status values or stages that appear in the rows.
7. Detail panels: 2-3 panels about the selected record, e.g. its stage history, the parties involved, the rule that
   applies next. Use the first row's values so the panel matches the table.
8. Primary actions: 2-4 verbs that move the record forward at this stage ("Approve extra cost", not "Submit").
   Respect the business rules (an action a rule forbids must not appear).
9. entity: for a "form-wizard" screen, the exact name of the record it creates or completes from RECORDS above;
   otherwise "".
10. inspiredBy: a short generic name for the pattern you used, e.g. "Work queue with side detail" or "Stage pipeline
    overview". Never name a company or product.
11. benchmarkNote: one sentence for the BU on why this layout fits this screen's job in their process.

Return ONLY valid JSON in exactly this shape:
{
  "screens": [
    {
      "screenId": "the screen id above",
      "inspiredBy": "Generic pattern name",
      "layoutType": "dashboard" | "table-detail" | "form-wizard" | "split-view" | "profile-360",
      "ui": {
        "entity": "Record name or empty string",
        "kpis": [{"label": "KPI in the BU's words", "value": "42", "trend": "up" | "down" | "flat", "delta": "+3 vs yesterday"}],
        "filters": ["All", "Status or stage"],
        "table": { "title": "Table title", "columns": ["Ref", "Column", "Status"], "rows": [["R-1042", "value", "status value"]] },
        "detailPanels": [{"title": "Panel title", "items": [{"label": "Field", "value": "Value"}]}],
        "primaryActions": ["Verb in the BU's words"],
        "benchmarkNote": "Why this layout fits this screen's job"
      }
    }
  ]
}`;
}
