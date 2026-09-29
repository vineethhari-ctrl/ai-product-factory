import type {
  BenchmarkInfo,
  BusinessUnderstanding,
  EvidenceItem,
  OpenQuestionItem,
  ScreenUISpec,
  UploadedMaterial,
} from "../src/types";

/**
 * Industry-benchmark inference.
 *
 * When the BU supplies too little to specify a product, the model is told to
 * predict the requirements from how comparable organisations (e.g. OEMs) build
 * such products. Everything predicted is tagged INFERRED with an
 * "Industry benchmark" evidence entry and is put in front of the BU for
 * validation, so nothing inferred can pass as confirmed.
 */

export const BENCHMARK_TAG = "Industry benchmark";

/** Below any of these the input is considered too thin to specify a product. */
const MIN_MATERIALS = 2;
const MIN_TOTAL_CHARS = 2500;
/** Understanding is thin when fewer than this share of its items are CONFIRMED. */
const MIN_CONFIRMED_RATIO = 0.3;

export function assessMaterialThinness(
  materials: UploadedMaterial[],
  description: string
): { thin: boolean; reason: string } {
  const chars =
    materials.reduce((sum, m) => sum + (m.contentSnippet?.length ?? 0), 0) + (description?.length ?? 0);
  const reasons: string[] = [];
  if (materials.length < MIN_MATERIALS) reasons.push(`only ${materials.length} material(s) supplied`);
  if (chars < MIN_TOTAL_CHARS) reasons.push(`only ${chars} characters of content (under ${MIN_TOTAL_CHARS})`);
  return { thin: reasons.length > 0, reason: reasons.join("; ") };
}

export function assessUnderstandingThinness(u: BusinessUnderstanding): { thin: boolean; reason: string } {
  if (u.benchmark?.applied) return { thin: true, reason: u.benchmark.reason };
  const items: EvidenceItem[] = [
    ...u.personas, ...u.modules, ...u.screens, ...u.userJourneys,
    ...u.businessRules, ...u.dataEntities, ...u.integrations,
  ];
  if (items.length === 0) return { thin: true, reason: "the business understanding has no items" };
  const confirmed = items.filter((i) => i.status === "CONFIRMED").length;
  const ratio = confirmed / items.length;
  return ratio < MIN_CONFIRMED_RATIO
    ? { thin: true, reason: `only ${confirmed} of ${items.length} items are confirmed by the BU` }
    : { thin: false, reason: "" };
}

const COMMON_DIRECTIVE = (reason: string) => `BENCHMARK INFERENCE MODE (the BU input is thin: ${reason}).
The BU has not specified enough to build from. Do not leave sections empty, generic or placeholder-like. Predict what this BU will need from how leading organisations and OEMs in the same industry build comparable products, the way a senior product architect who has studied several competitors would.
- Identify the industry and product category from the product name, business unit, notes and materials.
- Be specific and domain-concrete: real personas, modules, screens, end-to-end journeys, business and compliance rules, data entities and integrations that products of this kind typically have.
- Every predicted item MUST have status/confidence INFERRED, and its first evidence entry MUST start with "${BENCHMARK_TAG}: " followed by the specific pattern it mirrors (for example "${BENCHMARK_TAG}: dealer service-booking flow common in OEM owner apps"). Items genuinely supported by the materials stay CONFIRMED and cite their source.
- Describe patterns generically. Never assert facts about a named company's internal systems, and never present a benchmark as something the BU said.`;

export function analysisBenchmarkDirective(reason: string): string {
  return `${COMMON_DIRECTIVE(reason)}
- For each major predicted area, add a missingInformation entry asking the BU to validate or correct that assumption.\n`;
}

export function definitionBenchmarkDirective(reason: string): string {
  return `${COMMON_DIRECTIVE(reason)}
- Design a complete product: cover the full journey of every persona with 6 to 10 screens, not just the obvious ones.
- Add an openQuestions entry for each major benchmark-derived decision so the BU can confirm it.\n`;
}

/** Rules for the per-screen UI blueprint. Applied on every run because the prototype renders from it. */
export const UI_SPEC_RULES = `UI BLUEPRINT RULES (the prototype renders each screen directly from its "ui" object, so quality here is the quality of the UI):
- Choose layoutType for the screen's job: dashboard (monitoring and KPIs), table-detail (managing records), form-wizard (multi-step tasks; make detailPanels the steps and their items the form fields), split-view (triage a queue on the left, act on the right), profile-360 (everything about one customer, vehicle or asset).
- kpis: 3 to 4 domain-specific metrics with realistic values, a trend of up, down or flat, and a short delta such as "+4.2% vs last week".
- filters: 3 to 5 filter or segment chips a user of this screen would really use.
- table: a title, 4 to 6 columns that fit the domain, and 5 to 7 realistic sample rows. Every row must have exactly as many cells as there are columns. Include a status-like column with values such as Active, Pending, Overdue, Completed or Blocked.
- detailPanels: 2 to 3 panels of labelled facts about the selected record.
- primaryActions: 2 to 4 verbs a user performs here, such as "Reassign", "Approve" or "Schedule service".
- benchmarkNote: one sentence naming the industry pattern this layout mirrors.
- entity: for a form-wizard screen, the exact name of the data entity the form creates or edits (as listed in dataEntities); omit it for other layouts.
- All values are illustrative sample data; use plausible domain terminology and never real personal data.\n`;

/** Make sure inferred items carry an "Industry benchmark" evidence entry. */
export function tagInferredEvidence<T extends { confidence?: string; evidence?: string[] }>(
  items: T[],
  industry: string
): T[] {
  return items.map((item) => {
    if (item.confidence !== "INFERRED") return item;
    const evidence = item.evidence ?? [];
    if (evidence.some((e) => e.startsWith(BENCHMARK_TAG))) return item;
    return { ...item, evidence: [`${BENCHMARK_TAG}: typical ${industry} product pattern`, ...evidence] };
  });
}

/** Same as tagInferredEvidence for understanding items, which use status + evidenceReferences. */
export function tagInferredReferences<T extends { status: string; evidenceReferences: string[] }>(
  items: T[],
  industry: string
): T[] {
  return items.map((item) => {
    if (item.status !== "INFERRED") return item;
    if (item.evidenceReferences.some((e) => e.startsWith(BENCHMARK_TAG))) return item;
    return {
      ...item,
      evidenceReferences: [`${BENCHMARK_TAG}: typical ${industry} product pattern`, ...item.evidenceReferences],
    };
  });
}

/** Rows shorter or longer than the column count would break the table, so force them to fit. */
export function normalizeUISpec(ui: ScreenUISpec): ScreenUISpec {
  const width = ui.table.columns.length;
  return {
    ...ui,
    table: {
      ...ui.table,
      rows: ui.table.rows.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? "")),
    },
  };
}

export function benchmarkInfo(industry: string, reason: string): BenchmarkInfo {
  return { applied: true, industry: industry || "the BU's industry", reason };
}

/** Always added in benchmark mode so the BU sees that scope was predicted, whatever the model wrote. */
export function benchmarkOpenQuestion(industry: string, inferredCount: number): OpenQuestionItem {
  return {
    id: "oq-benchmark-validation",
    question: `${inferredCount} requirement(s), screen(s) and rule(s) were predicted from ${industry} industry patterns because the BU input was limited. Please review every item marked "${BENCHMARK_TAG}" and confirm, correct or remove it before sign-off.`,
    urgency: "blocking",
    status: "open",
  };
}
