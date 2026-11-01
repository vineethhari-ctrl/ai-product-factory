import type {
  ActivityType, Estimate, EstimateActivity, EstimateMilestone, EstimatePhase, EstimateTeamRow, ProductDefinition, ProposalState,
  RasicLetter, RasicMatrix, RateCard, ResourceRole, ScopeBaseline,
} from '../types';
import { applyScope } from './scope';

/**
 * High-level effort, cost, team and RASIC for the APPROVED scope. Rules-based and deterministic: the same scope and rate
 * card always give the same numbers, they recompute live when the BA edits a rate or a day, and every row says how its days
 * were worked out. Domain-neutral: units are screens, records, rules and integrations, never an industry's words.
 * The numbers are a high-level estimate for a proposal, not a sprint plan: the delivery team sizes the work.
 */

export const ROLES: ResourceRole[] = [
  'Project Manager', 'Business Analyst', 'Solution Architect', 'UX Designer',
  'Frontend Developer', 'Backend Developer', 'QA Engineer', 'DevOps Engineer',
];

/**
 * Estimating allowance (percent) built into every activity's days for clarification, rework and risk inside the approved
 * scope. It is part of each estimate, not a line of its own, and the document states only that an allowance is included.
 */
export const DEFAULT_ALLOWANCE_PCT = 15;

/** Working days in one person-month, the usual convention for effort tables. */
export const DEFAULT_DAYS_PER_MONTH = 20;

/** Person-months for a number of person-days, to two decimals. */
export const toMonths = (days: number, daysPerMonth: number) => Math.round((days / Math.max(1, daysPerMonth)) * 100) / 100;

export function defaultRateCard(): RateCard {
  return {
    currency: 'INR',
    // Illustrative day rates in INR; the BA replaces them with the vendor's own.
    rates: {
      'Project Manager': 12000, 'Business Analyst': 9000, 'Solution Architect': 15000, 'UX Designer': 9000,
      'Frontend Developer': 8000, 'Backend Developer': 9000, 'QA Engineer': 6500, 'DevOps Engineer': 9500,
    },
    allowancePct: DEFAULT_ALLOWANCE_PCT,
    daysPerMonth: DEFAULT_DAYS_PER_MONTH,
    utilisation: 0.85,
    maxPerRole: 4,
    isDefault: true,
  };
}

export function defaultProposalState(): ProposalState {
  return { docKind: 'Proposal', rateCard: defaultRateCard() };
}

/** A saved proposal whose rate card is still the untouched old USD default gets the current (INR) default; edited cards are kept. */
export function currentProposalState(saved?: ProposalState): ProposalState {
  if (!saved) return defaultProposalState();
  if (saved.rateCard.isDefault && saved.rateCard.currency === 'USD') return { ...saved, rateCard: defaultRateCard() };
  // A proposal saved before the allowance existed gets the default.
  if (saved.rateCard.allowancePct === undefined || saved.rateCard.daysPerMonth === undefined) {
    return { ...saved, rateCard: { ...saved.rateCard, allowancePct: saved.rateCard.allowancePct ?? DEFAULT_ALLOWANCE_PCT, daysPerMonth: saved.rateCard.daysPerMonth ?? DEFAULT_DAYS_PER_MONTH } };
  }
  return saved;
}

type Mix = Partial<Record<ResourceRole, number>>;
// Half-up to one decimal; the small epsilon stops binary floating point turning 8.05 into 8.0.
const round1 = (n: number) => Math.round(n * 10 + 1e-9) / 10;

/** Effort units (person-days) per screen layout: [functional, technical]. */
const SCREEN_DAYS: Record<string, [number, number]> = {
  dashboard: [2, 4], 'table-detail': [1.5, 3], 'form-wizard': [2, 4], 'split-view': [2, 4], 'profile-360': [3, 6], transaction: [3, 6],
};

// Share of functional / technical days that each role takes, per activity type.
const FUNC_MIX: Record<ActivityType, Mix> = {
  mobilise: { 'Project Manager': 0.7, 'Business Analyst': 0.3 },
  requirements: { 'Business Analyst': 0.85, 'Solution Architect': 0.15 },
  architecture: { 'Solution Architect': 0.7, 'Business Analyst': 0.3 },
  design: { 'UX Designer': 0.7, 'Business Analyst': 0.3 },
  build: { 'Business Analyst': 0.8, 'UX Designer': 0.2 },
  integration: { 'Business Analyst': 0.7, 'Solution Architect': 0.3 },
  qa: { 'QA Engineer': 0.6, 'Business Analyst': 0.4 },
  uat: { 'Business Analyst': 0.6, 'QA Engineer': 0.4 },
  deploy: { 'Business Analyst': 0.5, 'Project Manager': 0.5 },
  training: { 'Business Analyst': 0.8, 'UX Designer': 0.2 },
  management: { 'Project Manager': 1 },
};
const TECH_MIX: Record<ActivityType, Mix> = {
  mobilise: { 'Solution Architect': 0.5, 'DevOps Engineer': 0.5 },
  requirements: { 'Solution Architect': 1 },
  architecture: { 'Solution Architect': 0.7, 'Backend Developer': 0.3 },
  design: { 'Solution Architect': 0.3, 'Frontend Developer': 0.7 },
  build: { 'Frontend Developer': 0.4, 'Backend Developer': 0.5, 'Solution Architect': 0.1 },
  integration: { 'Backend Developer': 0.7, 'Solution Architect': 0.15, 'DevOps Engineer': 0.15 },
  qa: { 'QA Engineer': 0.85, 'DevOps Engineer': 0.15 },
  uat: { 'QA Engineer': 0.7, 'Backend Developer': 0.3 },
  deploy: { 'DevOps Engineer': 0.7, 'Backend Developer': 0.3 },
  training: { 'Frontend Developer': 1 },
  management: { 'Project Manager': 1 },
};

const PHASES = {
  mobilise: 'Phase 0: Mobilise and design',
  build: 'Phase 1: Build',
  test: 'Phase 2: Test and release',
  hypercare: 'Phase 3: Hypercare and handover',
} as const;

function split(type: ActivityType, functionalDays: number, technicalDays: number): Partial<Record<ResourceRole, number>> {
  const out: Partial<Record<ResourceRole, number>> = {};
  const add = (mix: Mix, days: number) => {
    for (const [role, share] of Object.entries(mix) as Array<[ResourceRole, number]>) out[role] = (out[role] ?? 0) + days * share;
  };
  add(FUNC_MIX[type], functionalDays);
  add(TECH_MIX[type], technicalDays);
  for (const r of Object.keys(out) as ResourceRole[]) out[r] = round1(out[r]!);
  // Rounding each role can drift from the activity's own total: give the difference to the biggest role so they always add up.
  const roles = Object.keys(out) as ResourceRole[];
  if (roles.length) {
    const drift = round1(round1(functionalDays + technicalDays) - roles.reduce((n, r) => n + out[r]!, 0));
    if (drift !== 0) {
      const biggest = roles.reduce((a, b) => (out[b]! > out[a]! ? b : a));
      out[biggest] = round1(out[biggest]! + drift);
    }
  }
  return out;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The activities for the approved scope, before any manual adjustment. */
function baseActivities(def: ProductDefinition): Array<Omit<EstimateActivity, 'roleDays' | 'adjusted'>> {
  const acts: Array<Omit<EstimateActivity, 'roleDays' | 'adjusted'>> = [];
  const push = (a: Omit<EstimateActivity, 'roleDays' | 'adjusted'>) => acts.push({ ...a, functionalDays: round1(a.functionalDays), technicalDays: round1(a.technicalDays) });

  const nScreens = def.screens.length, nRules = def.businessRules.length, nRecords = def.dataEntities.length;
  const nIntegrations = def.integrations.length, nJourneys = def.userJourneys.length, nModules = def.modules.length;
  const nFields = def.dataEntities.reduce((n, e) => n + e.fields.length, 0);

  push({ id: 'act-mobilise', phase: PHASES.mobilise, type: 'mobilise', name: 'Project mobilisation and plan', covers: 'Kick-off, team onboarding, delivery plan, governance and reporting set-up.',
    basis: 'Fixed: 4 functional + 3 technical (environments access, tooling).', deliverable: 'Project plan, governance calendar, RAID log', functionalDays: 4, technicalDays: 3 });
  push({ id: 'act-requirements', phase: PHASES.mobilise, type: 'requirements', name: 'Requirements baseline and sign-off', covers: `Walk the approved BRD with the business; settle the open questions; freeze the scope baseline (${plural(nModules, 'module')}, ${plural(nScreens, 'screen')}, ${plural(nRules, 'business rule')}).`,
    basis: `2 + 0.25 per rule and journey (${nRules + nJourneys}) functional; 1 + 0.1 per record (${nRecords}) technical.`, deliverable: 'Signed requirements baseline, answered open questions',
    functionalDays: 2 + 0.25 * (nRules + nJourneys), technicalDays: 1 + 0.1 * nRecords });
  push({ id: 'act-architecture', phase: PHASES.mobilise, type: 'architecture', name: 'Solution architecture and high-level design', covers: `Target architecture, data model for ${plural(nRecords, 'record')}, security and access design, integration approach for ${plural(nIntegrations, 'system')}.`,
    basis: `3 + 0.3 per record (${nRecords}) + 0.5 per integration (${nIntegrations}) technical; 1 functional.`, deliverable: 'Architecture and data design documents', functionalDays: 1, technicalDays: 3 + 0.3 * nRecords + 0.5 * nIntegrations });
  push({ id: 'act-design', phase: PHASES.mobilise, type: 'design', name: 'UX and interface design', covers: `Navigation and ${plural(nScreens, 'screen')} designed from the approved prototype, one design system.`,
    basis: `2 + 0.5 per screen (${nScreens}) functional; 2 + 0.5 per screen technical (front-end set-up and component library).`, deliverable: 'Approved screen designs and design system', functionalDays: 2 + 0.5 * nScreens, technicalDays: 2 + 0.5 * nScreens });
  push({ id: 'act-platform', phase: PHASES.mobilise, type: 'architecture', name: 'Environments, pipeline and platform foundation', covers: 'Development, test and production environments, build and release pipeline, access control, audit logging and base services.',
    basis: 'Fixed: 1 functional; 8 technical, plus 0.15 per record (' + nRecords + ').', deliverable: 'Working environments and release pipeline', functionalDays: 1, technicalDays: 8 + 0.15 * nRecords });

  // Build: one activity per module, high level: its screens, records it owns by name, the rules that apply.
  const ruleShare = nModules ? nRules / nModules : nRules;
  const recordShare = nModules ? nRecords / nModules : nRecords;
  const modules = def.modules.length ? def.modules : [{ id: 'mod-all', name: 'Core product', description: '', screens: def.screens.map((s) => s.id), confidence: 'CONFIRMED' as const, evidence: [] }];
  const used = new Set<string>();
  modules.forEach((m, idx) => {
    const own = def.screens.filter((s) => m.screens?.includes(s.id) || s.module === m.name || s.module === m.id);
    own.forEach((s) => used.add(s.id));
    const extra = idx === modules.length - 1 ? def.screens.filter((s) => !used.has(s.id) && !modules.some((x) => x.screens?.includes(s.id) || s.module === x.name || s.module === x.id)) : [];
    const screens = [...own, ...extra];
    let f = 1, t = 1; // module design and wiring
    for (const s of screens) {
      const [sf, st] = SCREEN_DAYS[s.layoutType] ?? SCREEN_DAYS['table-detail'];
      f += sf + (s.confidence === 'INFERRED' ? 0.5 : 0);
      t += st + (s.ui?.chain ? 4 : 0) + (s.ui?.device === 'phone' ? 1 : 0);
    }
    f += 0.5 * ruleShare; t += 1 * ruleShare;
    const fieldShare = nModules ? nFields / nModules : nFields;
    f += 0.5 * recordShare; t += (1 + 0) * recordShare + 0.1 * fieldShare;
    push({ id: `act-build-${idx + 1}`, phase: PHASES.build, type: 'build', name: `Build: ${m.name}`,
      covers: `${plural(screens.length, 'screen')}${screens.length ? ` (${screens.slice(0, 4).map((s) => s.name).join(', ')}${screens.length > 4 ? ', …' : ''})` : ''}, with its share of the records and business rules.`,
      basis: `Per screen by layout (functional + technical), plus ${round1(ruleShare)} rules and ${round1(recordShare)} records per module share.`, deliverable: `${m.name} working in the test environment`, functionalDays: f, technicalDays: t });
  });

  def.integrations.forEach((i, idx) => {
    push({ id: `act-int-${idx + 1}`, phase: PHASES.build, type: 'integration', name: `Integration: ${i.system}`, covers: `${i.purpose || 'Exchange of data with this system'} (${i.protocol || 'protocol to be confirmed'}).`,
      basis: 'Per integration: 1.5 functional (mapping, error cases) + 5 technical (build, test against the partner).', deliverable: `${i.system} integration tested end to end`, functionalDays: 1.5, technicalDays: 5 });
  });

  push({ id: 'act-nfr', phase: PHASES.build, type: 'architecture', name: 'Security, performance and audit hardening', covers: 'Access control review, audit trail, performance targets from the BRD, security testing fixes.',
    basis: 'Fixed 1 functional; 4 technical + 0.5 per integration (' + nIntegrations + ').', deliverable: 'Hardening report and fixes', functionalDays: 1, technicalDays: 4 + 0.5 * nIntegrations });

  const testCases = nRules * 2 + nScreens + nJourneys;
  push({ id: 'act-qa', phase: PHASES.test, type: 'qa', name: 'Test design and execution', covers: `Functional, regression and integration testing: each of ${plural(nRules, 'business rule')} proved to hold and to be refused when broken, ${plural(nJourneys, 'journey')} end to end.`,
    basis: `About ${testCases} test cases (2 per rule + 1 per screen + 1 per journey), 0.3 day each across design, execution and retest; 25% of it functional.`, deliverable: 'Test report with defects closed', functionalDays: testCases * 0.3 * 0.25, technicalDays: testCases * 0.3 * 0.75 });
  push({ id: 'act-perf', phase: PHASES.test, type: 'qa', name: 'Performance and security testing', covers: 'Load test against the quality targets, vulnerability scan, penetration test fixes.',
    basis: 'Fixed: 1 functional; 5 technical.', deliverable: 'Performance and security test results', functionalDays: 1, technicalDays: 5 });
  push({ id: 'act-uat', phase: PHASES.test, type: 'uat', name: 'User acceptance testing support', covers: `Support the business through ${plural(nJourneys, 'journey')}; triage and fix findings; obtain sign-off.`,
    basis: `Functional max(5, 0.5 per journey = ${nJourneys}); technical 4 for fixes.`, deliverable: 'UAT sign-off', functionalDays: Math.max(5, 0.5 * nJourneys), technicalDays: 4 });
  push({ id: 'act-training', phase: PHASES.test, type: 'training', name: 'Training and documentation', covers: 'User guides, role-based training sessions, admin handbook.',
    basis: `Functional 3 + 0.4 per role (${def.personas.length}); technical 1 (training environment).`, deliverable: 'User guides and trained users', functionalDays: 3 + 0.4 * def.personas.length, technicalDays: 1 });
  push({ id: 'act-deploy', phase: PHASES.test, type: 'deploy', name: 'Deployment and go-live', covers: 'Release to production, cutover plan, go-live checks.',
    basis: 'Fixed: 2 functional; 4 technical.', deliverable: 'Product live in production', functionalDays: 2, technicalDays: 4 });
  push({ id: 'act-hypercare', phase: PHASES.hypercare, type: 'deploy', name: 'Hypercare and handover', covers: 'Early-life support, fixing live issues, handover to the support team.',
    basis: 'Fixed: 3 functional; 5 technical (about 2 weeks).', deliverable: 'Stable service handed over', functionalDays: 3, technicalDays: 5 });
  return acts;
}

/** What an activity's size depends on, in plain words. Deliberately not the arithmetic: the allowance is part of each figure. */
function driversOf(def: ProductDefinition, id: string): string {
  const n = (x: number, one: string, many = `${one}s`) => `${x} ${x === 1 ? one : many}`;
  const rules = def.businessRules.length, records = def.dataEntities.length, screens = def.screens.length;
  const integrations = def.integrations.length, journeys = def.userJourneys.length, roles = def.personas.length;
  if (id.startsWith('act-build-')) return 'Depends on the module\'s screens and their layouts, and its share of the records and business rules.';
  if (id.startsWith('act-int-')) return 'Per integration: mapping, build and testing against the partner system.';
  switch (id) {
    case 'act-mobilise': return 'Fixed set-up effort.';
    case 'act-requirements': return `Depends on ${n(rules, 'rule')}, ${n(journeys, 'journey')} and ${n(records, 'record')}.`;
    case 'act-architecture': return `Depends on ${n(records, 'record')} and ${n(integrations, 'integration')}.`;
    case 'act-design': return `Depends on ${n(screens, 'screen')}.`;
    case 'act-platform': return `Foundation work, plus ${n(records, 'record')}.`;
    case 'act-nfr': return `Fixed hardening work, plus ${n(integrations, 'integration')}.`;
    case 'act-qa': return `Depends on the number of test cases drawn from ${n(rules, 'rule')}, ${n(screens, 'screen')} and ${n(journeys, 'journey')}.`;
    case 'act-perf': return 'Fixed testing effort.';
    case 'act-uat': return `Depends on ${n(journeys, 'journey')} to be accepted.`;
    case 'act-training': return `Depends on ${n(roles, 'role')} to train.`;
    case 'act-deploy': return 'Fixed release effort.';
    case 'act-hypercare': return 'About two weeks of early-life support.';
    case 'act-pm': return 'A share of all other effort.';
    default: return '';
  }
}

export function estimateActivities(def: ProductDefinition, state?: ProposalState): EstimateActivity[] {
  const base = baseActivities(def);
  // Project management is a share of everything else (12%), so it moves when scope or a day is changed.
  const adj = state?.adjustments ?? {};
  // The estimating allowance is folded into each activity's days. A figure the BA typed is final and is not scaled.
  const k = 1 + Math.max(0, state?.rateCard.allowancePct ?? DEFAULT_ALLOWANCE_PCT) / 100;
  const withAdj = base.map((a) => {
    const o = adj[a.id];
    // Scale the activity's total, then split it, so the activity grows by exactly the allowance (10 days -> 11.5).
    const scaledTotal = round1((a.functionalDays + a.technicalDays) * k);
    const scaledF = round1(a.functionalDays * k);
    const functionalDays = o?.functionalDays !== undefined ? o.functionalDays : scaledF;
    const technicalDays = o?.technicalDays !== undefined ? o.technicalDays : round1(scaledTotal - scaledF);
    return { ...a, functionalDays, technicalDays, adjusted: o?.functionalDays !== undefined || o?.technicalDays !== undefined };
  });
  const sum = withAdj.reduce((n, a) => n + a.functionalDays + a.technicalDays, 0);
  const pm = (() => {
    const o = adj['act-pm'];
    const f = o?.functionalDays !== undefined ? o.functionalDays : round1(sum * 0.12);
    return { id: 'act-pm', phase: 'Throughout', type: 'management' as ActivityType, name: 'Project management and governance',
      covers: 'Planning, status reporting, risk and change control, steering committee, vendor and stakeholder management.',
      basis: '12% of all other effort.', deliverable: 'Weekly status, RAID log, steering packs', functionalDays: f, technicalDays: 0, adjusted: o?.functionalDays !== undefined };
  })();
  return [...withAdj, pm].map((a) => ({ ...a, roleDays: split(a.type, a.functionalDays, a.technicalDays), basis: driversOf(def, a.id) }));
}

// RASIC: parties and the letter each takes for an activity type. One A and at least one R per row.
export const RASIC_PARTIES = ['Client sponsor', 'Client BU lead', 'Project manager', 'Business analyst', 'Solution architect', 'UX designer', 'Developers', 'QA engineer', 'DevOps engineer'];
const RASIC: Record<ActivityType, RasicLetter[]> = {
  //            Spons BUlead PM  BA   SA   UX   Dev  QA   DevOps
  mobilise:     ['I', 'C', 'A', 'R', 'S', 'I', 'I', 'I', 'S'],
  requirements: ['A', 'R', 'C', 'R', 'S', 'C', 'I', 'C', 'I'],
  architecture: ['I', 'C', 'C', 'S', 'A', 'I', 'R', 'C', 'R'],
  design:       ['I', 'C', 'I', 'S', 'C', 'A', 'R', 'I', ''],
  build:        ['I', 'C', 'A', 'S', 'C', 'S', 'R', 'S', 'I'],
  integration:  ['I', 'C', 'A', 'S', 'C', '', 'R', 'S', 'S'],
  qa:           ['I', 'C', 'A', 'S', 'I', '', 'S', 'R', 'S'],
  uat:          ['A', 'R', 'C', 'S', 'I', '', 'S', 'S', 'I'],
  deploy:       ['A', 'C', 'R', 'S', 'C', '', 'S', 'S', 'R'],
  training:     ['I', 'A', 'C', 'R', '', 'S', 'S', 'I', ''],
  management:   ['A', 'C', 'R', 'S', 'C', 'I', 'I', 'I', 'I'],
};
export function rasicFor(activities: EstimateActivity[]): RasicMatrix {
  return {
    parties: RASIC_PARTIES,
    rows: activities.map((a) => ({ activityId: a.id, activity: a.name, cells: RASIC[a.type] })),
  };
}

const MILESTONES: Array<{ name: string; afterPhase: string; percent: number; atEnd: boolean }> = [
  { name: 'Project mobilised and plan agreed', afterPhase: PHASES.mobilise, percent: 10, atEnd: false },
  { name: 'Design and requirements baseline signed off', afterPhase: PHASES.mobilise, percent: 20, atEnd: true },
  { name: 'Build complete and handed to test', afterPhase: PHASES.build, percent: 35, atEnd: true },
  { name: 'User acceptance signed off', afterPhase: PHASES.test, percent: 25, atEnd: false },
  { name: 'Go-live and hypercare complete', afterPhase: PHASES.hypercare, percent: 10, atEnd: true },
];

/** Effort, cost, team, phases, milestones and RASIC for the approved scope. */
export function buildEstimate(def: ProductDefinition, scope: ScopeBaseline, state: ProposalState): Estimate {
  const approved = applyScope(def, scope);
  const rc = state.rateCard;
  const activities = estimateActivities(approved, state);
  const rate = (r: ResourceRole) => Math.max(0, Number(rc.rates[r]) || 0);

  const roleDays = Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<ResourceRole, number>;
  for (const a of activities) for (const [r, d] of Object.entries(a.roleDays) as Array<[ResourceRole, number]>) roleDays[r] += d;
  const functionalDays = round1(activities.reduce((n, a) => n + a.functionalDays, 0));
  const technicalDays = round1(activities.reduce((n, a) => n + a.technicalDays, 0));
  const costOf = (a: EstimateActivity) => (Object.entries(a.roleDays) as Array<[ResourceRole, number]>).reduce((n, [r, d]) => n + d * rate(r), 0);

  const subtotal = Math.round(ROLES.reduce((n, r) => n + roleDays[r] * rate(r), 0));
  // The price is days x rate: no contingency is added to the cost and rates are never adjusted. The allowance lives in the days.
  const total = subtotal;

  // Indicative duration: the busiest role works with at most `maxPerRole` people at the productive share of a week.
  const perWeek = 5 * (rc.utilisation > 0 ? rc.utilisation : 0.85);
  const busiest = Math.max(1, ...ROLES.map((r) => roleDays[r]));
  const durationWeeks = Math.max(8, Math.ceil(busiest / (Math.max(1, rc.maxPerRole) * perWeek) / 0.7));
  const team: EstimateTeamRow[] = ROLES.filter((r) => roleDays[r] > 0).map((r) => ({
    role: r, days: round1(roleDays[r]), rate: rate(r), cost: Math.round(roleDays[r] * rate(r)), fte: round1(roleDays[r] / (durationWeeks * perWeek)),
  }));

  const order = [PHASES.mobilise, PHASES.build, PHASES.test, PHASES.hypercare] as string[];
  const inPhase = (p: string) => activities.filter((a) => a.phase === p);
  const daysOf = (as: EstimateActivity[]) => as.reduce((n, a) => n + a.functionalDays + a.technicalDays, 0);
  const phaseDays = order.map((p) => daysOf(inPhase(p)));
  const allPhaseDays = phaseDays.reduce((n, d) => n + d, 0) || 1;
  const phaseWeeks = phaseDays.map((d) => Math.max(1, Math.round((d / allPhaseDays) * durationWeeks)));
  // Project management runs throughout, so its days and cost are spread over the phases by their share of the work.
  const pm = activities.filter((a) => a.phase === 'Throughout');
  const pmDays = daysOf(pm), pmCost = pm.reduce((n, a) => n + costOf(a), 0);
  const phases: EstimatePhase[] = order.map((p, i) => ({
    phase: p, weeks: phaseWeeks[i],
    days: round1(phaseDays[i] + pmDays * (phaseDays[i] / allPhaseDays)),
    cost: Math.round(inPhase(p).reduce((n, a) => n + costOf(a), 0) + pmCost * (phaseDays[i] / allPhaseDays)),
  }));
  const totalWeeks = phaseWeeks.reduce((n, w) => n + w, 0);

  let cum = 0;
  const endWeek: Record<string, number> = {};
  order.forEach((p, i) => { cum += phaseWeeks[i]; endWeek[p] = cum; });
  const startWeek: Record<string, number> = {};
  order.forEach((p, i) => { startWeek[p] = endWeek[p] - phaseWeeks[i] + 1; });
  const milestones: EstimateMilestone[] = MILESTONES.map((m, i) => {
    // The last "percent" is rounded off so the amounts add up to the total.
    const amount = i === MILESTONES.length - 1 ? 0 : Math.round(total * (m.percent / 100));
    return { name: m.name, afterPhase: m.afterPhase, weekNumber: m.atEnd ? endWeek[m.afterPhase] : (m.afterPhase === PHASES.mobilise ? Math.min(2, startWeek[m.afterPhase] + 1) : endWeek[m.afterPhase] - 1), percent: m.percent, amount };
  });
  milestones[milestones.length - 1].amount = total - milestones.slice(0, -1).reduce((n, m) => n + m.amount, 0);
  void totalWeeks;

  return {
    activities, phases, team, milestones, rasic: rasicFor(activities),
    functionalDays, technicalDays, totalDays: round1(functionalDays + technicalDays),
    subtotal, total, durationWeeks: phaseWeeks.reduce((n, w) => n + w, 0), currency: rc.currency || 'USD',
    daysPerMonth: Math.max(1, rc.daysPerMonth ?? DEFAULT_DAYS_PER_MONTH),
  };
}

export function formatMoney(amount: number, currency: string): string {
  // Indian digit grouping (lakh, crore) for rupees; the usual grouping for other currencies.
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  try { return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount); }
  catch { return `${currency} ${Math.round(amount).toLocaleString(locale)}`; }
}
