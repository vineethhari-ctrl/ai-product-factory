import type { Estimate, ProductDefinition, ProposalNarrative, ProposalState, ScopeBaseline } from '../types';
import { applyScope, scopeCounts, scopeSignature, SCOPE_KIND_LABEL, SCOPE_KIND_ORDER } from './scope';
import { formatMoney, toMonths } from './estimate';

/**
 * The words of the proposal. This rules-based version is the baseline (and the answer when no model is configured):
 * every sentence is built from the approved scope and the computed numbers, nothing names a domain. A model rewrites the
 * narrative in `server/proposalService.ts`; the numbers always come from `buildEstimate`, never from a model.
 * The standard terms (change control, acceptance, payment) are generic starting wording for the vendor's legal review.
 */

const list = (xs: string[], max = 6) => (xs.length > max ? `${xs.slice(0, max).join(', ')} and ${xs.length - max} more` : xs.join(', '));

export function removedItems(scope: ScopeBaseline) {
  return SCOPE_KIND_ORDER.map((k) => ({ kind: k, label: SCOPE_KIND_LABEL[k], names: scope.items.filter((i) => i.kind === k && i.change === 'REMOVED' && !(i.kind === 'screen' && scope.items.some((m) => m.kind === 'module' && m.name === i.parent && !m.included))).map((i) => i.name) })).filter((g) => g.names.length);
}
export function addedItems(scope: ScopeBaseline) {
  return scope.items.filter((i) => i.change === 'NEW' && i.included);
}

export function buildProposalNarrative(def: ProductDefinition, scope: ScopeBaseline, est: Estimate, state: ProposalState): ProposalNarrative {
  const a = applyScope(def, scope);
  const c = scopeCounts(scope);
  const vendor = state.vendorName?.trim() || 'The vendor';
  const client = state.clientName?.trim() || def.businessUnit || 'the client';
  const money = (n: number) => formatMoney(n, est.currency);
  const taxes = est.currency === 'INR' ? 'GST and other applicable taxes' : 'taxes';
  const cutModules = scope.items.filter((i) => i.kind === 'module' && !i.included).map((i) => i.name);
  const phaseLine = (p: (typeof est.phases)[number]) => `${p.phase}: about ${p.weeks} week${p.weeks === 1 ? '' : 's'}, ${Math.round(p.days)} days of effort.`;
  const removed = removedItems(scope);

  const exclusions = [
    ...removed.map((g) => `${g.label} the business removed from the draft BRD: ${list(g.names, 8)}.`),
    'Data migration from existing systems, unless added by a change request.',
    'Hardware, network, hosting and third-party licence costs.',
    'Production support after the hypercare period.',
    'Any feature, screen, record, rule or integration not listed in the approved scope.',
  ];

  const pendingAssumptions = a.assumptions.filter((x) => x.status === 'pending-validation').map((x) => x.statement);
  const blocking = a.openQuestions.filter((q) => q.status === 'open' && q.urgency === 'blocking').map((q) => q.question);

  return {
    origin: 'OFFLINE',
    basedOn: scopeSignature(scope),
    executiveSummary: `${vendor} proposes to deliver ${a.productName} for ${client}: ${c.kept + c.added} approved item${c.kept + c.added === 1 ? '' : 's'} across ${a.modules.length} module${a.modules.length === 1 ? '' : 's'} and ${a.screens.length} screen${a.screens.length === 1 ? '' : 's'}, with ${a.businessRules.length} business rules and ${a.integrations.length} integration${a.integrations.length === 1 ? '' : 's'}. The work is estimated at ${Math.round(est.totalDays)} person-days, about ${toMonths(est.totalDays, est.daysPerMonth).toFixed(1)} person-months (${Math.round(est.functionalDays)} functional, ${Math.round(est.technicalDays)} technical) over about ${est.durationWeeks} weeks, at an estimated ${money(est.total)}.${cutModules.length ? ` The scope is the version the business approved after review; ${cutModules.join(', ')} ${cutModules.length === 1 ? 'is' : 'are'} not included.` : ' The scope is the version the business approved after review.'}`,
    background: (a.problemStatement?.length ? a.problemStatement : [a.objective]).filter(Boolean),
    objectives: [a.objective, ...(a.successMetrics ?? []).map((m) => `Measure: ${m}`)].filter(Boolean),
    approach: est.phases.map(phaseLine),
    deliverables: Array.from(new Set(est.activities.map((x) => x.deliverable))),
    assumptions: [
      'The scope is the BU-approved version; anything outside it is handled through change control.',
      'The estimates include an allowance for clarification, rework and risk within the approved scope. They do not cover new requirements.',
      'The business provides decision-makers and subject experts within the response times in the governance section.',
      'Day rates and effort are estimates for the approved scope; they are re-confirmed after the design phase.',
      ...pendingAssumptions.slice(0, 8),
    ],
    exclusions,
    clientResponsibilities: [
      'Name a business owner with authority to approve scope, designs and acceptance.',
      'Provide timely access to subject experts, test data and the systems to be integrated.',
      'Review and approve deliverables within five working days of submission.',
      'Provide test users for acceptance testing and attend training sessions.',
      ...blocking.slice(0, 5).map((q) => `Answer before design sign-off: ${q}`),
    ],
    risks: [
      ...(a.risks ?? []).slice(0, 6),
      ...(blocking.length ? [{ risk: `${blocking.length} blocking open question${blocking.length === 1 ? '' : 's'} on the approved scope`, impact: 'Estimates and design may change once answered.', mitigation: 'Answer them before design sign-off; re-estimate if the answer changes the scope.' }] : []),
      ...(a.integrations.length ? [{ risk: 'Partner systems are not ready or their interfaces differ from the assumption', impact: 'Integration effort and the schedule grow.', mitigation: 'Confirm interface owners and test access in the first phase; build against agreed contracts.' }] : []),
      { risk: 'Scope grows after approval', impact: 'Cost and schedule increase.', mitigation: 'All changes go through the change control process below, estimated and approved before work starts.' },
    ],
    acceptanceCriteria: [
      ...a.userJourneys.slice(0, 8).map((j) => `Journey "${j.name}" can be completed end to end in the test environment.`),
      'Every approved business rule is demonstrated to hold and to be refused when broken.',
      'No open critical or high-severity defect at user acceptance sign-off.',
      'The business owner signs the acceptance certificate.',
    ],
    changeControl: [
      'A change is raised in writing and described with the reason and the items it touches.',
      'The vendor estimates its effect on effort, cost and schedule at the rate card in this document.',
      'No change work starts until the business owner approves the estimate in writing. Requests made informally, in meetings or by email, are not changes until approved.',
      'Approved changes update the scope baseline and this document.',
    ],
    governance: [
      'Weekly status report and a risk, assumption, issue and dependency log.',
      'A steering meeting every two to four weeks with the sponsor and the business owner.',
      'Escalation: project manager, then business owner, then sponsor.',
    ],
    commercialTerms: [
      `Estimated fee: ${money(est.total)}, in ${est.currency}, excluding ${taxes}.`,
      'Invoiced by milestone as shown in the payment schedule; work beyond the approved scope is charged at the rate card.',
      'The estimate is valid for 30 days from the date of this document.',
      'Standard terms for liability, intellectual property, confidentiality and termination are to be agreed with the vendor\'s and the client\'s legal teams.',
    ],
  };
}
