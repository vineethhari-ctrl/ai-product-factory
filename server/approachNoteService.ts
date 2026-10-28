import type { ApproachNote, ProductDefinition } from "../src/types";
import { buildApproachNote, decisionsFor } from "../src/services/approachNote";
import { testSuiteSignature } from "../src/services/testSuite";
import { callLLMJSON } from "./llmRouter";
import { ApproachNoteSchema } from "./aiSchemas";
import { buildApproachPrompt } from "./approachPrompt";

/**
 * The Solution Approach Note for a finished BRD. A model writes it when one is configured; the rules-based note
 * (src/services/approachNote.ts) answers otherwise. The server keeps what only it can know: the document id, the
 * owning team and date of each open question, and that every module of the BRD is in the roadmap.
 */

function finalize(def: ProductDefinition, ai: ReturnType<typeof ApproachNoteSchema.parse>): ApproachNote {
  const base = buildApproachNote(def);
  const clean = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);
  const phases = ai.phases.slice(0, 5).map((p) => ({ ...p, delivers: clean(p.delivers), exitCriteria: clean(p.exitCriteria) }));
  // A module the model left out of every phase is added to the last one, and the note says so.
  const text = (p: (typeof phases)[number]) => `${p.focus} ${p.delivers.join(" ")}`.toLowerCase();
  const missing = def.modules.filter((m) => !phases.some((p) => text(p).includes(m.name.toLowerCase()))).map((m) => m.name);
  if (phases.length && missing.length) {
    const last = phases[phases.length - 1];
    last.focus = `${last.focus} Also: ${missing.join("; ")}.`;
  }
  const recs = new Map(ai.recommendations.map((r) => [r.ref.trim().toUpperCase(), r.recommendation.trim()]));
  const decisions = decisionsFor(def).map((d, i) => ({ ...d, recommendation: recs.get(`Q${i + 1}`) || undefined }));
  return {
    ...base,
    origin: "AI",
    basedOn: testSuiteSignature(def),
    executiveSummary: ai.executiveSummary.trim() || base.executiveSummary,
    asIsProblemStatement: clean(ai.problems).length ? clean(ai.problems) : base.asIsProblemStatement,
    assumptions: clean(ai.assumptions).length ? clean(ai.assumptions) : base.assumptions,
    toBeTargetArchitecture: clean(ai.solution).length ? clean(ai.solution) : base.toBeTargetArchitecture,
    alternatives: ai.alternatives.filter((a) => a.option.trim() && a.recommendation.trim()).slice(0, 5),
    phasedExecutionStrategy: phases.length ? phases : base.phasedExecutionStrategy,
    keyRisksAndMitigations: ai.risks.length ? ai.risks.slice(0, 10) : base.keyRisksAndMitigations,
    decisions,
    addedForCoverage: missing.length ? missing : undefined,
  };
}

/** Throws AIUnavailableError when keys are set and every provider failed (the endpoint answers 503). */
export async function generateApproachNote(def: ProductDefinition): Promise<ApproachNote> {
  const parsed = await callLLMJSON("generate-approach-note", buildApproachPrompt(def), ApproachNoteSchema);
  // A model that wrote no phases and no solution gives nothing to keep; the rules-based note stands in.
  if (!parsed || (parsed.phases.length === 0 && parsed.solution.length === 0)) return buildApproachNote(def);
  return finalize(def, parsed);
}
