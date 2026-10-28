import React, { useEffect, useMemo, useState } from 'react';
import { documentSample, varySample } from '../services/documentSamples';
import { ArrowLeft, Check, ChevronRight, FilePlus2, Link2, Lock, Plus, Search, Trash2 } from 'lucide-react';
import type { DocumentAction, DocumentField, ScreenUISpec, TransactionDocument } from '../types';
import { actionsFor, completedStates, documentTotals, humanizeDocumentStates, formatMoney, hasAmounts, initialState, lineAmount, missingRequired, parseNumber } from '../services/documentMath';
import { StatusOrText } from './UIBlocks';

/**
 * A 'transaction' screen: the list of one kind of business document with a New button, and the document itself:
 * header sections, line items with calculated totals, the status stepper, workflow actions, the chain of related
 * documents and its history. Everything works in the browser (nothing is stored): creating, editing, adding lines,
 * moving the document through its statuses and converting it into the next document.
 */

interface DocRecord {
  number: string;
  status: string;
  values: Record<string, string>;
  lines: string[][];
  history: Array<{ when: string; who: string; what: string }>;
  created: string[];
  /** The cells of the sample row this record came from; shown for columns that match no header field. */
  cells?: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const now = () => new Date().toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const today = () => new Date().toISOString().slice(0, 10);

function fieldsOf(doc: TransactionDocument): DocumentField[] {
  return doc.sections.flatMap((s) => s.fields);
}

/** Records from the sample list: table columns are matched to header fields by label; status is the status column. */
function recordsFromTable(ui: ScreenUISpec, doc: TransactionDocument): DocRecord[] {
  const cols = ui.table.columns;
  const statusIdx = (() => {
    const i = cols.findIndex((c) => /status|state|stage/i.test(c));
    return i >= 0 ? i : cols.length - 1;
  })();
  const fields = fieldsOf(doc);
  return ui.table.rows.map((row, ri) => {
    const values: Record<string, string> = {};
    for (const f of fields) {
      const ci = cols.findIndex((c) => norm(c) === norm(f.label));
      values[f.label] = ci >= 0 ? row[ci] ?? '' : f.sample ? varySample(f.sample, ri) : documentSample(f.kind, f.label, f.options, ri);
    }
    const status = doc.states.find((s) => norm(s) === norm(row[statusIdx] ?? '')) ?? row[statusIdx] ?? initialState(doc);
    return {
      number: row[0] || `${doc.numberPrefix}${1001 + ri}`,
      status,
      values,
      lines: (doc.lines?.rows ?? []).map((r) => [...r]),
      history: [{ when: 'Earlier', who: 'System', what: `${doc.name} ${row[0] ?? ''} recorded as ${status}` }],
      created: [],
      cells: row.map((c) => String(c ?? '')),
    };
  });
}

function nextNumber(doc: TransactionDocument, records: DocRecord[]): string {
  const max = records.reduce((m, r) => Math.max(m, parseNumber(r.number.replace(doc.numberPrefix, '')) || 0), 1000);
  return `${doc.numberPrefix}${max + 1}`;
}

/** A row for the list from a record: same columns as the sample list. */
function rowFor(ui: ScreenUISpec, doc: TransactionDocument, rec: DocRecord): string[] {
  const total = hasAmounts(doc) ? formatMoney(documentTotals(doc, rec.lines).total, doc.totals?.currency) : '';
  return ui.table.columns.map((c, ci) => {
    if (ci === 0) return rec.number;
    if (/status|state|stage/i.test(c) || ci === ui.table.columns.length - 1 && !ui.table.columns.some((x) => /status|state|stage/i.test(x))) return rec.status;
    const f = fieldsOf(doc).find((x) => norm(x.label) === norm(c));
    if (f && rec.values[f.label]) return rec.values[f.label];
    if (rec.cells?.[ci]) return rec.cells[ci];
    if (f) return '';
    if (/total|amount|value/i.test(c) && total) return total;
    return '';
  });
}

const inputCls =
  'w-full rounded-lg border px-3 py-2 text-xs text-slate-800 bg-white focus:outline-hidden focus:border-[var(--brand)] disabled:bg-slate-50 disabled:text-slate-500';

const FieldInput: React.FC<{
  field: DocumentField;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  invalid: boolean;
  listId: string;
}> = ({ field, value, onChange, disabled, invalid, listId }) => {
  const cls = `${inputCls} ${invalid ? 'border-rose-400 bg-rose-50/40' : 'border-slate-200'}`;
  const off = disabled || field.readOnly;
  switch (field.kind) {
    case 'long-text':
      return <textarea rows={3} value={value} disabled={off} onChange={(e) => onChange(e.target.value)} className={cls} />;
    case 'select': {
      const opts = field.options ?? [];
      return (
        <select value={value} disabled={off} onChange={(e) => onChange(e.target.value)} className={cls}>
          <option value="">Select…</option>
          {[...(value && !opts.includes(value) ? [value] : []), ...opts].map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    }
    case 'lookup':
      return (
        <>
          <input list={listId} value={value} disabled={off} onChange={(e) => onChange(e.target.value)} placeholder="Search or choose…" className={cls} />
          <datalist id={listId}>{(field.options ?? []).map((o) => <option key={o} value={o} />)}</datalist>
        </>
      );
    case 'checkbox':
      return (
        <label className="inline-flex items-center gap-2 text-xs text-slate-700 py-2">
          <input type="checkbox" checked={/^(yes|true|1)$/i.test(value)} disabled={off} onChange={(e) => onChange(e.target.checked ? 'Yes' : 'No')} />
          {/^(yes|true|1)$/i.test(value) ? 'Yes' : 'No'}
        </label>
      );
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(value) || !value ? (
        <input type="date" value={value} disabled={off} onChange={(e) => onChange(e.target.value)} className={cls} />
      ) : (
        <input value={value} disabled={off} onChange={(e) => onChange(e.target.value)} className={cls} />
      );
    case 'email':
      return <input type="email" value={value} disabled={off} onChange={(e) => onChange(e.target.value)} className={cls} />;
    case 'phone':
      return <input type="tel" value={value} disabled={off} onChange={(e) => onChange(e.target.value)} className={cls} />;
    case 'number':
    case 'money':
    case 'percent':
      return <input inputMode="decimal" value={value} disabled={off} onChange={(e) => onChange(e.target.value)} className={`${cls} text-right`} />;
    default:
      return <input value={value} disabled={off} onChange={(e) => onChange(e.target.value)} className={cls} />;
  }
};

export const TransactionScreen: React.FC<{ ui: ScreenUISpec & { document: TransactionDocument }; readOnly: boolean; userName?: string }> = ({
  ui,
  readOnly,
  userName = 'You',
}) => {
  const doc = useMemo(() => humanizeDocumentStates(ui.document), [ui.document]);
  const [records, setRecords] = useState<DocRecord[]>(() => recordsFromTable(ui, doc));
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<DocRecord | null>(null);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [reasonFor, setReasonFor] = useState<DocumentAction | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const statusesInUse = useMemo(() => doc.states.filter((s) => records.some((r) => r.status === s)), [doc.states, records]);
  const listed = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => filter === 'All' || r.status === filter)
      .filter(({ r }) => !q || rowFor(ui, doc, r).some((c) => c.toLowerCase().includes(q)));
  }, [records, filter, search, ui, doc]);

  const openRecord = (i: number) => {
    setOpenIdx(i);
    setDraft(JSON.parse(JSON.stringify(records[i])));
    setShowErrors(false);
  };
  const newRecord = () => {
    const values: Record<string, string> = {};
    for (const f of fieldsOf(doc)) values[f.label] = f.readOnly && f.kind === 'date' ? today() : f.kind === 'checkbox' ? 'No' : '';
    setOpenIdx(-1);
    setDraft({
      number: nextNumber(doc, records),
      status: initialState(doc),
      values,
      lines: doc.lines ? [doc.lines.columns.map(() => '')] : [],
      history: [{ when: now(), who: userName, what: `Started a new ${doc.name}` }],
      created: [],
    });
    setShowErrors(false);
  };
  const close = () => {
    setOpenIdx(null);
    setDraft(null);
    setReasonFor(null);
  };

  /** Keep the draft: update its row in the list, or add it as a new document. */
  const commit = (rec: DocRecord, message: string) => {
    setRecords((prev) => (openIdx !== null && openIdx >= 0 ? prev.map((r, i) => (i === openIdx ? rec : r)) : [rec, ...prev]));
    if (openIdx === -1) setOpenIdx(0);
    setDraft(rec);
    setToast(`${message} (simulated: nothing is saved)`);
  };

  if (draft) {
    const missing = missingRequired(doc, draft.values);
    const totals = documentTotals(doc, draft.lines);
    const money = hasAmounts(doc);
    const stateIdx = doc.states.findIndex((s) => s === draft.status);
    const passed = completedStates(doc, draft.status);
    const available = actionsFor(doc, draft.status);
    const editable = !readOnly && stateIdx <= 0;
    const lines = doc.lines;
    const amountIdx = lines?.amountColumn ? lines.columns.findIndex((c) => c.label === lines.amountColumn) : -1;

    const setValue = (label: string, v: string) => setDraft({ ...draft, values: { ...draft.values, [label]: v } });
    const setCell = (ri: number, ci: number, v: string) =>
      setDraft({ ...draft, lines: draft.lines.map((r, i) => (i === ri ? r.map((c, j) => (j === ci ? v : c)) : r)) });

    const run = (a: DocumentAction, why?: string) => {
      // Leaving the first status (sending the document on) needs every required field.
      if (stateIdx <= 0 && missing.length) {
        setShowErrors(true);
        setToast(`Fill in ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''} first`);
        return;
      }
      const created = a.creates ? `${a.creates} ${a.creates.slice(0, 2).toUpperCase()}-${1000 + Math.floor((Date.now() / 1000) % 9000)}` : '';
      const rec: DocRecord = {
        ...draft,
        status: a.to,
        created: created ? [...draft.created, created] : draft.created,
        history: [{ when: now(), who: userName, what: `${a.label}${why ? `: ${why}` : ''}${created ? ` (created ${created})` : ''}` }, ...draft.history],
      };
      setReasonFor(null);
      setReason('');
      commit(rec, created ? `${a.label}: ${created} created from ${doc.name} ${draft.number}` : `${doc.name} ${draft.number}: ${a.label}`);
    };

    return (
      <div className="space-y-4">
        {toast && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">{toast}</div>}

        <div className="rounded-xl border border-slate-200 bg-white shadow-2xs">
          <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-slate-100">
            <button onClick={close} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer">
              <ArrowLeft className="w-3.5 h-3.5" /> All {doc.name} documents
            </button>
            <div className="flex-1 min-w-0 flex items-center gap-3">
              <h2 className="text-base font-bold text-slate-900 truncate">
                {doc.name} {draft.number}
              </h2>
              <StatusOrText value={draft.status} chip />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {editable && (
                <button
                  onClick={() => commit({ ...draft, history: [{ when: now(), who: userName, what: 'Saved as draft' }, ...draft.history] }, `${doc.name} ${draft.number} saved`)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Save
                </button>
              )}
              {available.map((a, i) => (
                <button
                  key={a.label}
                  disabled={readOnly}
                  title={a.role ? `Done by ${a.role}` : undefined}
                  onClick={() => (a.needsReason ? setReasonFor(a) : run(a))}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                    i === 0 && !a.needsReason ? 'bg-[var(--brand)] text-white hover:brightness-110' : a.needsReason ? 'border border-rose-200 text-rose-700 hover:bg-rose-50' : 'border border-[var(--brand)] text-[var(--brand)] hover:bg-slate-50'
                  }`}
                >
                  {readOnly && <Lock className="w-3 h-3" />}
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {reasonFor && (
            <div className="px-5 py-3 border-b border-slate-100 bg-rose-50/40 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-700">Reason for “{reasonFor.label}”:</span>
              <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputCls} border-slate-200 flex-1 min-w-[200px]`} />
              <button
                disabled={!reason.trim()}
                onClick={() => run(reasonFor, reason.trim())}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 text-white disabled:opacity-40 cursor-pointer"
              >
                Confirm
              </button>
              <button onClick={() => setReasonFor(null)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 cursor-pointer">
                Cancel
              </button>
            </div>
          )}

          {/* Status stepper */}
          <ol className="flex flex-wrap items-center gap-2 px-5 py-3">
            {doc.states.map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                <span
                  className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center ${
                    passed.has(s) ? 'bg-emerald-500 text-white' : i === stateIdx ? 'bg-[var(--brand)] text-white' : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {passed.has(s) ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </span>
                <span className={`text-xs font-semibold ${i === stateIdx ? 'text-slate-900' : 'text-slate-500'}`}>{s}</span>
                {i < doc.states.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
              </li>
            ))}
          </ol>

          {(doc.related?.from || doc.related?.next?.length || draft.created.length > 0) && (
            <div className="px-5 pb-3 flex flex-wrap items-center gap-2 text-[11px]">
              <Link2 className="w-3.5 h-3.5 text-slate-400" />
              {doc.related?.from && (
                <>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{doc.related.from}</span>
                  <ChevronRight className="w-3 h-3 text-slate-300" />
                </>
              )}
              <span className="px-2 py-0.5 rounded-full bg-[var(--brand)] text-white font-semibold">{doc.name} {draft.number}</span>
              {draft.created.map((c) => (
                <React.Fragment key={c}>
                  <ChevronRight className="w-3 h-3 text-slate-300" />
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">{c}</span>
                </React.Fragment>
              ))}
              {(doc.related?.next ?? []).filter((n) => !draft.created.some((c) => c.startsWith(n))).map((n) => (
                <React.Fragment key={n}>
                  <ChevronRight className="w-3 h-3 text-slate-300" />
                  <span className="px-2 py-0.5 rounded-full border border-dashed border-slate-300 text-slate-500">{n} (next)</span>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2 space-y-4">
            {doc.sections.map((sec) => (
              <div key={sec.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
                <h3 className="text-sm font-bold text-slate-900">{sec.title}</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {sec.fields.map((f) => {
                    const invalid = showErrors && missing.includes(f.label);
                    return (
                      <label key={f.label} className={`space-y-1 text-xs ${f.kind === 'long-text' ? 'sm:col-span-2' : ''}`}>
                        <span className="font-semibold text-slate-700">
                          {f.label}
                          {f.required && !f.readOnly && <span className="text-rose-500"> *</span>}
                        </span>
                        <FieldInput
                          field={f}
                          value={draft.values[f.label] ?? ''}
                          onChange={(v) => setValue(f.label, v)}
                          disabled={!editable}
                          invalid={invalid}
                          listId={`dl-${norm(doc.name)}-${norm(f.label)}`}
                        />
                        {invalid && <span className="text-[11px] text-rose-600">Required</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}

            {lines && (
              <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900">{lines.title}</h3>
                  <span className="text-[11px] text-slate-500">{draft.lines.length} line(s)</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left w-8">#</th>
                        {lines.columns.map((c) => (
                          <th key={c.label} className={`px-3 py-2 ${c.kind === 'text' || c.kind === 'select' ? 'text-left' : 'text-right'}`}>{c.label}</th>
                        ))}
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {draft.lines.map((row, ri) => (
                        <tr key={ri}>
                          <td className="px-3 py-1.5 text-slate-400">{ri + 1}</td>
                          {lines.columns.map((c, ci) => {
                            if (ci === amountIdx && lines.priceColumn) {
                              return <td key={c.label} className="px-3 py-1.5 text-right font-semibold text-slate-800">{formatMoney(lineAmount(doc, row), doc.totals?.currency)}</td>;
                            }
                            const numeric = c.kind !== 'text' && c.kind !== 'select';
                            return (
                              <td key={c.label} className="px-1.5 py-1">
                                {c.kind === 'select' && c.options?.length ? (
                                  <select value={row[ci] ?? ''} disabled={!editable} onChange={(e) => setCell(ri, ci, e.target.value)} className={`${inputCls} border-slate-200 py-1.5`}>
                                    <option value="">Select…</option>
                                    {[...(row[ci] && !c.options.includes(row[ci]) ? [row[ci]] : []), ...c.options].map((o) => <option key={o} value={o}>{o}</option>)}
                                  </select>
                                ) : (
                                  <input
                                    value={row[ci] ?? ''}
                                    disabled={!editable}
                                    inputMode={numeric ? 'decimal' : undefined}
                                    onChange={(e) => setCell(ri, ci, e.target.value)}
                                    className={`${inputCls} border-slate-200 py-1.5 ${numeric ? 'text-right' : ''}`}
                                  />
                                )}
                              </td>
                            );
                          })}
                          <td className="px-1.5">
                            {editable && (
                              <button
                                onClick={() => setDraft({ ...draft, lines: draft.lines.filter((_, i) => i !== ri) })}
                                className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                title="Remove line"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-3 border-t border-slate-100">
                  {editable ? (
                    <button
                      onClick={() => setDraft({ ...draft, lines: [...draft.lines, lines.columns.map(() => '')] })}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--brand)] cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add line
                    </button>
                  ) : (
                    <span />
                  )}
                  {money && (
                    <dl className="text-xs min-w-[220px] space-y-1">
                      <div className="flex justify-between gap-6"><dt className="text-slate-500">Subtotal</dt><dd className="font-semibold">{formatMoney(totals.subtotal, doc.totals?.currency)}</dd></div>
                      {!!doc.totals?.discountPercent && (
                        <div className="flex justify-between gap-6"><dt className="text-slate-500">Discount ({doc.totals.discountPercent}%)</dt><dd className="font-semibold">−{formatMoney(totals.discount, doc.totals.currency)}</dd></div>
                      )}
                      {!!doc.totals?.taxPercent && (
                        <div className="flex justify-between gap-6"><dt className="text-slate-500">{doc.totals.taxLabel ?? 'Tax'} ({doc.totals.taxPercent}%)</dt><dd className="font-semibold">{formatMoney(totals.tax, doc.totals.currency)}</dd></div>
                      )}
                      <div className="flex justify-between gap-6 pt-1 border-t border-slate-200 text-sm"><dt className="font-bold text-slate-900">Total</dt><dd className="font-bold text-slate-900">{formatMoney(totals.total, doc.totals?.currency)}</dd></div>
                    </dl>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-2 text-xs">
              <h3 className="text-sm font-bold text-slate-900">Summary</h3>
              <div className="flex justify-between"><span className="text-slate-500">Number</span><span className="font-semibold">{draft.number}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Status</span><StatusOrText value={draft.status} chip /></div>
              {money && <div className="flex justify-between"><span className="text-slate-500">Total</span><span className="font-bold">{formatMoney(totals.total, doc.totals?.currency)}</span></div>}
              {available.length > 0 && (
                <div className="pt-2 border-t border-slate-100 text-slate-500">
                  Next: {available.map((a) => `${a.label}${a.role ? ` (${a.role})` : ''}`).join(' · ')}
                </div>
              )}
              {!editable && !readOnly && <div className="pt-2 text-[11px] text-slate-500">This {doc.name} is past its first status, so its fields are locked.</div>}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-3">History</h3>
              <ol className="space-y-3">
                {draft.history.map((h, i) => (
                  <li key={i} className="text-xs">
                    <div className="font-semibold text-slate-800">{h.what}</div>
                    <div className="text-[11px] text-slate-500">{h.when} · {h.who}</div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List of documents
  return (
    <div className="space-y-4">
      {toast && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">{toast}</div>}
      <div className="flex flex-wrap items-center gap-2">
        {['All', ...statusesInUse].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer ${filter === f ? 'bg-[var(--brand)] text-white border-transparent' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            {f}
          </button>
        ))}
        <div className="flex-1" />
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${doc.name} documents`} className={`${inputCls} border-slate-200 pl-8 w-56`} />
        </div>
        <button
          onClick={newRecord}
          disabled={readOnly}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-[var(--brand)] text-white hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {readOnly ? <Lock className="w-3.5 h-3.5" /> : <FilePlus2 className="w-3.5 h-3.5" />} New {doc.name}
        </button>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">{ui.table.title}</h3>
          <span className="text-[11px] text-slate-500">{listed.length} document(s) · click one to open it</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>{ui.table.columns.map((c) => <th key={c} className="px-4 py-2 text-left whitespace-nowrap">{c}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {listed.map(({ r, i }) => {
                const row = rowFor(ui, doc, r);
                return (
                  <tr key={`${r.number}-${i}`} onClick={() => openRecord(i)} className="hover:bg-slate-50 cursor-pointer">
                    {row.map((c, ci) => (
                      <td key={ci} className={`px-4 py-2.5 whitespace-nowrap ${ci === 0 ? 'font-bold text-[var(--brand)]' : 'text-slate-700'}`}>
                        {ci === row.length - 1 ? <StatusOrText value={c} chip /> : c || '—'}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {listed.length === 0 && (
                <tr><td colSpan={ui.table.columns.length} className="px-4 py-8 text-center text-slate-500">No {doc.name} documents match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
