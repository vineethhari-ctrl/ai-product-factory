import type { ProductDefinition, ProposalNarrative, ProposalState, ScopeBaseline } from "../src/types";
import { applyReconciliation, applyScope, matchScopeToText, scopeSignature } from "../src/services/scope";
import { buildEstimate } from "../src/services/estimate";
import { buildProposalNarrative } from "../src/services/proposalNarrative";
import { callLLMJSON } from "./llmRouter";
import { ProposalNarrativeSchema, ScopeReconcileSchema } from "./aiSchemas";
import { buildProposalPrompt, buildReconcilePrompt } from "./proposalPrompt";

/**
 * Part 2 server steps. A model writes the proposal's words when one is configured and the rules-based narrative stands in
 * otherwise; the numbers always come from the estimate engine (never from a model). A model also matches an uploaded final
 * BRD to the draft; name matching does it otherwise. Both throw AIUnavailableError when keys are set and every provider failed.
 */

const clean = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);

export async function generateProposalNarrative(def: ProductDefinition, scope: ScopeBaseline, state: ProposalState): Promise<ProposalNarrative> {
  const est = buildEstimate(def, scope, state);
  const base = buildProposalNarrative(def, scope, est, state);
  const approved = applyScope(def, scope);
  const ai = await callLLMJSON("generate-proposal", buildProposalPrompt(approved, scope, est, state), ProposalNarrativeSchema);
  if (!ai || !ai.executiveSummary.trim()) return base;
  const pick = (a: string[], b: string[]) => (clean(a).length ? clean(a) : b);
  return {
    origin: "AI",
    basedOn: scopeSignature(scope),
    executiveSummary: ai.executiveSummary.trim(),
    background: pick(ai.background, base.background),
    objectives: pick(ai.objectives, base.objectives),
    approach: pick(ai.approach, base.approach),
    deliverables: pick(ai.deliverables, base.deliverables),
    assumptions: pick(ai.assumptions, base.assumptions),
    // What the business removed is always stated, whatever the model wrote.
    exclusions: Array.from(new Set([...base.exclusions.filter((x) => /removed from the draft BRD/.test(x)), ...pick(ai.exclusions, base.exclusions)])),
    clientResponsibilities: pick(ai.clientResponsibilities, base.clientResponsibilities),
    risks: ai.risks.filter((r) => r.risk.trim() && r.mitigation.trim()).length ? ai.risks.filter((r) => r.risk.trim() && r.mitigation.trim()).slice(0, 10) : base.risks,
    acceptanceCriteria: pick(ai.acceptanceCriteria, base.acceptanceCriteria),
    changeControl: pick(ai.changeControl, base.changeControl),
    governance: pick(ai.governance, base.governance),
    // The fee line is the engine's: a model's number is never used.
    commercialTerms: [base.commercialTerms[0], ...pick(ai.commercialTerms, base.commercialTerms.slice(1)).filter((x) => !/\d[\d,.]*\s*(usd|eur|gbp|inr|aed|sgd)\b|\b(usd|eur|gbp|inr|aed|sgd)\s*\d|[$€£₹]\s?\d/i.test(x))],
  };
}

export async function reconcileScope(def: ProductDefinition, scope: ScopeBaseline, finalText: string, fileName?: string): Promise<ScopeBaseline> {
  const byRules = matchScopeToText(scope, finalText);
  const ai = await callLLMJSON("reconcile-scope", buildReconcilePrompt(scope, finalText), ScopeReconcileSchema);
  if (!ai) return applyReconciliation(scope, byRules, [], { fileName, matchedBy: "RULES" });
  const known = new Set(scope.items.map((i) => i.id));
  const decided = new Map(ai.decisions.filter((d) => known.has(d.id)).map((d) => [d.id, d]));
  // An item the model skipped is decided by name matching instead of silently kept.
  const decisions = byRules.map((r) => { const d = decided.get(r.id); return d ? { id: r.id, keep: d.keep, note: d.note.trim() || undefined } : r; });
  const added = ai.added.filter((a) => a.name.trim()).slice(0, 30).map((a) => ({ kind: a.kind, name: a.name.trim(), detail: a.detail.trim() || undefined }));
  return applyReconciliation(scope, decisions, added, { fileName, matchedBy: "AI" });
}
