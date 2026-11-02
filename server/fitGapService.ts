import type { FitGap, FitGapRow, ProductDefinition } from "../src/types";
import { buildFitGap, ensureFitGapCoverage, fitGapSignature, platformName } from "../src/services/fitGap";
import { callLLMJSON } from "./llmRouter";
import { FitGapSchema } from "./aiSchemas";
import { buildFitGapPrompt } from "./fitGapPrompt";

/**
 * Fit-gap for a package implementation. A model writes it from the finished BRD when one is configured; the rules-based
 * fit-gap (src/services/fitGap.ts) answers otherwise. The server keeps what only it can guarantee: row numbers, that every
 * rule and integration is covered, that development rows carry an object type, and that every record is a migration object.
 */

const clean = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

function finalize(def: ProductDefinition, ai: ReturnType<typeof FitGapSchema.parse>): FitGap {
  const base = buildFitGap(def);
  const drafts: Array<Omit<FitGapRow, "id">> = ai.rows
    .filter((r) => r.requirement.trim())
    .slice(0, 200)
    .map((r) => ({
      area: r.area.trim() || base.areas[0] || "Cross-process",
      requirement: r.requirement.trim(),
      traces: clean(r.traces),
      fit: r.fit,
      platformFeature: r.platformFeature.trim() || "To be confirmed",
      ...(r.fit !== "standard" && r.gap?.trim() ? { gap: r.gap.trim() } : {}),
      // A development row always has a type; any other row never does.
      ...(r.fit === "develop" ? { objectType: r.objectType ?? "Enhancement" } : {}),
      complexity: r.complexity,
    }));
  const { rows, added } = ensureFitGapCoverage(def, drafts);
  // Every record of the BRD is a migration object; the model's entry for it is kept, a missing one is added from the baseline.
  const byName = new Map(ai.migration.filter((m) => m.name.trim()).map((m) => [m.name.trim().toLowerCase(), m]));
  const migration = [
    ...ai.migration.filter((m) => m.name.trim()).map((m) => ({ name: m.name.trim(), source: m.source.trim() || "To be confirmed", complexity: m.complexity, ...(m.notes?.trim() ? { notes: m.notes.trim() } : {}) })),
    ...base.migration.filter((m) => !byName.has(m.name.toLowerCase())),
  ];
  const fg: FitGap = {
    origin: "AI",
    basedOn: fitGapSignature(def),
    platform: platformName(def),
    summary: ai.summary.trim(),
    areas: clean(ai.areas).length ? clean(ai.areas) : base.areas,
    rows,
    migration,
    orgStructure: clean(ai.orgStructure).length ? clean(ai.orgStructure) : base.orgStructure,
    authorisations: ai.authorisations.filter((a) => a.role.trim() && a.access.trim()).length ? ai.authorisations.filter((a) => a.role.trim() && a.access.trim()) : base.authorisations,
    openPoints: clean(ai.openPoints).length ? clean(ai.openPoints) : base.openPoints,
    ...(added.length ? { addedForCoverage: added } : {}),
  };
  if (!fg.summary) fg.summary = base.summary;
  return fg;
}

/** Throws AIUnavailableError when keys are set and every provider failed (the endpoint answers 503). */
export async function generateFitGap(def: ProductDefinition): Promise<FitGap> {
  const parsed = await callLLMJSON("generate-fit-gap", buildFitGapPrompt(def), FitGapSchema);
  // A model that assessed nothing gives nothing to keep; the rules-based fit-gap stands in.
  if (!parsed || parsed.rows.length === 0) return buildFitGap(def);
  return finalize(def, parsed);
}
