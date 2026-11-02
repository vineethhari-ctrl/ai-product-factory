import type { Estimate, ProductDefinition, ProposalNarrative, ProposalState, ScopeBaseline } from '../types';
import { applyScope, scopeSignature } from './scope';
import { formatMoney, toMonths } from './estimate';
import { addedItems, buildProposalNarrative, removedItems } from './proposalNarrative';
import { renderHtml, renderMarkdown, type Block, type Section } from './docRender';

/**
 * The Proposal / SOW as one section model. The screen, the Markdown copy and the Word download all render it, so they
 * never disagree. Numbers come from the estimate; words from the narrative (AI-written, or the rules-based baseline).
 */

export type { Block, Section } from './docRender';

/** The narrative to show: the stored one when it was written for this approved scope, else the rules-based one. */
export function currentNarrative(def: ProductDefinition, scope: ScopeBaseline, est: Estimate, state: ProposalState): { narrative: ProposalNarrative; stale: boolean } {
  const n = state.narrative;
  if (n && n.basedOn === scopeSignature(scope)) return { narrative: n, stale: false };
  return { narrative: buildProposalNarrative(def, scope, est, state), stale: !!n };
}

const d1 = (n: number) => (Math.round(n * 10) / 10).toString();

export function proposalSections(def: ProductDefinition, scope: ScopeBaseline, est: Estimate, state: ProposalState, narrative: ProposalNarrative): Section[] {
  const a = applyScope(def, scope);
  const money = (n: number) => formatMoney(n, est.currency);
  const added = new Set(addedItems(scope).map((i) => i.name));
  const mark = (n: string) => (added.has(n) ? `${n} (added by the business)` : n);
  const removed = removedItems(scope);
  const s: Section[] = [];

  s.push({ id: 'summary', title: 'Executive summary', blocks: [
    ...(scope.confirmed ? [] : [{ kind: 'p', text: 'DRAFT: the scope below has not yet been confirmed as the business-approved scope.' } as Block]),
    { kind: 'p', text: narrative.executiveSummary },
  ] });
  s.push({ id: 'background', title: 'Background and objectives', blocks: [
    { kind: 'p', text: 'Why this work is needed:' }, { kind: 'ul', items: narrative.background },
    { kind: 'p', text: 'What it must achieve:' }, { kind: 'ul', items: narrative.objectives },
  ] });

  const moduleRows = a.modules.map((m) => [mark(m.name), m.description || '-', String(a.screens.filter((x) => m.screens?.includes(x.id) || x.module === m.name || x.module === m.id).length)]);
  const scopeBlocks: Block[] = [
    { kind: 'p', text: `This section lists exactly what the business approved${scope.approvedBy ? ` (approved by ${scope.approvedBy}${scope.approvedOn ? ` on ${scope.approvedOn}` : ''})` : ''}. The estimate, plan and price in this document cover these items and nothing else.` },
    { kind: 'table', head: ['Module', 'Purpose', 'Screens'], rows: moduleRows },
    { kind: 'table', head: ['Screen', 'Module', 'Layout', 'Purpose'], rows: a.screens.map((x) => [mark(x.name), x.module || '-', x.layoutType, x.purpose || '-']) },
    { kind: 'table', head: ['Record', 'Purpose', 'Fields'], rows: a.dataEntities.map((e) => [mark(e.name), e.description || '-', String(e.fields.length)]) },
    { kind: 'table', head: ['Business rule', 'Statement'], rows: a.businessRules.map((r) => [mark(r.code), r.rule]) },
    { kind: 'table', head: ['Integration', 'Protocol', 'Purpose'], rows: a.integrations.map((i) => [mark(i.system), i.protocol || '-', i.purpose || '-']) },
    { kind: 'table', head: ['Journey', 'Role', 'Outcome'], rows: a.userJourneys.map((j) => [mark(j.name), j.persona || '-', j.outcome || '-']) },
  ];
  s.push({ id: 'scope', title: 'Scope of work (as approved by the business)', blocks: scopeBlocks.filter((b) => !(b.kind === 'table' && b.rows.length === 0)) });

  s.push({ id: 'out', title: 'Out of scope', blocks: [
    ...(removed.length ? [{ kind: 'p', text: 'Removed from the draft BRD during the business review (not priced here):' } as Block, { kind: 'ul', items: removed.map((g) => `${g.label}: ${g.names.join(', ')}`) } as Block] : []),
    { kind: 'p', text: 'Also excluded:' }, { kind: 'ul', items: narrative.exclusions.filter((x) => !removed.some((g) => x.startsWith(`${g.label} the business removed`))) },
  ] });

  s.push({ id: 'approach', title: 'Approach, phases and deliverables', blocks: [
    { kind: 'ul', items: narrative.approach },
    { kind: 'table', head: ['Phase', 'Indicative weeks', 'Effort (days)', `Cost (${est.currency})`], rows: est.phases.map((p) => [p.phase, String(p.weeks), d1(p.days), money(p.cost)]), foot: ['Total', String(est.durationWeeks), d1(est.totalDays), money(est.subtotal)] },
    { kind: 'p', text: 'Deliverables:' }, { kind: 'ul', items: narrative.deliverables },
  ] });

  s.push({ id: 'effort', title: 'Effort estimate by activity (high level)', blocks: [
    { kind: 'p', text: 'Person-days per activity, split into functional (business analysis, design, acceptance, process) and technical (architecture, build, integration, test automation, deployment). These are high-level estimates for the approved scope; the delivery team re-confirms them after design.' },
    { kind: 'table', head: ['Activity', 'Phase', 'Functional days', 'Technical days', 'Total days', 'How estimated'],
      rows: est.activities.map((x) => [x.adjusted ? `${x.name} (adjusted)` : x.name, x.phase, d1(x.functionalDays), d1(x.technicalDays), d1(x.functionalDays + x.technicalDays), x.basis]),
      foot: ['Total', '', d1(est.functionalDays), d1(est.technicalDays), d1(est.totalDays), ''] },
  ] });

  const m = (days: number) => toMonths(days, est.daysPerMonth).toFixed(2);
  s.push({ id: 'months', title: 'Effort in person-months', blocks: [
    { kind: 'p', text: `One person-month is ${est.daysPerMonth} working days. The figures below are the same effort as the previous section, in months.` },
    { kind: 'table', head: ['Activity', 'Functional (person-months)', 'Technical (person-months)', 'Total (person-months)'],
      rows: est.activities.map((x) => [x.name, m(x.functionalDays), m(x.technicalDays), m(x.functionalDays + x.technicalDays)]),
      foot: ['Total', m(est.functionalDays), m(est.technicalDays), m(est.totalDays)] },
    { kind: 'table', head: ['Role', 'Person-months', 'Indicative people'], rows: est.team.map((r) => [r.role, m(r.days), d1(r.fte)]), foot: ['Total', m(est.totalDays), ''] },
    { kind: 'table', head: ['Phase', 'Indicative weeks', 'Person-months'], rows: est.phases.map((p) => [p.phase, String(p.weeks), m(p.days)]), foot: ['Total', String(est.durationWeeks), m(est.totalDays)] },
  ] });

  s.push({ id: 'cost', title: 'Team and cost', blocks: [
    { kind: 'table', head: ['Role', 'Days', `Day rate (${est.currency})`, `Cost (${est.currency})`, 'Indicative people'],
      rows: est.team.map((r) => [r.role, d1(r.days), String(r.rate), money(r.cost), d1(r.fte)]), foot: ['Total', d1(est.totalDays), '', money(est.total), ''],
      note: `Total estimate: ${money(est.total)}, excluding ${est.currency === 'INR' ? 'GST and other applicable taxes' : 'taxes'}.${state.rateCard.isDefault ? ' Day rates are the tool\'s illustrative defaults and must be replaced with the vendor\'s rates.' : ''}` },
  ] });

  s.push({ id: 'rasic', title: 'Responsibility matrix (RASIC)', blocks: [
    { kind: 'p', text: 'R = Responsible (does the work), A = Accountable (signs it off; one per activity), S = Supports, I = Informed, C = Consulted.' },
    { kind: 'table', head: ['Activity', ...est.rasic.parties], rows: est.rasic.rows.map((r) => [r.activity, ...r.cells]) },
  ] });

  s.push({ id: 'timeline', title: 'Timeline, milestones and payment', blocks: [
    { kind: 'table', head: ['Milestone', 'Indicative week', 'Share', `Amount (${est.currency})`], rows: est.milestones.map((m) => [m.name, String(m.weekNumber), `${m.percent}%`, money(m.amount)]), foot: ['Total', '', '100%', money(est.total)] },
  ] });

  s.push({ id: 'assumptions', title: 'Assumptions', blocks: [{ kind: 'ul', items: narrative.assumptions }] });
  s.push({ id: 'client', title: 'Client responsibilities', blocks: [{ kind: 'ul', items: narrative.clientResponsibilities }] });
  s.push({ id: 'risks', title: 'Risks and mitigations', blocks: [{ kind: 'table', head: ['Risk', 'Impact', 'Mitigation'], rows: narrative.risks.map((r) => [r.risk, r.impact, r.mitigation]) }] });
  s.push({ id: 'acceptance', title: 'Acceptance criteria', blocks: [{ kind: 'ul', items: narrative.acceptanceCriteria }] });
  s.push({ id: 'governance', title: 'Governance and change control', blocks: [{ kind: 'p', text: 'Governance:' }, { kind: 'ul', items: narrative.governance }, { kind: 'p', text: 'Change control:' }, { kind: 'ul', items: narrative.changeControl }] });
  s.push({ id: 'commercial', title: 'Commercial terms', blocks: [{ kind: 'ul', items: narrative.commercialTerms }] });
  s.push({ id: 'signoff', title: 'Sign-off', blocks: [{ kind: 'table', head: ['', 'Name', 'Role', 'Signature', 'Date'], rows: [[state.clientName?.trim() || 'Client', '', '', '', ''], [state.vendorName?.trim() || 'Vendor', '', '', '', '']] }] });
  return s;
}

export function documentTitle(def: ProductDefinition, state: ProposalState): string {
  return `${state.docKind}: ${def.productName}`;
}

const preparedFor = (def: ProductDefinition, state: ProposalState) =>
  `Prepared for ${state.clientName?.trim() || def.businessUnit}${state.vendorName?.trim() ? ` by ${state.vendorName.trim()}` : ''}. Version ${def.version}.`;

export function proposalMarkdown(def: ProductDefinition, state: ProposalState, sections: Section[]): string {
  return renderMarkdown(documentTitle(def, state), [preparedFor(def, state)], sections);
}

/** HTML Word opens as a document (saved as .doc). No library needed. */
export function proposalHtml(def: ProductDefinition, state: ProposalState, sections: Section[]): string {
  return renderHtml(documentTitle(def, state), [preparedFor(def, state)], sections);
}
