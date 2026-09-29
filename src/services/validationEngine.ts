import type {
  DataEntityDefinition,
  DataFieldDefinition,
  EntityLifecycle,
  EntityRule,
  FieldConstraints,
  FieldFormat,
  FieldSensitivity,
  RuleOp,
} from '../types';

/**
 * Domain-neutral validation engine, shared by the browser (forms) and Express
 * (POST /api/validate-record) so the two cannot drift.
 *
 * It knows only generic value shapes (email, date, integer, enum, ...), a small
 * rule vocabulary (conditional, compare, requiredTogether, mutuallyExclusive)
 * and a generic lifecycle. Everything domain-specific arrives as data on the
 * entity definition. Nothing here may mention a business domain.
 */

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

export type RecordMode = 'create' | 'update';

export const FIELD_FORMATS: FieldFormat[] = [
  'text', 'free-text', 'identifier', 'email', 'phone', 'url', 'uuid', 'date', 'datetime', 'time',
  'integer', 'decimal', 'percentage', 'boolean', 'enum', 'currency-code', 'country-code', 'postal-code',
];
const SENSITIVITIES: FieldSensitivity[] = ['none', 'pii', 'financial', 'credential'];

/** Longest value the engine will run pattern checks on. Bounds worst-case regex time. */
const MAX_VALUE_LENGTH = 10_000;
const MAX_PATTERN_INPUT = 512;
const MAX_PATTERN_LENGTH = 200;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// ─── Patterns from the model are untrusted ──────────────────────────────────

/** True for shapes that can backtrack catastrophically: a quantified group holding an unbounded quantifier or alternation. */
function hasCatastrophicShape(p: string): boolean {
  type G = { hasUnbounded: boolean; hasAlt: boolean };
  const stack: G[] = [];
  let inClass = false;
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === '\\') { i++; continue; }
    if (inClass) { if (ch === ']') inClass = false; continue; }
    if (ch === '[') { inClass = true; continue; }
    if (ch === '(') { stack.push({ hasUnbounded: false, hasAlt: false }); continue; }
    if (ch === '|') { if (stack.length) stack[stack.length - 1].hasAlt = true; continue; }
    if (ch === '+' || ch === '*' || (ch === '{' && /^\{\d+,\}/.test(p.slice(i)))) {
      if (stack.length) stack[stack.length - 1].hasUnbounded = true;
      continue;
    }
    if (ch === ')') {
      const g = stack.pop();
      if (!g) continue;
      const followedByUnbounded = /^(?:[+*]|\{\d+,\})/.test(p.slice(i + 1));
      if (followedByUnbounded && (g.hasUnbounded || g.hasAlt)) return true;
      if (stack.length && g.hasUnbounded) stack[stack.length - 1].hasUnbounded = true;
    }
  }
  return false;
}

export function isSafePattern(pattern: unknown): pattern is string {
  if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > MAX_PATTERN_LENGTH) return false;
  if (/\\[1-9]/.test(pattern)) return false; // backreferences
  if (hasCatastrophicShape(pattern)) return false;
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

const regexCache = new Map<string, RegExp | null>();
function safeRegex(pattern: string): RegExp | null {
  if (regexCache.has(pattern)) return regexCache.get(pattern)!;
  const re = isSafePattern(pattern) ? new RegExp(pattern) : null;
  regexCache.set(pattern, re);
  return re;
}

// ─── Constraint resolution ──────────────────────────────────────────────────

/** Turn legacy type strings such as "string(17)", "enum(A, B)" or "numeric(10,2)" into constraints. */
export function legacyTypeToConstraints(type: string | undefined): FieldConstraints {
  const t = (type ?? '').trim();
  if (!t) return {};
  const enumMatch = t.match(/^enum\s*\(([^)]*)\)$/i);
  if (enumMatch) {
    const enumValues = enumMatch[1].split(/[,|]/).map((v) => v.trim()).filter(Boolean);
    return enumValues.length > 0 ? { format: 'enum', enumValues } : {};
  }
  const lower = t.toLowerCase();
  const withLen = lower.match(/^(string|varchar|nvarchar|char|text)\s*\(\s*(\d+)\s*\)$/);
  if (withLen) {
    const n = Number(withLen[2]);
    const c: FieldConstraints = { format: 'text', maxLength: n };
    if (withLen[1] === 'char') c.minLength = n;
    return c;
  }
  const num = lower.match(/^(numeric|decimal|number)\s*\(\s*(\d+)\s*(?:,\s*(\d+))?\s*\)$/);
  if (num) {
    const scale = num[3] !== undefined ? Number(num[3]) : 0;
    return scale > 0 ? { format: 'decimal', precision: scale } : { format: 'integer' };
  }
  switch (lower) {
    case 'string': case 'varchar': case 'nvarchar': case 'char': case 'text': return { format: 'text' };
    case 'uuid': case 'guid': return { format: 'uuid' };
    case 'email': return { format: 'email' };
    case 'phone': case 'tel': return { format: 'phone' };
    case 'url': case 'uri': return { format: 'url' };
    case 'date': return { format: 'date' };
    case 'time': return { format: 'time' };
    case 'datetime': case 'timestamp': case 'timestamptz': case 'timestamp with time zone': return { format: 'datetime' };
    case 'int': case 'integer': case 'bigint': case 'smallint': case 'long': return { format: 'integer' };
    case 'number': case 'numeric': case 'decimal': case 'float': case 'double': case 'real': case 'money': return { format: 'decimal' };
    case 'bool': case 'boolean': return { format: 'boolean' };
    case 'percentage': case 'percent': return { format: 'percentage' };
    default: return {};
  }
}

/** Explicit constraints win over anything derived from the legacy `type` string. */
export function resolveFieldConstraints(field: DataFieldDefinition): FieldConstraints {
  const merged: Record<string, unknown> = { ...legacyTypeToConstraints(field.type) };
  for (const [k, v] of Object.entries(field.constraints ?? {})) {
    if (v !== undefined && v !== null) merged[k] = v;
  }
  return merged as FieldConstraints;
}

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Clean untrusted constraints (from a model or a client). Anything unusable is dropped and reported. */
export function sanitizeConstraints(c: FieldConstraints | undefined, warn: (message: string) => void, ctx: string): FieldConstraints {
  if (!c) return {};
  const out: FieldConstraints = {};
  if (c.format !== undefined) {
    if (FIELD_FORMATS.includes(c.format)) out.format = c.format;
    else warn(`${ctx}: unknown format "${String(c.format)}" dropped.`);
  }
  if (c.sensitivity !== undefined) {
    if (SENSITIVITIES.includes(c.sensitivity)) out.sensitivity = c.sensitivity;
    else warn(`${ctx}: unknown sensitivity "${String(c.sensitivity)}" dropped.`);
  }
  if (isFiniteNum(c.minLength) && c.minLength >= 0 && c.minLength <= 100_000) out.minLength = Math.floor(c.minLength);
  if (isFiniteNum(c.maxLength) && c.maxLength >= 1 && c.maxLength <= 100_000) out.maxLength = Math.floor(c.maxLength);
  if (out.minLength !== undefined && out.maxLength !== undefined && out.minLength > out.maxLength) {
    warn(`${ctx}: minLength ${out.minLength} exceeds maxLength ${out.maxLength}; both dropped.`);
    delete out.minLength;
    delete out.maxLength;
  }
  if (isFiniteNum(c.min)) out.min = c.min;
  if (isFiniteNum(c.max)) out.max = c.max;
  if (out.min !== undefined && out.max !== undefined && out.min > out.max) {
    warn(`${ctx}: min ${out.min} exceeds max ${out.max}; both dropped.`);
    delete out.min;
    delete out.max;
  }
  if (isFiniteNum(c.step) && c.step > 0) out.step = c.step;
  if (isFiniteNum(c.precision) && c.precision >= 0 && c.precision <= 10) out.precision = Math.floor(c.precision);
  if (c.pattern !== undefined) {
    if (isSafePattern(c.pattern)) out.pattern = c.pattern;
    else warn(`${ctx}: pattern rejected as invalid, too long or unsafe (possible catastrophic backtracking).`);
  }
  if (Array.isArray(c.enumValues)) {
    const values = [...new Set(c.enumValues.map((v) => String(v).trim()).filter(Boolean))].slice(0, 200);
    if (values.length > 0) out.enumValues = values;
  }
  if (out.format === 'enum' && !out.enumValues) {
    warn(`${ctx}: enum format without values dropped.`);
    delete out.format;
  }
  if (typeof c.unique === 'boolean') out.unique = c.unique;
  if (typeof c.immutable === 'boolean') out.immutable = c.immutable;
  return out;
}

export function sanitizeLifecycle(lc: EntityLifecycle | undefined, warn: (message: string) => void, ctx: string): EntityLifecycle | undefined {
  if (!lc) return undefined;
  const states = [...new Set((lc.states ?? []).map((s) => String(s).trim()).filter(Boolean))].slice(0, 50);
  if (states.length < 2) {
    warn(`${ctx}: lifecycle needs at least two states; dropped.`);
    return undefined;
  }
  let initial = String(lc.initial ?? '').trim();
  if (!states.includes(initial)) {
    warn(`${ctx}: initial state "${initial}" is not a known state; using "${states[0]}".`);
    initial = states[0];
  }
  const transitions = (lc.transitions ?? []).filter((t) => states.includes(t.from) && states.includes(t.to));
  return { statusField: String(lc.statusField || 'status').trim() || 'status', states, initial, transitions };
}

// ─── System fields ──────────────────────────────────────────────────────────

interface SystemSpec {
  aliases: string[];
  build: () => DataFieldDefinition;
}

/** Fields every persisted record needs whatever the domain. Names are neutral. */
const SYSTEM_SPECS: SystemSpec[] = [
  {
    aliases: ['id', 'uuid', 'recordid'],
    build: () => ({ name: 'id', type: 'uuid', required: true, notes: 'System-generated unique identifier (immutable).', constraints: { format: 'uuid', unique: true, immutable: true } }),
  },
  {
    aliases: ['createdat', 'createddate', 'createdon', 'creationtimestamp', 'createdtimestamp'],
    build: () => ({ name: 'createdAt', type: 'datetime', required: true, notes: 'Creation timestamp (system-set).', constraints: { format: 'datetime', immutable: true } }),
  },
  {
    aliases: ['createdby', 'createdbyuserid', 'createdbyid', 'createdbyuser', 'creator'],
    build: () => ({ name: 'createdBy', type: 'string', required: true, notes: 'Identifier of the creating user (system-set).', constraints: { format: 'text', maxLength: 100, immutable: true } }),
  },
  {
    aliases: ['updatedat', 'modifiedat', 'lastmodified', 'updateddate', 'updatedon', 'lastupdated', 'modifieddate'],
    build: () => ({ name: 'updatedAt', type: 'datetime', required: true, notes: 'Last modification timestamp (system-set).', constraints: { format: 'datetime' } }),
  },
  {
    aliases: ['updatedby', 'updatedbyuserid', 'updatedbyid', 'modifiedby', 'lastmodifiedby'],
    build: () => ({ name: 'updatedBy', type: 'string', required: true, notes: 'Identifier of the last modifying user (system-set).', constraints: { format: 'text', maxLength: 100 } }),
  },
  {
    aliases: ['rowversion', 'lockversion', 'recordversion'],
    build: () => ({ name: 'rowVersion', type: 'integer', required: true, notes: 'Optimistic-locking counter, incremented on every update (system-set).', constraints: { format: 'integer', min: 1, step: 1 } }),
  },
];

/** True when the entity already has a business key that plays the identifier role. */
function hasNaturalKey(entity: DataEntityDefinition): boolean {
  return entity.fields.some((f) => {
    const c = resolveFieldConstraints(f);
    return (f.required && c.unique) || /\b(primary key|natural key|unique\b.{0,40}\b(identifier|identification|id|key|number|code))\b/i.test(f.notes ?? '');
  });
}

/**
 * Return the entity with the system fields guaranteed present and marked
 * `source: 'system'`. Existing fields that match an alias keep their own name
 * but take the system constraints, so a model cannot weaken them.
 */
export function withSystemFields(entity: DataEntityDefinition): DataEntityDefinition {
  const fields = entity.fields.map((f) => ({ ...f }));
  const findIdx = (aliases: string[]) => fields.findIndex((f) => aliases.includes(norm(f.name)));
  const naturalKey = hasNaturalKey(entity);

  SYSTEM_SPECS.forEach((spec, i) => {
    const isId = i === 0;
    const idx = findIdx(spec.aliases);
    if (idx === -1 && isId && naturalKey) return; // a business key already identifies the record
    const sys = spec.build();
    if (idx === -1) {
      fields.push({ ...sys, origin: 'SYSTEM', source: 'system' });
    } else {
      fields[idx] = { ...fields[idx], type: sys.type, required: true, constraints: sys.constraints, origin: 'SYSTEM', source: 'system' };
    }
  });

  const lc = entity.lifecycle;
  if (lc) {
    const idx = fields.findIndex((f) => norm(f.name) === norm(lc.statusField));
    const statusConstraints: FieldConstraints = { format: 'enum', enumValues: lc.states };
    if (idx === -1) {
      fields.push({ name: lc.statusField, type: 'enum', required: true, notes: 'Lifecycle state (system-managed; changed only through valid transitions).', constraints: statusConstraints, origin: 'SYSTEM', source: 'system' });
    } else {
      fields[idx] = { ...fields[idx], required: true, constraints: statusConstraints, origin: fields[idx].origin ?? 'INFERRED', source: 'system' };
    }
  }
  return { ...entity, fields };
}

// ─── Value validation ───────────────────────────────────────────────────────

const FORMAT_PATTERNS: Partial<Record<FieldFormat, { re: RegExp; label: string }>> = {
  email: { re: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, label: 'a valid email address' },
  phone: { re: /^\+[1-9]\d{7,14}$/, label: 'a phone number in international format (for example +14155550100)' },
  url: { re: /^https?:\/\/[^\s/$.?#][^\s]*$/i, label: 'a valid http(s) URL' },
  uuid: { re: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, label: 'a valid UUID' },
  time: { re: /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, label: 'a time such as 14:30' },
  identifier: { re: /^[A-Za-z0-9][A-Za-z0-9._-]*$/, label: 'letters, digits, dot, underscore or hyphen, starting with a letter or digit' },
  'currency-code': { re: /^[A-Z]{3}$/, label: 'a three-letter uppercase currency code' },
  'country-code': { re: /^[A-Z]{2}$/, label: 'a two-letter uppercase country code' },
  'postal-code': { re: /^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$/, label: 'a valid postal code' },
};

const NUMERIC_FORMATS: FieldFormat[] = ['integer', 'decimal', 'percentage'];

function isRealDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function asNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value === 'string' && /^[+-]?\d+(\.\d+)?$/.test(value.trim())) return Number(value);
  return NaN;
}

function decimalPlaces(value: unknown): number {
  const s = typeof value === 'number' ? String(value) : String(value).trim();
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

export const isEmpty = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

interface ValueProblem { code: string; message: string }

/** Check one non-empty value against its constraints. Returns the first problem or null. */
export function checkValue(name: string, value: unknown, c: FieldConstraints): ValueProblem | null {
  const fmt = c.format;

  if (typeof value === 'string' && value.length > MAX_VALUE_LENGTH) {
    return { code: 'too_long', message: `${name} is too long.` };
  }

  if (fmt === 'boolean') {
    return typeof value === 'boolean' || value === 'true' || value === 'false'
      ? null
      : { code: 'type', message: `${name} must be true or false.` };
  }

  if (fmt && NUMERIC_FORMATS.includes(fmt)) {
    const n = asNumber(value);
    if (Number.isNaN(n)) return { code: 'type', message: `${name} must be a number.` };
    if (fmt === 'integer' && !Number.isInteger(n)) return { code: 'type', message: `${name} must be a whole number.` };
    const min = c.min ?? (fmt === 'percentage' ? 0 : undefined);
    const max = c.max ?? (fmt === 'percentage' ? 100 : undefined);
    if (min !== undefined && n < min) return { code: 'min', message: `${name} must be at least ${min}.` };
    if (max !== undefined && n > max) return { code: 'max', message: `${name} must be at most ${max}.` };
    if (c.precision !== undefined && fmt !== 'integer' && decimalPlaces(value) > c.precision) {
      return { code: 'precision', message: `${name} allows at most ${c.precision} decimal place(s).` };
    }
    if (c.step !== undefined) {
      const steps = (n - (c.min ?? 0)) / c.step;
      if (Math.abs(steps - Math.round(steps)) > 1e-9) return { code: 'step', message: `${name} must be in steps of ${c.step}.` };
    }
    return null;
  }

  if (typeof value !== 'string') {
    // Unconstrained fields (for example structured JSON) accept any value.
    return fmt ? { code: 'type', message: `${name} must be text.` } : null;
  }

  if (fmt === 'enum') {
    if (!c.enumValues || !c.enumValues.includes(value)) {
      return { code: 'enum', message: `${name} must be one of: ${(c.enumValues ?? []).join(', ')}.` };
    }
    return null;
  }

  if (fmt === 'date') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m || !isRealDate(Number(m[1]), Number(m[2]), Number(m[3]))) return { code: 'format', message: `${name} must be a real date (YYYY-MM-DD).` };
  } else if (fmt === 'datetime') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/);
    if (!m || !isRealDate(Number(m[1]), Number(m[2]), Number(m[3])) || Number.isNaN(Date.parse(value))) {
      return { code: 'format', message: `${name} must be a real date and time (ISO 8601).` };
    }
  } else if (fmt && FORMAT_PATTERNS[fmt]) {
    const f = FORMAT_PATTERNS[fmt]!;
    if (!f.re.test(value)) return { code: 'format', message: `${name} must be ${f.label}.` };
  }

  if (c.minLength !== undefined && value.length < c.minLength) {
    return { code: 'minLength', message: `${name} must be at least ${c.minLength} character(s).` };
  }
  if (c.maxLength !== undefined && value.length > c.maxLength) {
    return { code: 'maxLength', message: `${name} must be at most ${c.maxLength} character(s).` };
  }
  if (c.pattern) {
    const re = safeRegex(c.pattern);
    if (re && value.length <= MAX_PATTERN_INPUT && !re.test(value)) {
      return { code: 'pattern', message: `${name} does not match the required format.` };
    }
  }
  return null;
}

// ─── Rules ──────────────────────────────────────────────────────────────────

function conditionHolds(when: NonNullable<EntityRule['when']>, get: (field: string) => unknown): boolean {
  const v = get(when.field);
  const present = !isEmpty(v);
  const list = () => String(when.value ?? '').split(',').map((s) => s.trim());
  const cmp = (op: RuleOp): boolean => {
    const a = asNumber(v);
    const b = asNumber(when.value);
    if (Number.isNaN(a) || Number.isNaN(b)) return false;
    return op === 'gt' ? a > b : op === 'gte' ? a >= b : op === 'lt' ? a < b : a <= b;
  };
  switch (when.op) {
    case 'present': return present;
    case 'absent': return !present;
    case 'eq': return present && String(v) === String(when.value);
    case 'neq': return present && String(v) !== String(when.value);
    case 'in': return present && list().includes(String(v));
    case 'notIn': return present && !list().includes(String(v));
    case 'gt': case 'gte': case 'lt': case 'lte': return present && cmp(when.op);
    default: return false;
  }
}

/** Build a case- and punctuation-insensitive lookup so a rule can say "created_at" for a field named "createdAt". */
function fieldLookup(entity: DataEntityDefinition, record: Record<string, unknown>) {
  const byNorm = new Map(entity.fields.map((f) => [norm(f.name), f.name]));
  const actual = (name: string | undefined) => (name ? byNorm.get(norm(name)) : undefined);
  const get = (name: string) => {
    const a = actual(name);
    return a ? record[a] : undefined;
  };
  return { actual, get };
}

/** Which fields the conditional rules currently make required or forbidden for this record. Used by forms to show and hide fields. */
export function evaluateRules(entity: DataEntityDefinition, record: Record<string, unknown>): { required: Set<string>; forbidden: Set<string> } {
  const required = new Set<string>();
  const forbidden = new Set<string>();
  const { actual, get } = fieldLookup(entity, record);
  for (const rule of entity.rules ?? []) {
    if (rule.kind !== 'conditional' || !rule.when || !rule.effect) continue;
    const target = actual(rule.target);
    if (!target || !actual(rule.when.field)) continue;
    if (conditionHolds(rule.when, get)) (rule.effect === 'required' ? required : forbidden).add(target);
  }
  return { required, forbidden };
}

function compareValues(left: unknown, right: unknown, op: NonNullable<EntityRule['op']>): boolean | null {
  let a: number, b: number;
  const ln = asNumber(left), rn = asNumber(right);
  if (!Number.isNaN(ln) && !Number.isNaN(rn)) {
    a = ln; b = rn;
  } else if (typeof left === 'string' && typeof right === 'string' && !Number.isNaN(Date.parse(left)) && !Number.isNaN(Date.parse(right))) {
    a = Date.parse(left); b = Date.parse(right);
  } else {
    return null; // not comparable: skip rather than guess
  }
  switch (op) {
    case 'lt': return a < b;
    case 'lte': return a <= b;
    case 'gt': return a > b;
    case 'gte': return a >= b;
    case 'eq': return a === b;
    case 'neq': return a !== b;
  }
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

export function allowedTransitions(lc: EntityLifecycle, from: string): string[] {
  return lc.transitions.filter((t) => t.from === from).map((t) => t.to);
}

export function canTransition(lc: EntityLifecycle, from: string, to: string): boolean {
  return lc.transitions.some((t) => t.from === from && t.to === to);
}

// ─── Record validation ──────────────────────────────────────────────────────

/**
 * Validate a record against an entity definition.
 *
 * - create: every required field must be present.
 * - update: partial records are allowed; only fields that are present are checked.
 * - System fields may not be supplied by a client (the server sets them). The one
 *   exception is the lifecycle status field on update, which may change through a
 *   valid transition.
 * - Uniqueness, references and capacity need storage and are not checked here.
 */
export function validateRecord(
  entityIn: DataEntityDefinition,
  record: Record<string, unknown>,
  mode: RecordMode = 'create',
  opts: { existing?: Record<string, unknown> } = {}
): ValidationIssue[] {
  const entity = withSystemFields(entityIn);
  const issues: ValidationIssue[] = [];
  const existing = opts.existing;
  const lc = entity.lifecycle;
  const statusName = lc ? entity.fields.find((f) => norm(f.name) === norm(lc.statusField))?.name : undefined;
  const known = new Set(entity.fields.map((f) => f.name));
  const { required: ruleRequired, forbidden: ruleForbidden } = evaluateRules(entity, record);

  for (const key of Object.keys(record)) {
    if (!known.has(key)) issues.push({ path: key, code: 'unknown_field', message: `${key} is not a field of ${entity.name}.` });
  }

  for (const field of entity.fields) {
    const c = resolveFieldConstraints(field);
    const value = record[field.name];
    const empty = isEmpty(value);
    const isStatus = field.name === statusName;

    if (field.source === 'system') {
      if (empty) continue;
      if (isStatus && lc) {
        if (mode === 'create') {
          if (value !== lc.initial) issues.push({ path: field.name, code: 'invalid_initial_state', message: `${field.name} must start as "${lc.initial}".` });
        } else if (existing && existing[field.name] !== value) {
          const from = String(existing[field.name] ?? '');
          if (!canTransition(lc, from, String(value))) {
            issues.push({ path: field.name, code: 'invalid_transition', message: `Cannot move ${field.name} from "${from}" to "${String(value)}".` });
          }
        }
        continue;
      }
      if (!(existing && existing[field.name] === value)) {
        issues.push({ path: field.name, code: 'system_field', message: `${field.name} is set by the system and cannot be supplied.` });
      }
      continue;
    }

    if (ruleForbidden.has(field.name)) {
      if (!empty) issues.push({ path: field.name, code: 'forbidden', message: `${field.name} must not be provided in this case.` });
      continue;
    }

    if (empty) {
      const mustHave = (mode === 'create' && field.required) || ruleRequired.has(field.name);
      if (mustHave) issues.push({ path: field.name, code: 'required', message: `${field.name} is required.` });
      continue;
    }

    if (mode === 'update' && c.immutable && existing && existing[field.name] !== undefined && existing[field.name] !== value) {
      issues.push({ path: field.name, code: 'immutable', message: `${field.name} cannot be changed once set.` });
      continue;
    }

    const problem = checkValue(field.name, value, c);
    if (problem) issues.push({ path: field.name, ...problem });
  }

  const { actual, get } = fieldLookup(entity, record);
  for (const rule of entity.rules ?? []) {
    if (rule.kind === 'compare' && rule.left && rule.right && rule.op) {
      const l = actual(rule.left), r = actual(rule.right);
      if (!l || !r) continue;
      const lv = get(l), rv = get(r);
      if (isEmpty(lv) || isEmpty(rv)) continue;
      if (compareValues(lv, rv, rule.op) === false) issues.push({ path: l, code: 'compare', message: rule.message });
    } else if (rule.kind === 'requiredTogether' && rule.fields) {
      const names = rule.fields.map(actual).filter((n): n is string => !!n);
      const present = names.filter((n) => !isEmpty(record[n]));
      if (present.length > 0 && present.length < names.length) {
        for (const n of names.filter((x) => isEmpty(record[x]))) issues.push({ path: n, code: 'required_together', message: rule.message });
      }
    } else if (rule.kind === 'mutuallyExclusive' && rule.fields) {
      const present = rule.fields.map(actual).filter((n): n is string => !!n && !isEmpty(record[n]));
      if (present.length > 1) issues.push({ path: present[1], code: 'mutually_exclusive', message: rule.message });
    }
  }

  return issues;
}

// ─── Presentation helpers ───────────────────────────────────────────────────

/** Short human-readable chips describing a field's constraints (for the BU review screen). */
export function constraintSummary(field: DataFieldDefinition): string[] {
  const c = resolveFieldConstraints(field);
  const chips: string[] = [];
  if (c.format && c.format !== 'text') chips.push(c.format);
  if (c.enumValues) chips.push(`one of ${c.enumValues.length}`);
  if (c.minLength !== undefined || c.maxLength !== undefined) chips.push(`length ${c.minLength ?? 0}-${c.maxLength ?? '∞'}`);
  if (c.min !== undefined || c.max !== undefined) chips.push(`range ${c.min ?? '-∞'} to ${c.max ?? '∞'}`);
  if (c.step !== undefined) chips.push(`step ${c.step}`);
  if (c.precision !== undefined) chips.push(`${c.precision} dp`);
  if (c.pattern) chips.push('pattern');
  if (c.unique) chips.push('unique');
  if (c.immutable) chips.push('immutable');
  if (c.sensitivity && c.sensitivity !== 'none') chips.push(c.sensitivity);
  return chips;
}

// ─── SQL ────────────────────────────────────────────────────────────────────

const sqlIdent = (s: string) => {
  const id = s.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return /^[0-9]/.test(id) || id === '' ? `_${id}` : id;
};
const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;

function sqlColumnType(c: FieldConstraints): string {
  switch (c.format) {
    case 'uuid': return 'UUID';
    case 'integer': return 'BIGINT';
    case 'decimal': return c.precision !== undefined ? `NUMERIC(18,${c.precision})` : 'NUMERIC';
    case 'percentage': return 'NUMERIC(5,2)';
    case 'boolean': return 'BOOLEAN';
    case 'date': return 'DATE';
    case 'datetime': return 'TIMESTAMPTZ';
    case 'time': return 'TIME';
    default: return c.maxLength !== undefined ? `VARCHAR(${c.maxLength})` : c.format === 'free-text' ? 'TEXT' : 'VARCHAR(255)';
  }
}

/** Render an entity as a PostgreSQL table with the inferred constraints as NOT NULL, CHECK and UNIQUE. */
export function entityToSQL(entityIn: DataEntityDefinition): string {
  const entity = withSystemFields(entityIn);
  const table = sqlIdent(entity.name);
  const col = (name: string) => sqlIdent(name);
  const lines: string[] = [];
  const checks: string[] = [];
  const comments: string[] = [];

  for (const f of entity.fields) {
    const c = resolveFieldConstraints(f);
    const name = col(f.name);
    const isKey = norm(f.name) === 'id' && f.source === 'system';
    let line = `  ${name} ${sqlColumnType(c)}`;
    if (isKey) line += ' PRIMARY KEY';
    else {
      if (f.required) line += ' NOT NULL';
      if (c.unique) line += ' UNIQUE';
    }
    lines.push(line);

    if (c.minLength !== undefined && c.format !== 'uuid') checks.push(`CHECK (${name} IS NULL OR char_length(${name}) >= ${c.minLength})`);
    if (c.enumValues) checks.push(`CHECK (${name} IS NULL OR ${name} IN (${c.enumValues.map(sqlStr).join(', ')}))`);
    if (c.format && NUMERIC_FORMATS.includes(c.format)) {
      const min = c.min ?? (c.format === 'percentage' ? 0 : undefined);
      const max = c.max ?? (c.format === 'percentage' ? 100 : undefined);
      if (min !== undefined) checks.push(`CHECK (${name} IS NULL OR ${name} >= ${min})`);
      if (max !== undefined) checks.push(`CHECK (${name} IS NULL OR ${name} <= ${max})`);
    }
    if (c.pattern && isSafePattern(c.pattern)) checks.push(`CHECK (${name} IS NULL OR ${name} ~ ${sqlStr(c.pattern)})`);
  }

  const cols = new Map(entity.fields.map((f) => [norm(f.name), col(f.name)]));
  const sqlCond = (w: NonNullable<EntityRule['when']>): string | null => {
    const cname = cols.get(norm(w.field));
    if (!cname) return null;
    const list = () => String(w.value ?? '').split(',').map((s) => sqlStr(s.trim())).join(', ');
    switch (w.op) {
      case 'present': return `${cname} IS NOT NULL`;
      case 'absent': return `${cname} IS NULL`;
      case 'eq': return `${cname} = ${sqlStr(String(w.value ?? ''))}`;
      case 'neq': return `${cname} <> ${sqlStr(String(w.value ?? ''))}`;
      case 'in': return `${cname} IN (${list()})`;
      case 'notIn': return `${cname} NOT IN (${list()})`;
      default: return null;
    }
  };
  const SQL_OPS = { lt: '<', lte: '<=', gt: '>', gte: '>=', eq: '=', neq: '<>' } as const;

  for (const rule of entity.rules ?? []) {
    let clause: string | null = null;
    if (rule.kind === 'conditional' && rule.when && rule.effect) {
      const cond = sqlCond(rule.when);
      const target = cols.get(norm(rule.target ?? ''));
      if (cond && target) clause = `CHECK (NOT (${cond}) OR ${target} IS ${rule.effect === 'required' ? 'NOT NULL' : 'NULL'})`;
    } else if (rule.kind === 'compare' && rule.left && rule.right && rule.op) {
      const l = cols.get(norm(rule.left)), r = cols.get(norm(rule.right));
      if (l && r) clause = `CHECK (${l} IS NULL OR ${r} IS NULL OR ${l} ${SQL_OPS[rule.op]} ${r})`;
    } else if ((rule.kind === 'requiredTogether' || rule.kind === 'mutuallyExclusive') && rule.fields) {
      const names = rule.fields.map((n) => cols.get(norm(n))).filter((n): n is string => !!n);
      if (names.length === rule.fields.length && names.length >= 2) {
        clause = rule.kind === 'requiredTogether'
          ? `CHECK (num_nonnulls(${names.join(', ')}) IN (0, ${names.length}))`
          : `CHECK (num_nonnulls(${names.join(', ')}) <= 1)`;
      }
    }
    if (clause) checks.push(clause);
    else comments.push(`  -- Rule not expressible as a CHECK (enforce in the service layer): ${rule.message}`);
  }

  for (const text of entity.crossRecordRules ?? []) comments.push(`  -- Service-layer rule (needs storage): ${text}`);

  const body = [...lines, ...checks.map((k) => `  ${k}`)].join(',\n');
  return `CREATE TABLE ${table} (\n${body}\n);${comments.length ? `\n${comments.join('\n')}` : ''}`;
}
