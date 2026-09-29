import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2, Lock, Sparkles } from 'lucide-react';
import { DataEntityDefinition, DataFieldDefinition, FieldConstraints } from '../types';
import {
  evaluateRules,
  resolveFieldConstraints,
  validateRecord,
  withSystemFields,
} from '../services/validationEngine';

/**
 * A form generated from any entity definition. Inputs, limits, required
 * markers, conditional fields and error messages all come from the entity's
 * constraints through the shared validation engine, the same code the server
 * runs in POST /api/validate-record. There is no domain logic in this file.
 */

interface EntityFormProps {
  entity: DataEntityDefinition;
  /** Read-only roles can look but not submit. */
  readOnly: boolean;
  /** Optional step titles (for example the blueprint's panel titles). */
  stepTitles?: string[];
  submitLabel?: string;
}

type FormValue = string | boolean;

const FIELDS_PER_STEP = 5;
const MAX_FIELDS = 40;

/** "startAt", "start_at" and "Start At" all become "Start at". */
function humanize(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

type InputKind = 'checkbox' | 'select' | 'textarea' | 'text' | 'email' | 'tel' | 'url' | 'date' | 'datetime-local' | 'time' | 'number' | 'password';

function inputKind(field: DataFieldDefinition, c: FieldConstraints): InputKind {
  if (c.sensitivity === 'credential') return 'password';
  switch (c.format) {
    case 'boolean': return 'checkbox';
    case 'enum': return 'select';
    case 'free-text': return 'textarea';
    case 'email': return 'email';
    case 'phone': return 'tel';
    case 'url': return 'url';
    case 'date': return 'date';
    case 'datetime': return 'datetime-local';
    case 'time': return 'time';
    case 'integer': case 'decimal': case 'percentage': return 'number';
    default: return (c.maxLength ?? 0) > 200 ? 'textarea' : 'text';
  }
}

function numberStep(c: FieldConstraints): number | 'any' {
  if (c.step !== undefined) return c.step;
  if (c.format === 'integer') return 1;
  if (c.precision !== undefined) return Number((10 ** -c.precision).toFixed(c.precision));
  return 'any';
}

export const EntityForm: React.FC<EntityFormProps> = ({ entity, readOnly, stepTitles, submitLabel }) => {
  const resolved = useMemo(() => withSystemFields(entity), [entity]);
  const userFields = useMemo(
    () => resolved.fields.filter((f) => f.source !== 'system').slice(0, MAX_FIELDS),
    [resolved]
  );

  const [values, setValues] = useState<Record<string, FormValue>>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [attempted, setAttempted] = useState(false);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  // State updates lag behind rapid clicks, so the real guard against double submit is a ref.
  const inFlight = useRef(false);
  const [serverResult, setServerResult] = useState<{ ok: boolean; issues: Array<{ path: string; message: string }> } | null>(null);

  // Empty strings are "not provided"; booleans count only once the user has touched them.
  const draft = useMemo(() => {
    const r: Record<string, unknown> = {};
    for (const f of userFields) {
      const v = values[f.name];
      if (v === undefined || v === '') continue;
      if (typeof v === 'boolean' && !touched.has(f.name)) continue;
      r[f.name] = v;
    }
    return r;
  }, [values, touched, userFields]);

  const { required: ruleRequired, forbidden } = useMemo(() => evaluateRules(resolved, draft), [resolved, draft]);

  // Fields that become forbidden are hidden, cleared and never sent.
  useEffect(() => {
    if (forbidden.size === 0) return;
    setValues((prev) => {
      const next = { ...prev };
      let changed = false;
      forbidden.forEach((name) => {
        if (name in next) { delete next[name]; changed = true; }
      });
      return changed ? next : prev;
    });
  }, [forbidden]);

  const record = useMemo(() => {
    const r = { ...draft };
    forbidden.forEach((name) => delete r[name]);
    return r;
  }, [draft, forbidden]);

  const issues = useMemo(() => validateRecord(entity, record, 'create'), [entity, record]);
  const issueFor = (name: string) => issues.find((i) => i.path === name);

  // Fields are assigned to steps once, from the full list, so hiding a field never moves another
  // field to a different step. A step whose fields are all hidden is skipped.
  const chunks = useMemo(() => {
    if (userFields.length <= FIELDS_PER_STEP + 1) return [userFields];
    const out: DataFieldDefinition[][] = [];
    for (let i = 0; i < userFields.length; i += FIELDS_PER_STEP) out.push(userFields.slice(i, i + FIELDS_PER_STEP));
    return out;
  }, [userFields]);
  const steps = useMemo(
    () => chunks.map((fields, chunkIdx) => ({ chunkIdx, fields: fields.filter((f) => !forbidden.has(f.name)) })).filter((s) => s.fields.length > 0),
    [chunks, forbidden]
  );
  const stepCount = Math.max(steps.length, 1);
  const safeStep = Math.min(step, stepCount - 1);
  const stepFields = steps[safeStep]?.fields ?? [];
  const titleFor = (i: number) => {
    const chunkIdx = steps[i]?.chunkIdx ?? i;
    return (stepTitles && stepTitles.length === chunks.length && stepTitles[chunkIdx]) || `Step ${i + 1}`;
  };
  const stepHasIssue = stepFields.some((f) => issueFor(f.name));
  const isLast = safeStep >= stepCount - 1;

  const setValue = (name: string, value: FormValue) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setServerResult(null);
  };
  const touch = (name: string) => setTouched((prev) => (prev.has(name) ? prev : new Set(prev).add(name)));

  const submit = async () => {
    if (inFlight.current) return; // no double submit
    setAttempted(true);
    if (issues.length > 0 || readOnly) return;
    inFlight.current = true;
    setSubmitting(true);
    setServerResult(null);
    try {
      const res = await fetch('/api/validate-record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, record, mode: 'create' }),
      });
      const body = await res.json().catch(() => ({}));
      setServerResult({
        ok: res.ok && body.valid === true,
        issues: Array.isArray(body.issues)
          ? body.issues.map((i: { path?: string; message?: string }) => ({ path: i.path ?? '', message: i.message ?? 'Invalid' }))
          : body.error ? [{ path: '', message: String(body.error) }] : [],
      });
    } catch {
      setServerResult({ ok: false, issues: [{ path: '', message: 'The validation service could not be reached.' }] });
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const showError = (name: string) => (touched.has(name) || attempted) && issueFor(name);

  const renderField = (field: DataFieldDefinition) => {
    const c = resolveFieldConstraints(field);
    const kind = inputKind(field, c);
    const err = showError(field.name);
    const id = `ef-${entity.name}-${field.name}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const required = field.required || ruleRequired.has(field.name);
    const value = values[field.name];
    const common = {
      id,
      disabled: readOnly,
      'aria-invalid': err ? true : undefined,
      'aria-describedby': err ? `${id}-err` : undefined,
      'aria-required': required || undefined,
      onBlur: () => touch(field.name),
    };
    const border = `w-full rounded-lg border px-3 py-2 text-xs text-slate-800 focus:outline-hidden disabled:bg-slate-50 ${
      err ? 'border-rose-400 focus:border-rose-500' : 'border-slate-200 focus:border-indigo-400'
    }`;

    let control: React.ReactNode;
    if (kind === 'checkbox') {
      control = (
        <label className="inline-flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            {...common}
            checked={value === true}
            onChange={(e) => { touch(field.name); setValue(field.name, e.target.checked); }}
            className="w-4 h-4 rounded border-slate-300"
          />
          <span>Yes</span>
        </label>
      );
    } else if (kind === 'select') {
      control = (
        <select {...common} value={typeof value === 'string' ? value : ''} onChange={(e) => setValue(field.name, e.target.value)} className={border}>
          <option value="">Select…</option>
          {(c.enumValues ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    } else if (kind === 'textarea') {
      control = (
        <textarea
          {...common}
          rows={3}
          maxLength={c.maxLength}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => setValue(field.name, e.target.value)}
          className={border}
        />
      );
    } else {
      control = (
        <input
          {...common}
          type={kind}
          maxLength={kind === 'number' ? undefined : c.maxLength}
          min={kind === 'number' ? c.min ?? (c.format === 'percentage' ? 0 : undefined) : undefined}
          max={kind === 'number' ? c.max ?? (c.format === 'percentage' ? 100 : undefined) : undefined}
          step={kind === 'number' ? numberStep(c) : undefined}
          inputMode={kind === 'number' ? 'decimal' : kind === 'tel' ? 'tel' : undefined}
          autoComplete={kind === 'email' ? 'email' : kind === 'tel' ? 'tel' : kind === 'url' ? 'url' : kind === 'password' ? 'new-password' : 'off'}
          placeholder={c.format === 'phone' ? '+14155550100' : undefined}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => setValue(field.name, e.target.value)}
          className={border}
        />
      );
    }

    const len = typeof value === 'string' ? value.length : 0;
    return (
      <div key={field.name} className={`space-y-1 ${kind === 'textarea' ? 'sm:col-span-2' : ''}`}>
        <label htmlFor={id} className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <span>{humanize(field.name)}</span>
          {required && <span className="text-rose-500" aria-hidden="true">*</span>}
          {field.origin === 'INFERRED' && (
            <span title="Predicted from industry patterns; needs BU confirmation" className="inline-flex items-center gap-0.5 rounded-full bg-violet-50 border border-violet-200 px-1.5 text-[9px] font-bold text-violet-700">
              <Sparkles className="w-2.5 h-2.5" />inferred
            </span>
          )}
        </label>
        {control}
        <div className="flex items-start justify-between gap-2 min-h-[14px]">
          {err ? (
            <p id={`${id}-err`} role="alert" className="text-[11px] text-rose-600">{err.message}</p>
          ) : (
            <p className="text-[11px] text-slate-400 truncate">{field.notes ?? ''}</p>
          )}
          {c.maxLength !== undefined && (kind === 'textarea' || kind === 'text') && (
            <span className="text-[10px] text-slate-400 tabular-nums shrink-0">{len}/{c.maxLength}</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {stepCount > 1 && (
        <ol className="flex flex-wrap items-center gap-2">
          {Array.from({ length: stepCount }, (_, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center ${
                i < safeStep ? 'bg-emerald-500 text-white' : i === safeStep ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'
              }`}>
                {i < safeStep ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </span>
              <span className={`text-xs font-semibold ${i === safeStep ? 'text-slate-900' : 'text-slate-500'}`}>{titleFor(i)}</span>
              {i < stepCount - 1 && <span className="w-6 h-px bg-slate-300" />}
            </li>
          ))}
        </ol>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); if (isLast) void submit(); else if (!stepHasIssue) setStep(safeStep + 1); else { setAttempted(true); } }}
        noValidate
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">{stepCount > 1 ? titleFor(safeStep) : `New ${humanize(entity.name)}`}</h3>
          <span className="text-[11px] text-slate-400"><span className="text-rose-500">*</span> required</span>
        </div>

        {attempted && issues.length > 0 && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{issues.length} issue(s) to fix before this can be submitted.</span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">{stepFields.map(renderField)}</div>

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => setStep(Math.max(0, safeStep - 1))}
            disabled={safeStep === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-700 disabled:opacity-40 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
          {isLast ? (
            <button
              type="submit"
              disabled={readOnly || submitting || issues.length > 0}
              title={readOnly ? 'Your selected role has read-only access' : issues.length > 0 ? `${issues.length} issue(s) to fix first` : undefined}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed cursor-pointer"
            >
              {readOnly && <Lock className="w-3 h-3" />}
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {submitLabel ?? 'Submit'}
            </button>
          ) : (
            <button
              type="submit"
              disabled={stepHasIssue}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed cursor-pointer"
            >
              Next <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </form>

      {serverResult && (
        serverResult.ok ? (
          <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span><span className="font-bold">Passed client and server validation.</span> Both use the same rules. Nothing is saved in this prototype.</span>
          </div>
        ) : (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-800 space-y-1">
            <div className="font-bold">The server rejected this record:</div>
            <ul className="list-disc pl-4">
              {serverResult.issues.map((i, n) => <li key={n}>{i.path ? `${humanize(i.path)}: ` : ''}{i.message}</li>)}
            </ul>
          </div>
        )
      )}
    </div>
  );
};

