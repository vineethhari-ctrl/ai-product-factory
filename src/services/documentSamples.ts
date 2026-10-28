import type { DataFieldDefinition, DocumentFieldKind } from '../types';
import { resolveFieldConstraints } from './validationEngine';

/**
 * Sample values for a business document that opens "filled in". Domain-neutral: values come from the field's kind,
 * its label and (when the record's field is known) its constraints; row `i` gives a different value from row 0.
 */

const pad = (n: number) => String(n).padStart(2, '0');
const initials = (label: string) => {
  const w = label.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).filter((x) => !/^(id|no|number|code)$/i.test(x));
  const s = (w.length ? w : ['ref']).map((x) => x[0]).join('').toUpperCase().slice(0, 3);
  return s.length >= 2 ? s : (s + 'REF').slice(0, 3);
};
const between = (lo: number, hi: number, i: number) => lo + Math.round(((hi - lo) * ((i * 37 + 11) % 100)) / 100);
const money = (n: number) => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function documentSample(kind: DocumentFieldKind, label: string, options: string[] | undefined, i: number, field?: DataFieldDefinition): string {
  const c = field ? resolveFieldConstraints(field) : undefined;
  if (options?.length) return options[i % options.length];
  if (c?.enumValues?.length) return c.enumValues[i % c.enumValues.length];
  const lo = c?.min, hi = c?.max;
  switch (kind) {
    case 'email': return `${initials(label).toLowerCase()}.contact${i + 1}@example.com`;
    case 'phone': return `+91 98${pad(10 + i * 7)}${pad(40 + i * 3)}${pad(11 + i)}0`.slice(0, 16);
    case 'date': return `2026-${pad(1 + ((i * 3 + 1) % 12))}-${pad(5 + ((i * 4) % 20))}`;
    case 'percent': return String(between(lo ?? 55, hi ?? 95, i));
    case 'number': return String(between(lo ?? 5, hi ?? 60, i));
    case 'money': return money(between(lo ?? 1200, hi ?? 9800, i) + 0.5 * 0);
    case 'checkbox': return i % 2 ? 'Yes' : 'No';
    case 'long-text': return 'Reviewed against the stated rules; no further action needed.';
    case 'lookup': case 'select': return `${initials(label)}-${1040 + i * 7}`;
    default: {
      const code = `${initials(label)}-${1040 + i * 7}`;
      const min = c?.minLength ?? 0, max = c?.maxLength ?? 40;
      const isCode = c?.format === 'identifier' || /(code|number|ref|reference|serial|id)\b/i.test(label);
      const v = isCode ? code : `${label} ${i + 1}`;
      return (v.length >= min ? v : v.padEnd(min, '0')).slice(0, max);
    }
  }
}

/** The same sample for the next row: a trailing number moves on, anything else repeats. */
export function varySample(sample: string, i: number): string {
  if (i === 0) return sample;
  const m = sample.match(/^(.*?)(\d+)(\D*)$/);
  return m ? `${m[1]}${String(Number(m[2]) + i * 7).padStart(m[2].length, '0')}${m[3]}` : sample;
}
