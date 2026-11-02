import type { Complexity, DeliveryMode, DevObjectType, FitCategory, FitGap, FitGapRow, MigrationObject, ProductDefinition, ScreenDefinition } from '../types';
import { testSuiteSignature } from './testSuite';

/**
 * Package implementation: how a chosen platform meets each requirement of the BRD (fit-gap). A model writes it from the
 * finished BRD when one is configured (server/fitGapService.ts); this file is the rules-based baseline, the coverage
 * guarantee and the helpers both sides share. Domain- and platform-neutral: the platform is whatever the BA typed, every
 * other noun comes from the BRD. Rules-based fits are guesses from the BRD's shape and say so.
 */

export const FIT_LABEL: Record<FitCategory, string> = {
  standard: 'Standard',
  configure: 'Configuration',
  develop: 'Development',
  'process-change': 'Process change',
  'third-party': 'Third-party / outside the platform',
};

export const FIT_ORDER: FitCategory[] = ['standard', 'configure', 'develop', 'process-change', 'third-party'];
export const DEV_TYPES: DevObjectType[] = ['Report', 'Interface', 'Conversion', 'Enhancement', 'Form', 'Workflow'];

export const isPackage = (def: { delivery?: DeliveryMode } | null | undefined): boolean => def?.delivery?.kind === 'package';

/** The platform as the BA named it, or a neutral phrase when none was typed. */
export const platformName = (def: { delivery?: DeliveryMode } | null | undefined): string =>
  (def?.delivery?.platform || '').trim().slice(0, 80) || 'the chosen platform';

/** A clean delivery value from untrusted input (request body, saved file). */
export function cleanDelivery(raw: unknown): DeliveryMode | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as { kind?: unknown; platform?: unknown };
  if (r.kind !== 'package' && r.kind !== 'custom') return undefined;
  const platform = typeof r.platform === 'string' ? r.platform.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80) : '';
  return r.kind === 'package' ? { kind: 'package', ...(platform ? { platform } : {}) } : { kind: 'custom' };
}

/** Fingerprint of what a fit-gap is written for: the BRD and the platform. */
export const fitGapSignature = (def: ProductDefinition): string => `${testSuiteSignature(def)}|${platformName(def).toLowerCase()}`;

const lower = (s: string) => s.toLowerCase();

function areaOfText(def: ProductDefinition, text: string): string {
  const t = lower(text);
  const m = def.modules.find((x) => x.name && t.includes(lower(x.name)));
  if (m) return m.name;
  const s = def.screens.find((x) => x.name && t.includes(lower(x.name)));
  if (s) return s.module || def.modules[0]?.name || 'Cross-process';
  return def.modules[0]?.name || 'Cross-process';
}

function screenArea(def: ProductDefinition, s: ScreenDefinition): string {
  const m = def.modules.find((x) => x.screens?.includes(s.id) || x.name === s.module || x.id === s.module);
  return m?.name || s.module || 'Cross-process';
}

function interfaceComplexity(protocol: string): Complexity {
  if (/real.?time|event|stream|socket|queue|\bmq\b|webhook/i.test(protocol)) return 'High';
  if (/file|csv|sftp|ftp|batch|flat/i.test(protocol)) return 'Low';
  return 'Medium';
}

/** Migration complexity from how many business fields the record carries. */
function migrationComplexity(fields: number): Complexity {
  return fields <= 8 ? 'Low' : fields <= 20 ? 'Medium' : 'High';
}

type Draft = Omit<FitGapRow, 'id'>;

/** Rows for one BRD item, from its shape alone. */
function ruleRow(def: ProductDefinition, r: ProductDefinition['businessRules'][number], platform: string): Draft {
  const approval = /approv|authori[sz]|sign.?off|escalat/i.test(`${r.rule} ${r.context}`);
  return {
    area: areaOfText(def, `${r.context} ${r.rule}`),
    requirement: `${r.code}: ${r.rule}`,
    traces: [r.code],
    fit: 'configure',
    platformFeature: approval ? `Approval / workflow configuration in ${platform} (to be confirmed)` : `Rule configured in ${platform} (to be confirmed)`,
    gap: approval ? 'Routing and approvers set up in configuration; a custom workflow only if the standard one cannot route it.' : 'Set up in configuration; development only if the standard settings cannot express the rule.',
    complexity: approval ? 'Medium' : 'Low',
  };
}

function integrationRow(def: ProductDefinition, i: ProductDefinition['integrations'][number]): Draft {
  return {
    area: areaOfText(def, `${i.purpose} ${i.system}`),
    requirement: `Exchange data with ${i.system}: ${i.purpose || 'purpose to be confirmed'}`,
    traces: [i.system],
    fit: 'develop',
    objectType: 'Interface',
    platformFeature: `Interface between the platform and ${i.system} (${i.protocol || 'protocol to be confirmed'})`,
    gap: 'Not delivered by the standard product: an interface is built, mapped and tested against the partner system.',
    complexity: interfaceComplexity(i.protocol || ''),
  };
}

function screenRows(def: ProductDefinition, s: ScreenDefinition, platform: string): Draft[] {
  const area = screenArea(def, s);
  const base = { area, traces: [s.name] };
  if (s.ui?.chain) return [{ ...base, requirement: `${s.name}: ${s.purpose}`, fit: 'develop', objectType: 'Enhancement', platformFeature: 'Tamper-evident record chain', gap: 'Not a standard capability: built as an extension.', complexity: 'High' }];
  if (s.ui?.device === 'phone') return [{ ...base, requirement: `${s.name}: ${s.purpose}`, fit: 'develop', objectType: 'Enhancement', platformFeature: `Mobile app on ${platform} (standard mobile app first, to be confirmed)`, gap: 'An outside party uses it on their own phone: a mobile extension unless the standard mobile app covers the job.', complexity: 'Medium' }];
  switch (s.layoutType) {
    case 'dashboard':
      return [{ ...base, requirement: `${s.name}: ${s.purpose}`, fit: 'develop', objectType: 'Report', platformFeature: `Standard analytics in ${platform} first; a custom report for what it cannot show`, gap: 'Measures specific to this business usually need a report or analytics view.', complexity: 'Medium' }];
    case 'transaction': {
      const doc = s.ui?.document?.name || s.name;
      return [
        { ...base, requirement: `${s.name}: ${s.purpose}`, fit: 'standard', platformFeature: `Standard transaction for the ${doc} (to be confirmed)`, complexity: 'Medium' },
        { ...base, requirement: `Printed / sent output of the ${doc}`, fit: 'develop', objectType: 'Form', platformFeature: `Output form for the ${doc}`, gap: 'The business layout of the document is a form built on the standard output.', complexity: 'Low' },
      ];
    }
    case 'form-wizard':
      return [{ ...base, requirement: `${s.name}: ${s.purpose}`, fit: 'configure', platformFeature: `Standard entry screen with fields and checks configured (to be confirmed)`, gap: 'Fields, defaults and checks set up in configuration.', complexity: 'Low' }];
    default:
      return [{ ...base, requirement: `${s.name}: ${s.purpose}`, fit: 'standard', platformFeature: `Standard list / display in ${platform} (to be confirmed)`, complexity: 'Low' }];
  }
}

export const numberRows = (rows: Draft[]): FitGapRow[] => rows.map((r, i) => ({ ...r, id: `FG-${String(i + 1).padStart(2, '0')}` }));

/** The rules-based fit-gap: every screen, rule and integration of the BRD, every record as a migration object. */
export function buildFitGap(def: ProductDefinition): FitGap {
  const platform = platformName(def);
  const drafts: Draft[] = [
    ...def.screens.flatMap((s) => screenRows(def, s, platform)),
    ...def.businessRules.map((r) => ruleRow(def, r, platform)),
    ...def.integrations.map((i) => integrationRow(def, i)),
  ];
  const migration: MigrationObject[] = def.dataEntities.map((e) => {
    const fields = e.fields.filter((f) => f.source !== 'system').length;
    return { name: e.name, source: 'Current system or spreadsheets (to be confirmed)', complexity: migrationComplexity(fields), notes: `${fields} business field${fields === 1 ? '' : 's'}; open items and history to be agreed.` };
  });
  drafts.push(...migration.map((m): Draft => ({
    area: 'Data migration', requirement: `Load existing ${m.name} records`, traces: [m.name], fit: 'develop', objectType: 'Conversion',
    platformFeature: `Standard data load tools of ${platform} (to be confirmed)`, gap: 'Extract, cleanse, map and load; rehearsed before go-live.', complexity: m.complexity,
  })));
  const rows = numberRows(drafts);
  const stageOwners = [...new Set((def.blueprintBrief?.stageOwners ?? []).filter(Boolean))];
  const fg: FitGap = {
    origin: 'OFFLINE',
    basedOn: fitGapSignature(def),
    platform,
    summary: '',
    areas: def.modules.map((m) => m.name),
    rows,
    migration,
    orgStructure: [
      `The legal entities and business units that will use ${platform}`,
      'The sites, locations or regions where the work is done',
      stageOwners.length ? `The teams that own each stage: ${stageOwners.join(', ')}` : 'The teams that own each stage of the process',
      'Number ranges and document types for each business record',
    ],
    authorisations: def.personas.map((p) => ({ role: p.name, access: def.permissions.find((x) => x.role === p.name)?.accessLevel || p.permissions.slice(0, 3).join('; ') || 'to be defined' })),
    openPoints: [
      `Every fit here is derived from the shape of the BRD, not from ${platform} itself: a ${platform} functional consultant must confirm each row in the fit-gap workshops.`,
      'Which existing records are migrated (open items only, or history too) and from which systems.',
    ],
  };
  fg.summary = fitGapSummaryText(fg);
  return fg;
}

export function fitGapCounts(fg: FitGap): Record<FitCategory, number> {
  const out = Object.fromEntries(FIT_ORDER.map((k) => [k, 0])) as Record<FitCategory, number>;
  for (const r of fg.rows) out[r.fit] = (out[r.fit] ?? 0) + 1;
  return out;
}

/** Development objects grouped by type (the reports, interfaces, conversions, enhancements, forms and workflows list). */
export function devObjects(fg: FitGap): Array<{ type: DevObjectType; rows: FitGapRow[] }> {
  return DEV_TYPES.map((type) => ({ type, rows: fg.rows.filter((r) => r.fit === 'develop' && (r.objectType ?? 'Enhancement') === type) })).filter((g) => g.rows.length);
}

export function fitGapSummaryText(fg: FitGap): string {
  const c = fitGapCounts(fg);
  const total = fg.rows.length || 1;
  const pct = (n: number) => Math.round((n / total) * 100);
  return `${fg.rows.length} requirements assessed against ${fg.platform}: ${c.standard} standard (${pct(c.standard)}%), ${c.configure} by configuration (${pct(c.configure)}%), ${c.develop} needing development (${pct(c.develop)}%)${c['process-change'] ? `, ${c['process-change']} by changing the process` : ''}${c['third-party'] ? `, ${c['third-party']} outside the platform` : ''}. ${fg.migration.length} record type${fg.migration.length === 1 ? '' : 's'} to migrate.`;
}

/**
 * Every business rule and every integration of the BRD must be covered by a row. A model that left one out gets the
 * rules-based row for it, and the fit-gap lists what was added.
 */
export function ensureFitGapCoverage(def: ProductDefinition, rows: Draft[]): { rows: FitGapRow[]; added: string[] } {
  const traced = new Set(rows.flatMap((r) => r.traces.map((t) => lower(t.trim()))));
  const text = rows.map((r) => lower(`${r.requirement} ${r.platformFeature}`)).join(' ');
  const platform = platformName(def);
  const added: string[] = [];
  const extra: Draft[] = [];
  for (const r of def.businessRules) {
    if (traced.has(lower(r.code)) || new RegExp(`\\b${r.code.replace(/[^A-Za-z0-9-]/g, '')}\\b`, 'i').test(text)) continue;
    extra.push(ruleRow(def, r, platform));
    added.push(r.code);
  }
  for (const i of def.integrations) {
    if (traced.has(lower(i.system)) || text.includes(lower(i.system))) continue;
    extra.push(integrationRow(def, i));
    added.push(i.system);
  }
  return { rows: numberRows([...rows, ...extra]), added };
}

/** The fit-gap to show: the stored one when it was written for this BRD and platform, else the rules-based one. */
export function currentFitGap(def: ProductDefinition): FitGap {
  return def.fitGap && def.fitGap.basedOn === fitGapSignature(def) ? def.fitGap : buildFitGap(def);
}

/**
 * The fit-gap trimmed to the scope the BU approved: rows and migration objects for items the business cut are dropped,
 * and items the business added (rules, integrations, screens, records) get their rules-based rows. Sizes the estimate.
 */
export function fitGapForScope(fg: FitGap, full: ProductDefinition, approved: ProductDefinition): FitGap {
  const names = (d: ProductDefinition) => new Set([
    ...d.businessRules.map((r) => r.code), ...d.screens.map((s) => s.name), ...d.integrations.map((i) => i.system), ...d.dataEntities.map((e) => e.name),
  ].map(lower));
  const before = names(full), after = names(approved);
  const removed = new Set([...before].filter((n) => !after.has(n)));
  const keep = (r: FitGapRow) => !r.traces.length || r.traces.some((t) => !removed.has(lower(t.trim())));
  const kept: Draft[] = fg.rows.filter(keep).map(({ id: _id, ...r }) => r);
  // Screens and records the business added are not in the fit-gap yet: give them their rules-based rows.
  const traced = new Set(kept.flatMap((r) => r.traces.map((t) => lower(t.trim()))));
  const platform = platformName(approved);
  for (const s of approved.screens) if (!before.has(lower(s.name)) && !traced.has(lower(s.name))) kept.push(...screenRows(approved, s, platform));
  const migration = fg.migration.filter((m) => !removed.has(lower(m.name)));
  for (const e of approved.dataEntities) {
    if (before.has(lower(e.name)) || migration.some((m) => lower(m.name) === lower(e.name))) continue;
    const fields = e.fields.filter((f) => f.source !== 'system').length;
    migration.push({ name: e.name, source: 'Current system or spreadsheets (to be confirmed)', complexity: migrationComplexity(fields) });
  }
  const { rows } = ensureFitGapCoverage(approved, kept);
  return { ...fg, rows, migration, summary: fitGapSummaryText({ ...fg, rows, migration }) };
}
