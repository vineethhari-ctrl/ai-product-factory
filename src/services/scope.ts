import type { ProductDefinition, ScopeBaseline, ScopeItem, ScopeKind, ScreenDefinition } from '../types';
import { testSuiteSignature } from './testSuite';

/**
 * The approved scope: the BU's decisions on the draft BRD (keep / cut / add), kept as in/out flags on the BRD's own
 * items. Everything after the BRD (effort, cost, RASIC, the proposal) is built from the APPROVED view of the BRD
 * (`applyScope`), never from the first draft. Pure: runs in the browser and on the server. Domain-neutral.
 */

export const SCOPE_KIND_LABEL: Record<ScopeKind, string> = {
  module: 'Modules', screen: 'Screens', record: 'Records', rule: 'Business rules', integration: 'Integrations', journey: 'Journeys',
};
export const SCOPE_KIND_ORDER: ScopeKind[] = ['module', 'screen', 'record', 'rule', 'integration', 'journey'];

const hash = (text: string) => {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

function moduleNameOf(def: ProductDefinition, s: ScreenDefinition): string | undefined {
  const m = def.modules.find((x) => x.screens?.includes(s.id) || x.name === s.module || x.id === s.module);
  return m?.name ?? (s.module || undefined);
}

/** Every BRD item, all kept: the starting point before the BU's cuts are applied. */
export function buildScopeFromDefinition(def: ProductDefinition, source: ScopeBaseline['source'] = 'manual'): ScopeBaseline {
  const keep = (i: Omit<ScopeItem, 'included' | 'change'>): ScopeItem => ({ ...i, included: true, change: 'KEPT' });
  const items: ScopeItem[] = [
    ...def.modules.map((m) => keep({ id: `module:${m.id}`, kind: 'module', name: m.name, detail: m.description })),
    ...def.screens.map((s) => keep({ id: `screen:${s.id}`, kind: 'screen', name: s.name, parent: moduleNameOf(def, s), detail: s.purpose, layoutType: s.layoutType })),
    ...def.dataEntities.map((e) => keep({ id: `record:${e.id}`, kind: 'record', name: e.name, detail: e.description })),
    ...def.businessRules.map((r) => keep({ id: `rule:${r.id}`, kind: 'rule', name: r.code, detail: r.rule })),
    ...def.integrations.map((i) => keep({ id: `integration:${i.id}`, kind: 'integration', name: i.system, detail: i.purpose })),
    ...def.userJourneys.map((j) => keep({ id: `journey:${j.id}`, kind: 'journey', name: j.name, detail: j.outcome })),
  ];
  return { basedOn: testSuiteSignature(def), source, confirmed: false, items };
}

/** The stored baseline when it was made for this BRD, else a fresh all-kept one. `stale` = the BRD changed since. */
export function currentScope(def: ProductDefinition): { scope: ScopeBaseline; stale: boolean; stored: boolean } {
  const sig = testSuiteSignature(def);
  const stored = def.scopeBaseline;
  if (stored && stored.basedOn === sig) return { scope: stored, stale: false, stored: true };
  return { scope: buildScopeFromDefinition(def), stale: !!stored, stored: false };
}

const isIn = (s: ScopeBaseline, id: string) => s.items.find((i) => i.id === id)?.included !== false;

/** Cutting a module cuts its screens; bringing it back brings them back. */
export function setIncluded(scope: ScopeBaseline, id: string, included: boolean): ScopeBaseline {
  const target = scope.items.find((i) => i.id === id);
  if (!target) return scope;
  const change = (i: ScopeItem, inc: boolean): ScopeItem => ({
    ...i, included: inc, change: i.change === 'NEW' ? 'NEW' : inc ? 'KEPT' : 'REMOVED',
  });
  return {
    ...scope,
    confirmed: false,
    items: scope.items.map((i) => {
      if (i.id === id) return change(i, included);
      if (target.kind === 'module' && i.kind === 'screen' && i.parent === target.name) return change(i, included);
      return i;
    }),
  };
}

export function addScopeItem(scope: ScopeBaseline, kind: ScopeKind, name: string, detail?: string, parent?: string): ScopeBaseline {
  const clean = name.trim();
  if (!clean) return scope;
  if (scope.items.some((i) => i.kind === kind && i.name.toLowerCase() === clean.toLowerCase())) return scope;
  const n = scope.items.filter((i) => i.change === 'NEW').length + 1;
  const item: ScopeItem = { id: `${kind}:new-${n}`, kind, name: clean, detail: detail?.trim() || undefined, parent, included: true, change: 'NEW', layoutType: kind === 'screen' ? 'table-detail' : undefined };
  return { ...scope, confirmed: false, items: [...scope.items, item] };
}

export function removeNewItem(scope: ScopeBaseline, id: string): ScopeBaseline {
  return { ...scope, confirmed: false, items: scope.items.filter((i) => !(i.id === id && i.change === 'NEW')) };
}

/** The BRD as the BU approved it: cut items gone, added items present. Estimates are built from this. */
export function applyScope(def: ProductDefinition, scope: ScopeBaseline): ProductDefinition {
  const mods = new Set(scope.items.filter((i) => i.kind === 'module' && i.included).map((i) => i.name));
  const keptModuleItems = scope.items.filter((i) => i.kind === 'module');
  const screenIn = (id: string, parent?: string) => isIn(scope, `screen:${id}`) && (!parent || !keptModuleItems.some((m) => m.name === parent) || mods.has(parent));
  const keepId = (kind: ScopeKind, id: string) => isIn(scope, `${kind}:${id}`);
  const fresh = scope.items.filter((i) => i.change === 'NEW' && i.included);
  const confidence = 'CONFIRMED' as const;
  const screens: ScreenDefinition[] = [
    ...def.screens.filter((s) => screenIn(s.id, moduleNameOf(def, s))),
    ...fresh.filter((i) => i.kind === 'screen').map((i): ScreenDefinition => ({
      id: i.id.replace('screen:', 'scr-'), name: i.name, module: i.parent ?? '', layoutType: i.layoutType ?? 'table-detail',
      components: [], purpose: i.detail ?? '', confidence, evidence: ['Added by the BU in the approved BRD'],
    })),
  ];
  const keptScreenIds = new Set(screens.map((s) => s.id));
  return {
    ...def,
    modules: [
      ...def.modules.filter((m) => keepId('module', m.id)).map((m) => ({ ...m, screens: (m.screens ?? []).filter((id) => keptScreenIds.has(id)) })),
      ...fresh.filter((i) => i.kind === 'module').map((i) => ({ id: i.id.replace('module:', 'mod-'), name: i.name, description: i.detail ?? '', screens: [], confidence, evidence: ['Added by the BU in the approved BRD'] })),
    ],
    screens,
    navigation: def.navigation.filter((n) => keptScreenIds.has(n.screenId) || !def.screens.some((x) => x.id === n.screenId)),
    dataEntities: [
      ...def.dataEntities.filter((e) => keepId('record', e.id)),
      ...fresh.filter((i) => i.kind === 'record').map((i) => ({ id: i.id.replace('record:', 'ent-'), name: i.name, description: i.detail ?? '', fields: [], relationships: [], confidence, evidence: ['Added by the BU in the approved BRD'] })),
    ],
    businessRules: [
      ...def.businessRules.filter((r) => keepId('rule', r.id)),
      ...fresh.filter((i) => i.kind === 'rule').map((i) => ({ id: i.id.replace('rule:', 'br-'), code: i.name, rule: i.detail ?? i.name, context: '', confidence, evidence: ['Added by the BU in the approved BRD'] })),
    ],
    integrations: [
      ...def.integrations.filter((i) => keepId('integration', i.id)),
      ...fresh.filter((i) => i.kind === 'integration').map((i) => ({ id: i.id.replace('integration:', 'int-'), system: i.name, protocol: 'To be confirmed', purpose: i.detail ?? '', confidence, evidence: ['Added by the BU in the approved BRD'] })),
    ],
    userJourneys: [
      ...def.userJourneys.filter((j) => keepId('journey', j.id)),
      ...fresh.filter((i) => i.kind === 'journey').map((i) => ({ id: i.id.replace('journey:', 'uj-'), name: i.name, persona: '', steps: [], outcome: i.detail ?? '', confidence, evidence: ['Added by the BU in the approved BRD'] })),
    ],
  };
}

/** Fingerprint of what is approved (included ids and names): a changed scope makes the written proposal stale. */
export function scopeSignature(scope: ScopeBaseline): string {
  return `p${hash(JSON.stringify(scope.items.filter((i) => i.included).map((i) => [i.id, i.name, i.layoutType ?? ''])))}`;
}

export interface ScopeCounts { total: number; kept: number; removed: number; added: number; byKind: Record<ScopeKind, { total: number; kept: number; removed: number; added: number }>; }
export function scopeCounts(scope: ScopeBaseline): ScopeCounts {
  const byKind = Object.fromEntries(SCOPE_KIND_ORDER.map((k) => [k, { total: 0, kept: 0, removed: 0, added: 0 }])) as ScopeCounts['byKind'];
  for (const i of scope.items) {
    const b = byKind[i.kind];
    b.total++;
    if (i.change === 'NEW') b.added++;
    else if (i.included) b.kept++;
    else b.removed++;
  }
  const sum = (f: keyof ScopeCounts['byKind'][ScopeKind]) => SCOPE_KIND_ORDER.reduce((n, k) => n + byKind[k][f], 0);
  return { total: sum('total'), kept: sum('kept'), removed: sum('removed'), added: sum('added'), byKind };
}

// ── Matching an uploaded final BRD to the draft ──────────────────────────────────────────────────

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'are', 'was', 'all', 'any', 'per', 'its', 'not', 'but', 'can', 'has', 'have', 'will', 'shall', 'must', 'new', 'view', 'list', 'page', 'screen', 'module', 'management']);
const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 2 && !STOP.has(w));

/**
 * Offline matching: an item is KEPT when its name (or rule code, or most of its distinctive words) appears in the final
 * BRD's text, REMOVED otherwise. It cannot find items the BU added. A starting point for the BA to confirm, not a verdict.
 */
export function matchScopeToText(scope: ScopeBaseline, text: string): Array<{ id: string; keep: boolean; note: string }> {
  const hay = text.toLowerCase();
  const hayWords = new Set(words(text));
  return scope.items.filter((i) => i.change !== 'NEW').map((i) => {
    const name = i.name.toLowerCase().trim();
    if (name.length > 2 && hay.includes(name)) return { id: i.id, keep: true, note: 'Name found in the final BRD' };
    const ws = Array.from(new Set(words(i.name)));
    if (ws.length > 0) {
      const hit = ws.filter((w) => hayWords.has(w)).length;
      if (hit / ws.length >= 0.75) return { id: i.id, keep: true, note: 'Most of its words found in the final BRD' };
    }
    return { id: i.id, keep: false, note: 'Not found in the final BRD' };
  });
}

/** Applies matching decisions (AI or rules) and any items the BU added, to a baseline. A module cut cuts its screens. */
export function applyReconciliation(
  scope: ScopeBaseline,
  decisions: Array<{ id: string; keep: boolean; note?: string }>,
  added: Array<{ kind: ScopeKind; name: string; detail?: string }>,
  meta: { fileName?: string; matchedBy: 'AI' | 'RULES' },
): ScopeBaseline {
  let next: ScopeBaseline = { ...scope, source: 'upload', fileName: meta.fileName, matchedBy: meta.matchedBy, confirmed: false };
  const known = new Map(decisions.map((d) => [d.id, d]));
  next = { ...next, items: next.items.map((i) => (known.has(i.id) && i.change !== 'NEW' ? { ...i, note: known.get(i.id)!.note } : i)) };
  for (const d of decisions) {
    const cur = next.items.find((i) => i.id === d.id);
    if (cur && cur.change !== 'NEW' && cur.included !== d.keep) next = setIncluded(next, d.id, d.keep);
  }
  for (const a of added) next = addScopeItem(next, a.kind, a.name, a.detail);
  return { ...next, confirmed: false };
}
