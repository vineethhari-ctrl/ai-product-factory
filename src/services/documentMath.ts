import type { DocumentAction, TransactionDocument } from '../types';

/**
 * Arithmetic and workflow rules for a business document (a 'transaction' screen), shared by the browser and the
 * server checks. Domain-neutral: column names come from the document itself (whatever the BU calls quantity, price,
 * discount and amount).
 */

/** A number written by a person or a model: "1,20,000.50", "$1,250", "15%" -> 120000.5, 1250, 15. NaN when none. */
export function parseNumber(value: string | number | undefined | null): number {
  if (typeof value === 'number') return value;
  if (value == null) return NaN;
  const cleaned = String(value).replace(/[^0-9.\-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return NaN;
  return Number(cleaned);
}

const colIndex = (labels: string[], label: string | undefined) =>
  label ? labels.findIndex((l) => l.trim().toLowerCase() === label.trim().toLowerCase()) : -1;

/** One line's amount: quantity x price, less the line discount %. Falls back to the amount cell when it cannot be calculated. */
export function lineAmount(doc: TransactionDocument, row: string[]): number {
  const lines = doc.lines;
  if (!lines) return 0;
  const labels = lines.columns.map((c) => c.label);
  const qi = colIndex(labels, lines.quantityColumn);
  const pi = colIndex(labels, lines.priceColumn);
  const di = colIndex(labels, lines.discountColumn);
  const ai = colIndex(labels, lines.amountColumn);
  const qty = qi >= 0 ? parseNumber(row[qi]) : 1;
  const price = pi >= 0 ? parseNumber(row[pi]) : NaN;
  if (Number.isFinite(price)) {
    const discount = di >= 0 ? parseNumber(row[di]) : 0;
    const q = Number.isFinite(qty) ? qty : 0;
    return round2(q * price * (1 - (Number.isFinite(discount) ? Math.min(Math.max(discount, 0), 100) : 0) / 100));
  }
  const stated = ai >= 0 ? parseNumber(row[ai]) : NaN;
  return Number.isFinite(stated) ? stated : 0;
}

/** True when the document's lines carry money, so a totals block makes sense. */
export function hasAmounts(doc: TransactionDocument): boolean {
  const l = doc.lines;
  return !!l && (!!l.priceColumn || !!l.amountColumn);
}

export interface DocumentTotals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

export function documentTotals(doc: TransactionDocument, rows: string[][]): DocumentTotals {
  const subtotal = round2(rows.reduce((sum, r) => sum + lineAmount(doc, r), 0));
  const discount = round2(subtotal * (doc.totals?.discountPercent ?? 0) / 100);
  const tax = round2((subtotal - discount) * (doc.totals?.taxPercent ?? 0) / 100);
  return { subtotal, discount, tax, total: round2(subtotal - discount + tax) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Money in the document's currency when it is a valid code, else a plain number with two decimals. */
export function formatMoney(n: number, currency?: string): string {
  if (currency && /^[A-Z]{3}$/.test(currency)) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
    } catch {
      /* unknown code: plain number below */
    }
  }
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** The status a new document starts in. */
/**
 * Statuses a document has passed through to reach `current`: the shortest path from the first status along the
 * actions. A status on a branch it never took (a rejection, a flag) is not ticked. Without a path (an odd status),
 * everything before it in the list counts.
 */
export function completedStates(doc: TransactionDocument, current: string): Set<string> {
  const start = initialState(doc);
  if (!current || current === start) return new Set();
  const prev = new Map<string, string>();
  const queue = [start];
  const seen = new Set([start]);
  while (queue.length) {
    const at = queue.shift() as string;
    for (const a of doc.actions) {
      if (!a.from.includes(at) || seen.has(a.to)) continue;
      seen.add(a.to);
      prev.set(a.to, at);
      queue.push(a.to);
    }
  }
  if (!prev.has(current)) {
    const i = doc.states.indexOf(current);
    return new Set(i > 0 ? doc.states.slice(0, i) : []);
  }
  const done = new Set<string>();
  for (let s = prev.get(current); s !== undefined; s = prev.get(s)) done.add(s);
  return done;
}

const SHORT_WORDS = new Set(['IN', 'OF', 'ON', 'TO', 'AT', 'BY', 'OR', 'AND', 'FOR', 'NEW', 'OLD', 'ALL', 'END', 'OFF', 'OUT', 'SET', 'GET', 'NO', 'YES', 'UP', 'IS', 'AS', 'THE', 'DUE', 'PAY']);

/**
 * "PENDING_MANUAL_REVIEW" -> "Pending Manual Review". Only a value written as UPPER_CASE words is touched; anything with a
 * lower-case letter, a dash or a space-separated sentence is left as written. Short words that are probably acronyms
 * (EV, SLA, NMC) stay upper-case; a lone short token (LFP) is left alone unless `force` (a status).
 */
export function readableValue(s: string, force = false): string {
  if (typeof s !== 'string') return s;
  const t = s.trim();
  if (!/^[A-Z][A-Z0-9]*(?:[_ ][A-Z0-9]+)*$/.test(t) || !/[A-Z]{2}/.test(t)) return s;
  if (!force && !/[_ ]/.test(t) && t.length <= 4) return s;
  return t.split(/[_ ]+/).map((w) => (/\d/.test(w) || (w.length <= 3 && !SHORT_WORDS.has(w) && !force) ? w : w[0] + w.slice(1).toLowerCase())).join(' ');
}

/** A status the way a person reads it. */
export const readableState = (s: string): string => (/[a-z]/.test(s) ? s : readableValue(s, true));

/**
 * One choice from a list, the way a person reads it. A model copies the record's codes into choice lists
 * ("CRITICAL_SAFETY_HAZARD", "EQUIPMENT_ASSET - Reciprocating Compressor"): the code part is written as words and a
 * descriptive tail after " - " is kept as written. Short acronyms stay upper-case ("SLA_BREACH" -> "SLA Breach", "EV" stays).
 * Anything that already has a lower-case letter in its code part is left exactly as written. Idempotent.
 */
export function readableOption(s: string): string {
  if (typeof s !== 'string') return s;
  const m = s.trim().match(/^([A-Z][A-Z0-9]*(?:[_ ][A-Z0-9]+)*)(\s[-\u2013\u2014]\s.+)?$/);
  if (!m || !/[A-Z]{2}/.test(m[1])) return s;
  const [, head, tail = ''] = m;
  const words = head.split(/[_ ]+/);
  // A lone word of 4+ letters is a value (HIGH, NONE, NORMAL), a lone short one is an acronym (EV, SLA).
  if (words.length === 1) return (words[0].length <= 3 || /\d/.test(words[0]) ? words[0] : words[0][0] + words[0].slice(1).toLowerCase()) + tail;
  return words.map((w) => (/\d/.test(w) ? w : w.length <= 3 && !SHORT_WORDS.has(w) ? w : w[0] + w.slice(1).toLowerCase())).join(' ') + tail;
}

interface HumanizableDoc {
  states?: string[];
  actions?: Array<{ from?: string[]; to?: string }>;
  sections?: Array<{ fields?: Array<{ options?: string[]; sample?: string }> }>;
  lines?: { columns?: Array<{ options?: string[] }>; rows?: string[][] };
}

/**
 * The document with every status, choice list and sample written the way a person reads it (statuses, the from/to of each
 * action, the options of select fields and line columns, and the sample picked from them). Idempotent, so it runs both when
 * a document is cleaned on the server and when one is shown (which also fixes projects saved before).
 */
export function humanizeDocumentStates<T extends HumanizableDoc>(doc: T): T {
  return {
    ...doc,
    ...(doc.states ? { states: doc.states.map(readableState) } : {}),
    ...(doc.actions ? { actions: doc.actions.map((a) => ({ ...a, ...(a.from ? { from: a.from.map(readableState) } : {}), ...(a.to ? { to: readableState(a.to) } : {}) })) } : {}),
    ...(doc.sections ? {
      sections: doc.sections.map((sec) => ({
        ...sec,
        ...(sec.fields ? { fields: sec.fields.map((f) => ({
          ...f,
          ...(f.options ? { options: f.options.map(readableOption) } : {}),
          // A sample that is one of the options is written the same way, so it still matches its option.
          ...(typeof f.sample === 'string' && f.options?.length ? { sample: readableOption(f.sample) } : {}),
        })) } : {}),
      })),
    } : {}),
    ...(doc.lines?.columns ? {
      lines: {
        ...doc.lines,
        columns: doc.lines.columns.map((c) => (c.options ? { ...c, options: c.options.map(readableOption) } : c)),
        // The sample lines of a select column hold the same choices, written the same way.
        ...(doc.lines.rows ? { rows: doc.lines.rows.map((r) => r.map((cell, i) => (doc.lines!.columns![i]?.options ? readableOption(cell) : cell))) } : {}),
      },
    } : {}),
  };
}

export const initialState = (doc: TransactionDocument) => doc.states[0] ?? '';

/** Actions offered in a status. An action without `from` is offered in every status except the last one. */
export function actionsFor(doc: TransactionDocument, status: string): DocumentAction[] {
  const s = status.trim().toLowerCase();
  const last = (doc.states[doc.states.length - 1] ?? '').trim().toLowerCase();
  return doc.actions.filter((a) =>
    a.from.length ? a.from.some((f) => f.trim().toLowerCase() === s) : s !== last
  );
}

/** Header fields that are required but empty, by label. */
export function missingRequired(doc: TransactionDocument, values: Record<string, string>): string[] {
  return doc.sections.flatMap((sec) => sec.fields)
    .filter((f) => f.required && !f.readOnly && f.kind !== 'checkbox' && !(values[f.label] ?? '').trim())
    .map((f) => f.label);
}
