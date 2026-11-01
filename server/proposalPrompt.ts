import type { Estimate, ProductDefinition, ProposalState, ScopeBaseline } from "../src/types";
import { definitionDigest } from "./definitionDigest";
import { addedItems, removedItems } from "../src/services/proposalNarrative";
import { formatMoney } from "../src/services/estimate";

/**
 * Prompt for the proposal / SOW narrative. The model gets the APPROVED BRD (what the business kept, plus what it added),
 * what it removed, and the numbers the estimate engine computed. It writes words only: it must not change, add or
 * invent a number, a rate, a date or a scope item. Domain-neutral: every noun comes from the digest below.
 */
export function buildProposalPrompt(approved: ProductDefinition, scope: ScopeBaseline, est: Estimate, state: ProposalState): string {
  const money = (n: number) => formatMoney(n, est.currency);
  const removed = removedItems(scope).map((g) => `${g.label}: ${g.names.join(", ")}`).join("\n") || "- nothing removed";
  const added = addedItems(scope).map((i) => `${i.kind}: ${i.name}${i.detail ? ` (${i.detail})` : ""}`).join("\n") || "- nothing added";
  return `ROLE: You are a senior pre-sales solution architect writing the words of a ${state.docKind} that a delivery company sends to a business client. The client's business unit has already reviewed and APPROVED the scope below; write for that scope only. The reader is a business sponsor and a procurement or legal reviewer: concrete, specific to THIS product, no filler, no marketing language.

${state.vendorName?.trim() ? `VENDOR: ${state.vendorName.trim()}\n` : ""}${state.clientName?.trim() ? `CLIENT: ${state.clientName.trim()}\n` : ""}
APPROVED SCOPE (the BRD after the business's review; this is exactly what is being priced):
${definitionDigest(approved)}

NOTE: any PROCESS or JOURNEYS above describe how the business works, for context. Only the modules, screens, records, rules and integrations listed above are delivered; anything below is NOT.

REMOVED BY THE BUSINESS (out of scope; never describe them as delivered):
${removed}

ADDED BY THE BUSINESS (in scope, but newly added and lightly specified; note the assumption where it matters):
${added}

NUMBERS ALREADY COMPUTED (use exactly these, never change or add one):
- Effort: ${Math.round(est.totalDays)} person-days (${Math.round(est.functionalDays)} functional, ${Math.round(est.technicalDays)} technical)
- The effort already includes a ${state.rateCard.changeBufferPct ?? 15}% clarification and change buffer, shown as its own activity. It covers rework inside the approved scope only, never new requirements.
- Indicative duration: ${est.durationWeeks} weeks
- Estimated fee ${money(est.subtotal)} + ${state.rateCard.contingencyPct}% contingency ${money(est.contingency)} = ${money(est.total)} (${est.currency}, excluding taxes)
- Phases: ${est.phases.map((p) => `${p.phase} (${p.weeks} weeks, ${Math.round(p.days)} days)`).join("; ")}
- Milestones: ${est.milestones.map((m) => `${m.name} (week ${m.weekNumber}, ${m.percent}%)`).join("; ")}
- Activities: ${est.activities.map((a) => a.name).join("; ")}

WHAT TO PRODUCE:
1. executiveSummary: 4 to 6 sentences: what is being delivered and for whom, the change it makes, the approved scope in one line (counts and the main modules), duration and the estimated total (use the numbers above), and, if the business removed something, one sentence saying so.
2. background: 3 to 5 items: the problems today, in the BU's words where stated, each naming who is hurt and the cost.
3. objectives: 3 to 6 measurable outcomes tied to the success measures and rules above.
4. approach: one item per phase (use the phase names above): what happens, what is delivered, how the business takes part. Mention the approved modules by name.
5. deliverables: the concrete things handed over (documents, working modules by name, integrations by system name, test reports, training).
6. assumptions: 6 to 10 testable assumptions the price rests on, including the unconfirmed rules and the lightly specified added items.
7. exclusions: what is NOT included: the removed items by name, plus items typical for this kind of work that this scope does not cover (migration, licences, hosting, support after hypercare), only those that apply.
8. clientResponsibilities: 5 to 8 specific things the client must provide or decide, tied to the open questions above.
9. risks: 5 to 8 risks specific to this product and scope, each with impact and an actionable mitigation.
10. acceptanceCriteria: 6 to 10 checks the client uses to accept the work, tied to the journeys and rules above.
11. changeControl: 4 to 6 steps.
12. governance: 3 to 5 items (reporting, steering, escalation).
13. commercialTerms: 4 to 6 items about how the fee is invoiced (by the milestones above), what is excluded (taxes), validity and what happens to work outside the approved scope. Do not invent legal clauses; say "to be agreed with legal" for liability, IP and termination.

QUALITY RULES:
- Use only names that appear above (modules, screens, records, rules, integrations, roles). Never invent a rule code, a figure, a date or a rate.
- Do not describe anything the business removed as part of the delivery.
- Do not repeat the BRD word for word: add the reasoning a sponsor needs.
- No timestamps, no random ids.

Return ONLY valid JSON, no prose before or after, in exactly this shape:
{
  "executiveSummary": "",
  "background": [""],
  "objectives": [""],
  "approach": [""],
  "deliverables": [""],
  "assumptions": [""],
  "exclusions": [""],
  "clientResponsibilities": [""],
  "risks": [{"risk": "", "impact": "", "mitigation": ""}],
  "acceptanceCriteria": [""],
  "changeControl": [""],
  "governance": [""],
  "commercialTerms": [""]
}`;
}

/** Prompt that matches the BU's final BRD to the draft BRD's items. */
export function buildReconcilePrompt(scope: ScopeBaseline, finalText: string): string {
  const items = scope.items.filter((i) => i.change !== "NEW").map((i) => `${i.id} | ${i.kind} | ${i.name}${i.detail ? ` | ${i.detail.slice(0, 140)}` : ""}`).join("\n");
  return `ROLE: You are a business analyst comparing the DRAFT requirements list below with the business's FINAL approved requirements document. The business may have removed items, added new ones, or reworded them.

DRAFT ITEMS (id | kind | name | detail):
${items}

FINAL APPROVED DOCUMENT:
"""
${finalText}
"""

WHAT TO PRODUCE:
1. decisions: one entry for EVERY draft item id above: keep = true when the final document still asks for it (even if reworded or merged), keep = false when it is gone, descoped, deferred or marked out of scope. "note" is one short phrase saying where or why. When the document is silent about an item, keep = false and say "Not mentioned in the final document".
2. added: items the final document asks for that match NO draft item (kind: module, screen, record, rule, integration or journey; a short name; one sentence of detail). Only real additions, not rewordings.

QUALITY RULES: use the ids exactly as given; never invent an id; do not list a reworded draft item as added.

Return ONLY valid JSON, no prose before or after:
{"decisions": [{"id": "", "keep": true, "note": ""}], "added": [{"kind": "screen", "name": "", "detail": ""}]}`;
}
