import type { DesignResearch, ProductDefinition } from "../src/types";

/**
 * Prompt for Build Prototype: the AI designs every screen for its job in the BU's process, from the
 * BU's own words (stages, who does each step, journeys, records and rules), and optionally follows
 * the look of a reference screen the BA uploaded.
 *
 * Domain-neutral by rule: no industry, company or product is named here. Every noun the AI uses
 * comes from the definition below. Patterns are described generically ("work queue with side detail").
 * No timestamps or ids beyond the definition's own, so identical requests hit the cache.
 *
 * Without a reference screen, a research step runs first (`buildResearchPrompt`, with web search): the AI looks
 * at well-built applications for the same kind of work and its brief is passed into the design prompt.
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

function screenList(def: ProductDefinition): string {
  return def.screens.map((s, i) =>
    `${i + 1}. id="${s.id}" name="${s.name}" module="${s.module}" current layout="${s.layoutType}"\n   Job: ${s.purpose}${s.components.length ? `\n   Must show: ${list(s.components, 8)}` : ""}`
  ).join("\n");
}

/**
 * Research step, run before the design when no reference screen was given: the AI searches the web for
 * well-built applications that do the same kind of work and turns what it finds into a design brief.
 * Like the design prompt, it names no industry or product itself; everything comes from the definition.
 */
export function buildResearchPrompt(def: ProductDefinition): string {
  const personas = def.personas.map((p) => `- ${p.name} (${p.role})`).join("\n");
  const process = processSection(def);
  return `ROLE: You are a senior product designer doing competitive UI research before designing a new application.

PRODUCT: "${def.productName}" for ${def.businessUnit}.
Objective: ${def.objective}
${process ? `\n${process}\n` : ""}
USERS:
${personas || "- (none listed)"}

SCREENS TO BE DESIGNED:
${screenList(def)}

TASK:
1. Search the web for 3-4 real, well-regarded applications that do the same kind of work for the same kinds of users
   (product pages, UI galleries, design case studies, app store screenshots, help-centre pages with screenshots).
   Prefer the products people in this line of work actually use and praise for being easy to use.
2. For each, write what its UI does well that this product should borrow. Look first at how users CREATE and WORK
   business documents in it: the list with a New button, the document header, line items with calculated totals,
   approval and workflow buttons, converting one document into the next, printing or sending it. Then navigation,
   queues, boards, mobile screens for outside parties and dashboards. Describe layout and interaction patterns only.
   Never copy names, logos, wording or data.
3. Decide the visual direction for this product: the feel, colour palette (name the primary and accent colours as
   hex codes that suit these users), light or dark navigation, density.
4. For every screen above, name the pattern to use and why it fits that screen's job.
5. If you find no comparable application, say so in designDirection and base the brief on the best general-purpose
   business applications instead. Name only products you actually found; do not invent any.

Return ONLY valid JSON, no prose before or after, in exactly this shape:
{
  "comparableApps": [{"name": "Real product name", "category": "What kind of app it is", "whatToBorrow": ["Pattern worth borrowing"]}],
  "designDirection": "3-5 sentences: the feel, palette (with hex codes), navigation style and density, and why they suit these users",
  "screenPatterns": [{"screenId": "the screen id above", "pattern": "Pattern to use", "why": "Why it fits the screen's job"}],
  "sources": [{"title": "Page title", "url": "https://..."}]
}`;
}

function researchSection(research: DesignResearch | undefined): string {
  if (!research) return "";
  const apps = research.comparableApps.map((a) => `- ${a.name} (${a.category}): borrow ${list(a.whatToBorrow, 4)}`).join("\n");
  const patterns = research.screenPatterns.map((p) => `- ${p.screenId}: ${p.pattern} (${p.why})`).join("\n");
  return `
RESEARCH DONE BEFORE THIS DESIGN (follow it):
Comparable applications studied:
${apps || "- none found"}
Visual direction: ${research.designDirection}
Pattern per screen:
${patterns || "- (none)"}
Borrow layout and interaction patterns only. Never copy another product's name, logo, wording or data.
`;
}

/**
 * The core of every prototype: the business documents users create and move through their workflow. The words come
 * from the definition; this text names no kind of document.
 */
export const DOCUMENT_RULES = `BUSINESS DOCUMENTS ARE THE CORE OF THE PROTOTYPE:
A business application is used to CREATE and WORK documents: a user starts one, fills in its header and its lines,
saves it as a draft, sends it for a decision, someone approves or rejects it, and it turns into the next document.
Dashboards and queues only support that work. A prototype without document screens is not acceptable.
A. From the process, journeys, records and rules above, list every business document the users create or work
   (whatever the BU calls it). Each document gets a screen with layoutType "transaction" and a "document" object.
B. Use the existing screen whose job is to create or work that document. If a document has no such screen, ADD one:
   screenId "scr-doc-" plus a short name, and give "name", "module" and "purpose" for it. Add at most 4 screens.
   When the process has documents, at least half of all screens must be "transaction" screens.
C. document.sections: 2-4 sections in the order a user fills them in (who it is for, what is asked or supplied,
   dates and terms, internal notes), each with 3-10 fields. kind is one of text, long-text, number, money, percent,
   date, select (give 3-8 options), lookup (choose an existing party, record or item: give 3-6 realistic options),
   email, phone, checkbox. Mark required fields. The document number and system dates are readOnly. Give each field a
   realistic "sample" so an existing document opens filled in.
D. document.lines: when the document lists several items, units, services or tasks, a line grid with 3-7 columns
   (an item column first, often a lookup-like select with options) and 2-4 realistic sample rows. Name the columns used
   to calculate in quantityColumn, priceColumn, discountColumn (optional) and amountColumn. When money is involved,
   add totals: the currency code that suits the BU, and discountPercent or taxPercent with taxLabel only when they
   apply. Leave out lines when the document has a single subject.
E. document.states: 3-7 statuses in order; the first is where a new document starts (a draft). document.actions:
   the workflow buttons in the BU's verbs, each with "from" (statuses where it is offered), "to", the "role" that may
   do it (a user above) for approvals, needsReason true for rejecting or putting on hold, and "creates" with the
   next document's name when the action turns this document into another one.
F. document.related: "from" = the document this one usually comes from, "next" = documents created from it, so the
   user sees the chain. document.name = the document's name in the BU's words; numberPrefix = 2-4 letters.
G. For a "transaction" screen, table = the list of existing documents of that kind: the document number first
   (starting with numberPrefix), then the party it is for, a key date, the total when money is involved, status last;
   6 rows whose values match the document's samples and statuses. primaryActions starts with "New " + the document
   name. kpis: 0-3 small figures about this list (how many are open, value waiting for approval).
`;

export function buildPrototypePrompt(def: ProductDefinition, hasReference: boolean, research?: DesignResearch): string {
  const screens = screenList(def);
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

TASK: Design every screen of the prototype for "${def.productName}" (${def.businessUnit}). The BU must be able to
look at it and say "yes, that is our application", and must be able to create and work its business documents in it. Make it as attractive and polished as the best modern business
software: clear hierarchy, realistic content, nothing generic.
Objective: ${def.objective}
${reference}${hasReference ? "" : researchSection(research)}
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

${DOCUMENT_RULES}
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
   - "transaction": create and work one kind of business document (see BUSINESS DOCUMENTS above)
4. KPIs: 3-4 numbers this screen's user actually tracks, for its stage (e.g. how many are waiting at this stage and
   how long they wait). Realistic sample values and a short delta such as "+3 vs yesterday".
5. Table: the record this screen works on. 4-7 columns taken from that record's fields (a reference number first,
   status last). 6 sample rows that look real for this business: plausible names, dates and amounts, all different.
   SAMPLE DATA IS INVENTED: organisations, people, brands, codes and identifiers (serial numbers, vehicle or account
   numbers, licence plates, tenant or partner codes) are made up. Never use a real company's name, a real brand, a
   recognisable abbreviation of one, or the real issuing prefix of a manufacturer or registry. A reader must not be
   able to say which real organisation a row is about. Write status and type values as words a person reads
   ("Pending Review"), not as UPPER_CASE_CODES.
   Every row has exactly as many cells as there are columns. Status values come from the record's status values
   listed above when there are any. Where a stage has an owner, include who it is with.
6. Filters: 3-5 chips a user would really click: "All" first, then status values or stages that appear in the rows.
7. Detail panels: 2-3 panels about the selected record, e.g. its stage history, the parties involved, the rule that
   applies next. Use the first row's values so the panel matches the table.
8. Primary actions: 2-4 verbs that move the record forward at this stage ("Approve extra cost", not "Submit").
   Respect the business rules (an action a rule forbids must not appear).
9. entity: for a "form-wizard" or "transaction" screen, the exact name of the record it creates or completes from RECORDS above;
   otherwise "".
10. inspiredBy: a short generic name for the pattern you used, e.g. "Work queue with side detail" or "Stage pipeline
    overview". Never name a company or product.
11. benchmarkNote: one sentence for the BU on why this layout fits this screen's job in their process.
12. device: "phone" for a screen used mainly by an outside party (someone who is not staff, e.g. the person the
    record is for) who would open it on their own mobile phone, such as approving, confirming or tracking one record.
    Design such a screen for one record at a time: short labels, 2 KPIs at most, big actions. Otherwise "desktop".
13. chart (optional): on screens that watch performance or the whole process, one chart that answers the screen's
    main question: "bar" for counts per stage or per party, "line" for a trend over 6-8 days or weeks, "donut" for a
    split of 3-5 parts. 3-8 labels in the BU's words, one realistic number per label, consistent with the KPIs.
14. board (optional): on screens where work moves between stages or statuses, a board with one column per stage or
    status (3-6 columns, in order) and 1-4 cards per column. Card title = the record's reference or name, subtitle =
    who or what it concerns, tag = priority, due time or amount. Use the same records as the table.
15. timeline (optional): on screens about one record (split-view, profile-360), 4-6 events of the first table row,
    newest first: when ("Today 09:40", "Yesterday"), who (a person or party), what happened (a stage done, an
    approval, a note).
16. theme (once, for the whole application): colours that suit this product and its users (follow the research
    direction when there is one). primaryColor and accentColor as hex codes; avoid a default purple unless it truly
    fits. sidebarStyle "dark", "light" or "brand"; density "comfortable" or "compact" (compact for data-heavy work).

Return ONLY valid JSON in exactly this shape:
{
  "theme": {"primaryColor": "#hex", "accentColor": "#hex", "sidebarStyle": "dark" | "light" | "brand", "density": "comfortable" | "compact"},
  "screens": [
    {
      "screenId": "the screen id above, or scr-doc-... for an added screen",
      "name": "Only for an added screen", "module": "Only for an added screen", "purpose": "Only for an added screen",
      "inspiredBy": "Generic pattern name",
      "layoutType": "dashboard" | "table-detail" | "form-wizard" | "split-view" | "profile-360" | "transaction",
      "ui": {
        "entity": "Record name or empty string",
        "kpis": [{"label": "KPI in the BU's words", "value": "42", "trend": "up" | "down" | "flat", "delta": "+3 vs yesterday"}],
        "filters": ["All", "Status or stage"],
        "table": { "title": "Table title", "columns": ["Ref", "Column", "Status"], "rows": [["R-1042", "value", "status value"]] },
        "detailPanels": [{"title": "Panel title", "items": [{"label": "Field", "value": "Value"}]}],
        "primaryActions": ["Verb in the BU's words"],
        "benchmarkNote": "Why this layout fits this screen's job",
        "device": "desktop" | "phone",
        "chart": {"title": "Chart title", "kind": "bar" | "line" | "donut", "labels": ["Label"], "values": [12]},
        "board": {"columns": [{"title": "Stage or status", "cards": [{"title": "R-1042", "subtitle": "Who or what", "tag": "High"}]}]},
        "timeline": [{"when": "Today 09:40", "who": "Person or party", "what": "What happened"}],
        "document": {
          "name": "Document name", "numberPrefix": "AB",
          "sections": [{"title": "Section", "fields": [{"label": "Field", "kind": "text" | "long-text" | "number" | "money" | "percent" | "date" | "select" | "lookup" | "email" | "phone" | "checkbox", "required": true, "options": ["Option"], "sample": "Sample value", "readOnly": false}]}],
          "lines": {"title": "Lines", "columns": [{"label": "Item", "kind": "text" | "number" | "money" | "percent" | "select", "options": ["Option"]}], "rows": [["value"]], "quantityColumn": "Column label", "priceColumn": "Column label", "discountColumn": "Column label", "amountColumn": "Column label"},
          "totals": {"currency": "ABC", "discountPercent": 0, "taxLabel": "Tax name", "taxPercent": 0},
          "states": ["Draft", "Next status"],
          "actions": [{"label": "Verb in the BU's words", "from": ["Draft"], "to": "Next status", "role": "User", "needsReason": false, "creates": "Next document"}],
          "related": {"from": "Previous document", "next": ["Next document"]}
        }
      }
    }
  ]
}`;
}
