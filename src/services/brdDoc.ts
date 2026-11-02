import type { ApproachNote, ConfidenceStatus, FitGap, ProductDefinition } from '../types';
import type { Block, Section } from './docRender';
import { renderMarkdown } from './docRender';
import { currentFitGap, devObjects, FIT_LABEL, isPackage } from './fitGap';
import { constraintSummary, withSystemFields } from './validationEngine';
import { forAudience } from './questionAudience';
import { readableState } from './documentMath';

/**
 * The documents the business reads, written as sections (docRender.ts): the BRD, the review sheet they answer, and the approach
 * note. Plain business language, no commercial information: nothing about effort, price or the delivery team's plan. Items the
 * AI proposed (not stated by the business) are marked so nobody mistakes a proposal for a decision. Domain-neutral.
 */

/** Words a business reader understands for how sure we are of an item. */
export function basisOf(c: ConfidenceStatus | undefined): string {
  switch (c) {
    case 'CONFIRMED': return 'Stated by the business';
    case 'INFERRED': return 'Proposed: please confirm';
    case 'AMBIGUOUS': return 'Unclear: please clarify';
    case 'MISSING': return 'Missing: please provide';
    default: return 'Proposed: please confirm';
  }
}
const proposed = (c: ConfidenceStatus | undefined) => c !== 'CONFIRMED';
const URGENCY: Record<string, string> = { blocking: 'Must be answered before sign-off', important: 'Important', 'nice-to-have': 'Nice to have' };
const tidy = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const ul = (items: string[]): Block => ({ kind: 'ul', items });
const p = (text: string): Block => ({ kind: 'p', text });
const table = (head: string[], rows: string[][], extra: Partial<Extract<Block, { kind: 'table' }>> = {}): Block => ({ kind: 'table', head, rows, ...extra });

export interface DocOptions {
  /** The day the pack was made, as written in the document ("2 November 2026"). Passed in so the same input gives the same file. */
  preparedOn?: string;
  preparedBy?: string;
}

/** The BRD as a business reader sees it. */
export function brdSections(def: ProductDefinition, opts: DocOptions = {}): Section[] {
  const s: Section[] = [];
  const br = def.blueprintBrief;
  const problems = def.problemStatement?.length ? def.problemStatement : br?.painPoints ?? [];
  const kpis = def.successMetrics?.length ? def.successMetrics : br?.kpis ?? [];
  const buQuestions = forAudience(def.openQuestions ?? [], 'BU', (q) => q.question);
  const proposedCount =
    def.personas.filter((x) => proposed(x.confidence)).length + def.modules.filter((x) => proposed(x.confidence)).length +
    def.screens.filter((x) => proposed(x.confidence)).length + def.businessRules.filter((x) => proposed(x.confidence)).length +
    def.integrations.filter((x) => proposed(x.confidence)).length;

  s.push({ id: 'control', title: 'About this document', blocks: [
    table(['', ''], [
      ['Product', def.productName], ['Business unit', def.businessUnit], ['Version', def.version],
      ['Status', def.isApproved ? 'Approved' : 'Draft for business review'],
      ...(opts.preparedOn ? [['Prepared on', opts.preparedOn]] : []),
      ...(opts.preparedBy ? [['Prepared by', opts.preparedBy]] : []),
      ['Items proposed for you to confirm', `${proposedCount}`],
    ]),
    p('Please read this together with the prototype. Where the business has not said something, we proposed it from how similar work is usually done and marked it "Proposed: please confirm". The review sheet lists what we need from you.'),
  ] });

  s.push({ id: 'objective', title: 'Objective, problems today and success measures', blocks: [
    p(def.objective),
    ...(problems.length ? [p('What goes wrong today:'), ul(problems)] : []),
    ...(kpis.length ? [p('How success will be measured:'), ul(kpis)] : []),
  ] });

  s.push({ id: 'users', title: 'Who uses the product', blocks: [
    table(['Role', 'What they need to do', 'What they are allowed to do', 'Basis'],
      def.personas.map((x) => [x.name + (x.role && x.role !== x.name ? ` (${x.role})` : ''), x.keyGoals.map(tidy).join('; '), x.permissions.map(tidy).join('; '), basisOf(x.confidence)])),
  ] });

  const stageRows = (br?.stages ?? []).map((st, i) => [String(i + 1), st, br?.stageOwners?.[i] ?? '']);
  s.push({ id: 'process', title: 'How the work flows', blocks: [
    ...(stageRows.length ? [p('The stages a piece of work goes through, in order, and who does each:'), table(['Step', 'Stage', 'Done by'], stageRows)] : []),
    ...(def.userJourneys.length ? [p('What each user can get done:'), table(['Journey', 'Who', 'Steps', 'Result', 'Basis'],
      def.userJourneys.map((j) => [j.name, j.persona, j.steps.map((x) => x.replace(/[.\s]+$/, '')).join(' → '), j.outcome, basisOf(j.confidence)]))] : []),
  ] });

  s.push({ id: 'scope', title: 'What the product contains', blocks: [
    table(['Module', 'What it covers', 'Basis'], def.modules.map((m) => [m.name, m.description, basisOf(m.confidence)])),
    table(['Screen', 'Module', 'What it is for', 'Basis'], def.screens.map((x) => [x.name, x.module, x.purpose, basisOf(x.confidence)])),
  ] });

  const docs = def.screens.filter((x) => x.layoutType === 'transaction' && x.ui?.document);
  if (docs.length) {
    s.push({ id: 'documents', title: 'Business documents', blocks: [
      p('The documents people create and move through the process. The prototype lets you try each one.'),
      table(['Document', 'Statuses, in order', 'What people can do with it', 'Main details captured'],
        docs.map((x) => {
          const d = x.ui!.document!;
          const fields = d.sections.flatMap((sec) => sec.fields.map((f) => f.label));
          return [d.name, d.states.map(readableState).join(' → '), d.actions.map((a) => `${a.label}${a.role ? ` (${a.role})` : ''}`).join('; '),
            fields.slice(0, 14).join(', ') + (fields.length > 14 ? `, and ${fields.length - 14} more` : '') + (d.lines ? `. Line items: ${d.lines.columns.map((c) => c.label).join(', ')}` : '')];
        })),
    ] });
  }

  s.push({ id: 'rules', title: 'Business rules', blocks: [
    p('The rules the product enforces. Each one is checked by the product and cannot be skipped.'),
    table(['Code', 'Rule', 'Applies to', 'Basis'], def.businessRules.map((r) => [r.code || 'Rule', r.rule, r.context, basisOf(r.confidence)])),
  ] });

  s.push({ id: 'records', title: 'Information the product keeps', blocks: def.dataEntities.flatMap((e): Block[] => {
    const fields = withSystemFields(e).fields.filter((f) => f.source !== 'system');
    const states = e.lifecycle?.states.map(readableState);
    return [
      p(`${e.name}: ${e.description}${states?.length ? ` Statuses: ${states.join(' → ')}.` : ''}`),
      table(['Field', 'Required', 'Rules on the value'], fields.map((f) => [f.name, f.required ? 'Yes' : 'No', constraintSummary(f).join(', ') || '-'])),
    ];
  }) });

  const extra: Block[] = [];
  if (def.validations.length) extra.push(p('Checks on what people type:'), table(['Field', 'Check', 'Message shown'], def.validations.map((v) => [v.field, v.validationRule, v.errorMessage])));
  if (def.notifications.length) extra.push(p('Messages the product sends:'), table(['When', 'Who is told', 'How'], def.notifications.map((n) => [n.event, n.recipient, n.channel])));
  if (def.integrations.length) extra.push(p('Other systems it works with:'), table(['System', 'How', 'Why', 'Basis'], def.integrations.map((i) => [i.system, i.protocol, i.purpose, basisOf(i.confidence)])));
  if (extra.length) s.push({ id: 'checks', title: 'Checks, messages and connections to other systems', blocks: extra });

  if (isPackage(def)) s.push(...fitGapSections(def, currentFitGap(def)));

  if (def.nonFunctionalRequirements?.length || def.risks?.length) {
    s.push({ id: 'quality', title: 'Quality targets and risks', blocks: [
      ...(def.nonFunctionalRequirements?.length ? [table(['Area', 'What is expected', 'Target'], def.nonFunctionalRequirements.map((n) => [n.area, n.requirement, n.target ?? '']))] : []),
      ...(def.risks?.length ? [p('Risks to the product and what to do about them:'), table(['Risk', 'What it would cost', 'What to do'], def.risks.map((r) => [r.risk, r.impact, r.mitigation]))] : []),
    ] });
  }

  if (def.assumptions?.length) {
    s.push({ id: 'assumptions', title: 'Assumptions', blocks: [
      p('What this document assumes. Anything marked "pending" needs your confirmation (see the review sheet).'),
      table(['Assumption', 'Risk if wrong', 'Status'], def.assumptions.map((a) => [a.statement, a.riskLevel, a.status === 'accepted' ? 'Accepted' : a.status === 'challenged' ? 'Challenged' : 'Pending your confirmation'])),
    ] });
  }

  if (buQuestions.length) {
    const open = buQuestions.filter((q) => q.status === 'open');
    s.push({ id: 'questions', title: 'Open questions for the business', blocks: [
      p(`${open.length} question${open.length === 1 ? '' : 's'} still need an answer. The review sheet has room for your answers.`),
      ul(buQuestions.map((q) => `[${URGENCY[q.urgency] ?? q.urgency}] ${q.question}${q.status === 'answered' ? ' (answered)' : ''}`)),
    ] });
  }

  s.push({ id: 'signoff', title: 'Sign-off', blocks: [
    p(`By signing, the business confirms that this document describes what it wants ${isPackage(def) ? 'implemented' : 'built'}, apart from any changes written on the review sheet.`),
    table(['', 'Name', 'Role', 'Signature', 'Date'], [['Business owner', '', '', '', ''], ['Business reviewer', '', '', '', '']], { tall: true }),
  ] });
  return s;
}

/** What the business needs to answer: questions, assumptions to confirm, and each proposed item to keep, change or remove. */
export function reviewSections(def: ProductDefinition): Section[] {
  const s: Section[] = [];
  const questions = forAudience(def.openQuestions ?? [], 'BU', (q) => q.question).filter((q) => q.status === 'open');
  const order = (u: string) => (u === 'blocking' ? 0 : u === 'important' ? 1 : 2);
  const sorted = [...questions].sort((a, b) => order(a.urgency) - order(b.urgency));

  s.push({ id: 'how', title: 'How to use this sheet', blocks: [
    p('This sheet is for you to write on. Fill in the last column of each table, then send it back (or reply to the email with the same answers). You do not need to answer everything at once: start with the questions marked "Must be answered before sign-off".'),
    p('In the table of items we proposed, write Keep, Change or Remove for each one. Anything you remove will not be built or priced.'),
  ] });

  s.push({ id: 'questions', title: 'Questions for the business', blocks: [
    sorted.length
      ? table(['#', 'Question', 'How important', 'Your answer'], sorted.map((q, i) => [`Q${i + 1}`, q.question, URGENCY[q.urgency] ?? q.urgency, '']), { tall: true })
      : p('There are no open questions for the business at the moment.'),
  ] });

  const pending = (def.assumptions ?? []).filter((a) => a.status === 'pending-validation');
  s.push({ id: 'assumptions', title: 'Assumptions to confirm', blocks: [
    pending.length
      ? table(['#', 'Assumption', 'Risk if wrong', 'Correct? (Yes, or what should change)'], pending.map((a, i) => [`A${i + 1}`, a.statement, a.riskLevel, '']), { tall: true })
      : p('There are no assumptions waiting for confirmation.'),
  ] });

  if (isPackage(def)) {
    const fg = currentFitGap(def);
    const changes = fg.rows.filter((r) => r.fit === 'process-change');
    s.push({ id: 'process-changes', title: `Where we propose to use the standard way of working in ${fg.platform}`, blocks: [
      changes.length
        ? table(['#', 'Requirement', 'What would change', 'Agree? (Yes, or why not)'], changes.map((r) => [r.id, r.requirement, r.gap || r.platformFeature, '']), { tall: true })
        : p(`We have not proposed any change to how you work: every requirement is met by ${fg.platform} as it is, by settings, or by building what is missing.`),
    ] });
  }

  const items: string[][] = [];
  for (const m of def.modules) if (proposed(m.confidence)) items.push(['Module', m.name, m.description, '']);
  for (const x of def.screens) if (proposed(x.confidence)) items.push(['Screen', x.name, x.purpose, '']);
  for (const r of def.businessRules) if (proposed(r.confidence)) items.push(['Rule', `${r.code || 'Rule'}: ${r.rule}`, r.context, '']);
  for (const i of def.integrations) if (proposed(i.confidence)) items.push(['Connection', i.system, i.purpose, '']);
  for (const x of def.personas) if (proposed(x.confidence)) items.push(['Role', x.name, x.keyGoals.map(tidy).join('; '), '']);
  s.push({ id: 'items', title: 'Items we proposed: keep, change or remove?', blocks: [
    items.length
      ? table(['Kind', 'Item', 'What it is', 'Keep / Change / Remove'], items, { tall: true })
      : p('Everything in the document was stated by the business. Nothing was proposed for you to confirm.'),
  ] });

  s.push({ id: 'other', title: 'Anything else', blocks: [table(['Your notes'], [['']], { tall: true })] });
  return s;
}

/** The approach note as a business reader sees it. */
export function approachSections(def: ProductDefinition, n: ApproachNote): Section[] {
  const s: Section[] = [];
  s.push({ id: 'summary', title: 'Summary', blocks: [p(n.executiveSummary)] });
  s.push({ id: 'problems', title: 'The problems we are solving', blocks: [ul(n.asIsProblemStatement)] });
  if (n.assumptions.length) s.push({ id: 'assumptions', title: 'What we are assuming (please confirm)', blocks: [ul(n.assumptions)] });
  s.push({ id: 'solution', title: 'How the solution works', blocks: [ul(n.toBeTargetArchitecture)] });
  if (n.alternatives.length) s.push({ id: 'options', title: 'Choices we considered', blocks: [table(['Option', 'Trade-off', 'What we propose'], n.alternatives.map((a) => [a.option, a.tradeoff, a.recommendation]))] });
  s.push({ id: 'phases', title: 'Rollout in phases', blocks: [table(['Phase', 'When', 'Focus', 'What you get', 'Done when'],
    n.phasedExecutionStrategy.map((x) => [x.phase, x.timeline, x.focus, x.delivers.join('; '), (x.exitCriteria ?? []).join('; ')]))] });
  s.push({ id: 'risks', title: 'Risks and how we handle them', blocks: [table(['Risk', 'What it would cost', 'What we do'], n.keyRisksAndMitigations.map((r) => [r.risk, r.impact ?? '', r.mitigation]))] });
  const mine = n.decisions.filter((d) => d.team === 'BU Team');
  if (mine.length) s.push({ id: 'decisions', title: 'Decisions we need from the business', blocks: [table(['Needed', 'Question', 'What we propose'], mine.map((d) => [d.neededBy, d.question, d.recommendation ?? '']))] });
  void def;
  return s;
}

/** The fit-gap of a package implementation as a business reader sees it (also part of the BRD). No effort or money. */
export function fitGapSections(def: ProductDefinition, fg: FitGap): Section[] {
  const s: Section[] = [];
  s.push({ id: 'fitgap', title: `How ${fg.platform} meets the requirements (fit-gap)`, blocks: [
    p(fg.summary),
    p(fg.origin === 'AI'
      ? `Assessed against ${fg.platform}. Anything marked "to be confirmed" is checked with a ${fg.platform} specialist in the design workshops.`
      : `A first view from the requirements alone. Every line is checked with a ${fg.platform} specialist in the design workshops.`),
    p('Standard: works as delivered. Configuration: met by settings, no new code. Development: something new is built. Process change: the business adopts the standard way of working. Third-party: met outside the platform.'),
    table(['#', 'Area', 'Requirement', 'Fit', `How ${fg.platform} meets it`, 'What is missing and how it is closed'],
      fg.rows.map((r) => [r.id, r.area, r.requirement, `${FIT_LABEL[r.fit]}${r.objectType ? ` (${r.objectType})` : ''}`, r.platformFeature, r.gap ?? ''])),
  ] });
  const groups = devObjects(fg);
  if (groups.length) {
    s.push({ id: 'fitgap-dev', title: 'What will be built on top of the platform', blocks: [
      table(['Kind', 'How many', 'Items'], groups.map((g) => [g.type, String(g.rows.length), g.rows.map((r) => `${r.id} ${r.requirement}`).join('; ')])),
    ] });
  }
  if (fg.migration.length) {
    s.push({ id: 'fitgap-migration', title: `Information to bring into ${fg.platform}`, blocks: [
      table(['Information', 'Comes from', 'Notes'], fg.migration.map((m) => [m.name, m.source, m.notes ?? ''])),
    ] });
  }
  s.push({ id: 'fitgap-setup', title: `How ${fg.platform} is set up for the business`, blocks: [
    ...(fg.orgStructure.length ? [p('Organisation to define:'), ul(fg.orgStructure)] : []),
    ...(fg.authorisations.length ? [p('Who gets which access:'), table(['Role', 'Access'], fg.authorisations.map((a) => [a.role, a.access]))] : []),
    ...(fg.openPoints.length ? [p('Still to confirm:'), ul(fg.openPoints)] : []),
  ] });
  void def;
  return s;
}

/** The fit-gap as plain text (Markdown) for copying into an email or a workshop deck. */
export function fitGapText(def: ProductDefinition, fg: FitGap): string {
  return renderMarkdown(`Fit-gap: ${def.productName} on ${fg.platform}`, [`${def.productName} for ${def.businessUnit}. Version ${def.version}.`], fitGapSections(def, fg));
}
