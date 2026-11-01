import React, { useMemo, useRef, useState } from 'react';
import { Briefcase, CheckCircle2, Download, FileText, Plus, Sparkles, Trash2, Upload, AlertTriangle, Copy, RotateCcw } from 'lucide-react';
import type { ProductDefinition, ProposalState, ResourceRole, ScopeBaseline, ScopeKind } from '../types';
import { addScopeItem, currentScope, removeNewItem, scopeCounts, setIncluded, SCOPE_KIND_LABEL, SCOPE_KIND_ORDER } from '../services/scope';
import { buildEstimate, defaultProposalState, formatMoney, ROLES } from '../services/estimate';
import { currentNarrative, documentTitle, proposalHtml, proposalMarkdown, proposalSections } from '../services/proposalDoc';
import type { Block } from '../services/proposalDoc';
import { extractMaterialText } from '../services/materialExtractor';
import { copyToClipboard } from '../services/clipboardUtils';

type Tab = 'scope' | 'estimate' | 'cost' | 'rasic' | 'document';

interface Props {
  definition: ProductDefinition;
  updateDefinition: (fn: (d: ProductDefinition) => ProductDefinition) => void;
  aiBusy: boolean;
  onGenerateProposal: () => void;
  isGeneratingProposal: boolean;
  onReconcile: (text: string, fileName: string) => void;
  isMatchingScope: boolean;
  onToast: (msg: string, ms?: number) => void;
}

const CHANGE_STYLE: Record<string, string> = {
  KEPT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REMOVED: 'bg-rose-50 text-rose-700 border-rose-200',
  NEW: 'bg-indigo-50 text-indigo-700 border-indigo-200',
};
const RASIC_STYLE: Record<string, string> = {
  R: 'bg-indigo-600 text-white', A: 'bg-rose-600 text-white', S: 'bg-sky-100 text-sky-800', C: 'bg-amber-100 text-amber-800', I: 'bg-slate-100 text-slate-600',
};
const d1 = (n: number) => String(Math.round(n * 10) / 10);

function download(name: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const ProposalScreen: React.FC<Props> = ({ definition, updateDefinition, aiBusy, onGenerateProposal, isGeneratingProposal, onReconcile, isMatchingScope, onToast }) => {
  const [tab, setTab] = useState<Tab>('scope');
  const [newKind, setNewKind] = useState<ScopeKind>('screen');
  const [newName, setNewName] = useState('');
  const [newDetail, setNewDetail] = useState('');
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { scope, stale } = currentScope(definition);
  const state: ProposalState = definition.proposal ?? defaultProposalState();
  const counts = useMemo(() => scopeCounts(scope), [scope]);
  const est = useMemo(() => buildEstimate(definition, scope, state), [definition, scope, state]);
  const { narrative, stale: narrativeStale } = useMemo(() => currentNarrative(definition, scope, est, state), [definition, scope, est, state]);
  const sections = useMemo(() => proposalSections(definition, scope, est, state, narrative), [definition, scope, est, state, narrative]);
  const money = (n: number) => formatMoney(n, est.currency);

  const setScope = (next: ScopeBaseline) => updateDefinition((d) => ({ ...d, scopeBaseline: next }));
  const setState = (next: ProposalState) => updateDefinition((d) => ({ ...d, scopeBaseline: d.scopeBaseline ?? scope, proposal: next }));
  const setRate = (r: ResourceRole, v: number) => setState({ ...state, rateCard: { ...state.rateCard, isDefault: false, rates: { ...state.rateCard.rates, [r]: v } } });
  const setCard = (patch: Partial<ProposalState['rateCard']>) => setState({ ...state, rateCard: { ...state.rateCard, isDefault: false, ...patch } });
  const adjust = (id: string, key: 'functionalDays' | 'technicalDays', v: number | undefined) => {
    const adj = { ...(state.adjustments ?? {}) };
    const cur = { ...(adj[id] ?? {}) };
    if (v === undefined) delete cur[key]; else cur[key] = Math.max(0, v);
    if (Object.keys(cur).length) adj[id] = cur; else delete adj[id];
    setState({ ...state, adjustments: adj });
  };

  const handleFile = async (file: File) => {
    setReading(true);
    try {
      const { text, extraction } = await extractMaterialText(file.name, file.type, await file.arrayBuffer());
      if (!text.trim()) { onToast(`That file could not be read. ${extraction.note}`, 8000); return; }
      onReconcile(text, file.name);
    } catch (e) {
      onToast(`That file could not be read (${(e as Error).message}).`, 8000);
    } finally {
      setReading(false);
    }
  };

  const copyDoc = async () => {
    const ok = await copyToClipboard(proposalMarkdown(definition, state, sections));
    onToast(ok ? 'Proposal copied as Markdown.' : 'Copy was blocked by the browser. Use a download instead.');
  };
  const base = (definition.productName || 'proposal').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const tabs: Array<[Tab, string]> = [['scope', '1. Approved scope'], ['estimate', '2. Effort'], ['cost', '3. Cost & team'], ['rasic', '4. RASIC'], ['document', '5. Proposal / SOW']];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-indigo-600"><Briefcase className="w-5 h-5" /><span className="text-xs font-bold uppercase tracking-wide">Part 2: Proposal & SOW</span></div>
          <h2 className="text-xl font-bold text-slate-900 mt-1">{definition.productName}</h2>
          <p className="text-xs text-slate-500 max-w-3xl mt-1">Everything here is built from the scope the BU approved, not the first draft. Confirm what the BU kept, cut or added, then check the effort and rates, then write the document.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="px-3 py-2 rounded-xl border border-slate-200 bg-white"><div className="text-[10px] uppercase text-slate-500 font-semibold">Effort</div><div className="text-sm font-bold text-slate-900">{d1(est.totalDays)} days</div></div>
          <div className="px-3 py-2 rounded-xl border border-slate-200 bg-white"><div className="text-[10px] uppercase text-slate-500 font-semibold">Duration</div><div className="text-sm font-bold text-slate-900">~{est.durationWeeks} weeks</div></div>
          <div className="px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50"><div className="text-[10px] uppercase text-indigo-600 font-semibold">Total</div><div className="text-sm font-bold text-indigo-900">{money(est.total)}</div></div>
        </div>
      </div>

      {counts.kept + counts.added === 0 && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-900">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span><b>Nothing is in scope.</b> Every item is unticked, so the estimate is only the fixed project activities. If you uploaded a final BRD, check that it was read correctly; otherwise tick the items the BU approved.</span>
        </div>
      )}

      {!scope.confirmed && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span><b>The scope is not yet confirmed as BU-approved.</b> The numbers below price {counts.kept + counts.added} items{counts.removed ? ` (${counts.removed} removed)` : ''}. Confirm the scope in step 1 before sending the document; until then it is marked DRAFT.</span>
        </div>
      )}

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px cursor-pointer ${tab === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>
        ))}
      </div>

      {tab === 'scope' && (
        <div className="space-y-4">
          {stale && <div className="px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-900">The BRD changed after this scope was saved, so the list below is rebuilt from the current BRD (all items kept). Re-apply the BU's decisions.</div>}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Enter the BU-approved scope</h3>
                <p className="text-xs text-slate-500 mt-0.5">Upload the BU's final BRD and the tool matches it to the draft, or tick items in and out by hand. A module you cut takes its screens with it.</p>
              </div>
              <div>
                <input ref={fileRef} type="file" accept=".docx,.pdf,.txt,.md,.pptx,.xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleFile(f); }} />
                <button onClick={() => fileRef.current?.click()} disabled={reading || isMatchingScope || aiBusy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-300 text-white text-xs font-semibold cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />{reading || isMatchingScope ? 'Comparing the final BRD…' : 'Upload final BRD'}
                </button>
              </div>
            </div>
            {scope.source === 'upload' && <p className="text-[11px] text-slate-600">Compared with <b>{scope.fileName}</b> by {scope.matchedBy === 'AI' ? 'the AI' : 'name matching (no AI configured)'}. Check every line: a decision is a suggestion until you confirm.</p>}
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
              <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">{counts.kept} kept</span>
              <span className="px-2 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200">{counts.removed} removed</span>
              <span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">{counts.added} added by the BU</span>
            </div>
          </div>

          {SCOPE_KIND_ORDER.map((k) => {
            const rows = scope.items.filter((i) => i.kind === k);
            if (!rows.length) return null;
            const c = counts.byKind[k];
            return (
              <div key={k} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">{SCOPE_KIND_LABEL[k]}</span>
                  <span className="text-[11px] text-slate-500">{c.kept + c.added} of {c.total} in scope{c.removed ? `, ${c.removed} removed` : ''}</span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {rows.map((i) => (
                    <li key={i.id} className={`px-4 py-2 flex items-start gap-3 ${i.included ? '' : 'bg-slate-50'}`}>
                      <input type="checkbox" className="mt-1 cursor-pointer" checked={i.included} onChange={(e) => setScope(setIncluded(scope, i.id, e.target.checked))} aria-label={`${i.name} in scope`} />
                      <div className="min-w-0 flex-1">
                        <div className={`text-xs font-semibold ${i.included ? 'text-slate-900' : 'text-slate-400 line-through'}`}>{i.name}{i.parent ? <span className="ml-2 font-normal text-slate-400 no-underline">in {i.parent}</span> : null}</div>
                        {i.detail && <div className="text-[11px] text-slate-500 truncate">{i.detail}</div>}
                        {i.note && <div className="text-[11px] text-indigo-600">{i.note}</div>}
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${CHANGE_STYLE[i.change]}`}>{i.change === 'KEPT' ? 'Kept' : i.change === 'REMOVED' ? 'Removed' : 'Added'}</span>
                      {i.change === 'NEW' && <button onClick={() => setScope(removeNewItem(scope, i.id))} title="Delete this added item" className="text-slate-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
            <h3 className="text-xs font-bold text-slate-800">Add something the BU asked for that is not in the draft</h3>
            <div className="flex flex-wrap gap-2">
              <select value={newKind} onChange={(e) => setNewKind(e.target.value as ScopeKind)} className="text-xs border border-slate-300 rounded-lg px-2 py-1.5">
                {SCOPE_KIND_ORDER.map((k) => <option key={k} value={k}>{SCOPE_KIND_LABEL[k].replace(/s$/, '')}</option>)}
              </select>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 flex-1 min-w-40" />
              <input value={newDetail} onChange={(e) => setNewDetail(e.target.value)} placeholder="One line on what it does (optional)" className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 flex-[2] min-w-48" />
              <button onClick={() => { if (!newName.trim()) return; setScope(addScopeItem(scope, newKind, newName, newDetail)); setNewName(''); setNewDetail(''); }} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"><Plus className="w-3.5 h-3.5" />Add</button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-800">Confirm</h3>
            <div className="flex flex-wrap gap-2 items-center">
              <input value={scope.approvedBy ?? ''} onChange={(e) => setScope({ ...scope, approvedBy: e.target.value, confirmed: false })} placeholder="Approved by (name, role)" className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 flex-1 min-w-48" />
              <input value={scope.approvedOn ?? ''} onChange={(e) => setScope({ ...scope, approvedOn: e.target.value, confirmed: false })} placeholder="Approved on (date)" className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 w-40" />
              {scope.confirmed ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 className="w-4 h-4" />Confirmed as BU-approved</span>
              ) : (
                <button onClick={() => { setScope({ ...scope, confirmed: true }); onToast('Scope confirmed. The estimate and document now price exactly this scope.'); }} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer">Confirm this is the BU-approved scope</button>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'estimate' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <div className="px-4 py-3 border-b border-slate-200"><p className="text-xs text-slate-600">High-level person-days per activity for the approved scope, split into <b>functional</b> (analysis, design, acceptance) and <b>technical</b> (architecture, build, integration, test automation, deployment). Change a figure if you know better: it is marked adjusted and flows into cost, RASIC and the document.</p></div>
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500"><tr><th className="text-left px-3 py-2">Activity</th><th className="text-left px-3 py-2">Phase</th><th className="px-3 py-2 w-24">Functional days</th><th className="px-3 py-2 w-24">Technical days</th><th className="px-3 py-2 w-16">Total</th><th className="text-left px-3 py-2">How estimated</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {est.activities.map((a) => (
                <tr key={a.id} className={a.adjusted ? 'bg-amber-50/40' : ''}>
                  <td className="px-3 py-2 align-top"><div className="font-semibold text-slate-900">{a.name}</div><div className="text-[11px] text-slate-500 max-w-md">{a.covers}</div></td>
                  <td className="px-3 py-2 align-top text-slate-600">{a.phase}</td>
                  {(['functionalDays', 'technicalDays'] as const).map((key) => (
                    <td key={key} className="px-2 py-2 align-top text-center">
                      <input type="number" min={0} step={0.5} value={a[key]} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) adjust(a.id, key, v); }} className="w-16 text-center border border-slate-300 rounded px-1 py-1" aria-label={`${a.name} ${key === 'functionalDays' ? 'functional' : 'technical'} days`} />
                    </td>
                  ))}
                  <td className="px-3 py-2 align-top text-center font-semibold">{d1(a.functionalDays + a.technicalDays)}{a.adjusted && <button onClick={() => { adjust(a.id, 'functionalDays', undefined); adjust(a.id, 'technicalDays', undefined); }} title="Reset to the estimate" className="ml-1 text-slate-400 hover:text-indigo-600 cursor-pointer align-middle"><RotateCcw className="w-3 h-3 inline" /></button>}</td>
                  <td className="px-3 py-2 align-top text-[11px] text-slate-500 max-w-xs">{a.basis}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 font-bold text-slate-900"><tr><td className="px-3 py-2" colSpan={2}>Total</td><td className="px-3 py-2 text-center">{d1(est.functionalDays)}</td><td className="px-3 py-2 text-center">{d1(est.technicalDays)}</td><td className="px-3 py-2 text-center">{d1(est.totalDays)}</td><td /></tr></tfoot>
          </table>
        </div>
      )}

      {tab === 'cost' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-900">Rate card</h3>{state.rateCard.isDefault && <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">Illustrative defaults: set your own rates</span>}</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="text-[11px] text-slate-500 font-semibold">Currency<input value={state.rateCard.currency} maxLength={3} onChange={(e) => setCard({ currency: e.target.value.toUpperCase() })} className="mt-1 w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 text-slate-900 uppercase" /></label>
              <label className="text-[11px] text-slate-500 font-semibold">Contingency %<input type="number" min={0} max={100} value={state.rateCard.contingencyPct} onChange={(e) => setCard({ contingencyPct: Math.max(0, Number(e.target.value) || 0) })} className="mt-1 w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 text-slate-900" /></label>
              <label className="text-[11px] text-slate-500 font-semibold">Productive share of a day<input type="number" min={0.3} max={1} step={0.05} value={state.rateCard.utilisation} onChange={(e) => setCard({ utilisation: Math.min(1, Math.max(0.3, Number(e.target.value) || 0.85)) })} className="mt-1 w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 text-slate-900" /></label>
              <label className="text-[11px] text-slate-500 font-semibold">Most people per role<input type="number" min={1} max={20} value={state.rateCard.maxPerRole} onChange={(e) => setCard({ maxPerRole: Math.max(1, Math.round(Number(e.target.value) || 1)) })} className="mt-1 w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 text-slate-900" /></label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {ROLES.map((r) => (
                <label key={r} className="text-[11px] text-slate-500 font-semibold">{r} (per day)<input type="number" min={0} value={state.rateCard.rates[r]} onChange={(e) => setRate(r, Math.max(0, Number(e.target.value) || 0))} className="mt-1 w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 text-slate-900" /></label>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500"><tr><th className="text-left px-3 py-2">Role</th><th className="px-3 py-2">Days</th><th className="px-3 py-2">Day rate</th><th className="px-3 py-2">Cost</th><th className="px-3 py-2">Indicative people</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{est.team.map((r) => (<tr key={r.role}><td className="px-3 py-2 font-semibold text-slate-900">{r.role}</td><td className="px-3 py-2 text-center">{d1(r.days)}</td><td className="px-3 py-2 text-center">{r.rate}</td><td className="px-3 py-2 text-center">{money(r.cost)}</td><td className="px-3 py-2 text-center">{d1(r.fte)}</td></tr>))}</tbody>
              <tfoot className="bg-slate-50 font-bold text-slate-900">
                <tr><td className="px-3 py-2">Subtotal</td><td className="px-3 py-2 text-center">{d1(est.totalDays)}</td><td /><td className="px-3 py-2 text-center">{money(est.subtotal)}</td><td /></tr>
                <tr><td className="px-3 py-2" colSpan={3}>Contingency ({state.rateCard.contingencyPct}%)</td><td className="px-3 py-2 text-center">{money(est.contingency)}</td><td /></tr>
                <tr className="text-indigo-900"><td className="px-3 py-2" colSpan={3}>Total estimate (excluding taxes)</td><td className="px-3 py-2 text-center">{money(est.total)}</td><td /></tr>
              </tfoot>
            </table>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
              <table className="w-full text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="text-left px-3 py-2">Phase</th><th className="px-3 py-2">Weeks</th><th className="px-3 py-2">Days</th><th className="px-3 py-2">Cost</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{est.phases.map((p) => (<tr key={p.phase}><td className="px-3 py-2 font-semibold text-slate-900">{p.phase}</td><td className="px-3 py-2 text-center">{p.weeks}</td><td className="px-3 py-2 text-center">{d1(p.days)}</td><td className="px-3 py-2 text-center">{money(p.cost)}</td></tr>))}</tbody></table>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
              <table className="w-full text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="text-left px-3 py-2">Payment milestone</th><th className="px-3 py-2">Week</th><th className="px-3 py-2">Share</th><th className="px-3 py-2">Amount</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{est.milestones.map((m) => (<tr key={m.name}><td className="px-3 py-2 font-semibold text-slate-900">{m.name}</td><td className="px-3 py-2 text-center">{m.weekNumber}</td><td className="px-3 py-2 text-center">{m.percent}%</td><td className="px-3 py-2 text-center">{money(m.amount)}</td></tr>))}</tbody></table>
            </div>
          </div>
        </div>
      )}

      {tab === 'rasic' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap gap-2 items-center text-[11px]">
            <span className="text-slate-600">One <b>A</b> per activity.</span>
            {(['R', 'A', 'S', 'C', 'I'] as const).map((l) => <span key={l} className="inline-flex items-center gap-1"><span className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${RASIC_STYLE[l]}`}>{l}</span>{{ R: 'Responsible', A: 'Accountable', S: 'Supports', C: 'Consulted', I: 'Informed' }[l]}</span>)}
          </div>
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500"><tr><th className="text-left px-3 py-2">Activity</th>{est.rasic.parties.map((p) => <th key={p} className="px-2 py-2 text-[10px] font-semibold w-20">{p}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{est.rasic.rows.map((r) => (<tr key={r.activityId}><td className="px-3 py-2 font-semibold text-slate-900">{r.activity}</td>{r.cells.map((c, i) => <td key={i} className="px-2 py-2 text-center">{c ? <span className={`inline-flex w-6 h-6 rounded text-[11px] font-bold items-center justify-center ${RASIC_STYLE[c]}`}>{c}</span> : null}</td>)}</tr>))}</tbody>
          </table>
        </div>
      )}

      {tab === 'document' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex flex-wrap gap-3 items-end">
              <label className="text-[11px] text-slate-500 font-semibold">Document<select value={state.docKind} onChange={(e) => setState({ ...state, docKind: e.target.value as ProposalState['docKind'] })} className="mt-1 block text-xs border border-slate-300 rounded-lg px-2 py-1.5 text-slate-900"><option>Proposal</option><option>RFP Response</option><option>Statement of Work</option></select></label>
              <label className="text-[11px] text-slate-500 font-semibold flex-1 min-w-40">Client<input value={state.clientName ?? ''} onChange={(e) => setState({ ...state, clientName: e.target.value })} placeholder={definition.businessUnit} className="mt-1 w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 text-slate-900" /></label>
              <label className="text-[11px] text-slate-500 font-semibold flex-1 min-w-40">Vendor (your company)<input value={state.vendorName ?? ''} onChange={(e) => setState({ ...state, vendorName: e.target.value })} placeholder="Your company" className="mt-1 w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 text-slate-900" /></label>
              <button onClick={onGenerateProposal} disabled={aiBusy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-300 text-white text-xs font-semibold cursor-pointer"><Sparkles className="w-3.5 h-3.5" />{isGeneratingProposal ? 'Writing…' : state.narrative ? 'Rewrite with AI' : 'Write with AI'}</button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className={`px-2 py-0.5 rounded-full border font-semibold ${narrative.origin === 'AI' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{narrative.origin === 'AI' ? 'Words written by the AI' : 'Words derived by rules'}</span>
              {narrativeStale && <span className="text-amber-700">The scope changed since the text was written: click Rewrite.</span>}
              <span className="text-slate-500">Numbers always come from the estimate, never from the AI. Standard terms are starting wording: have legal review them.</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => download(`${base}_${state.docKind.replace(/\s+/g, '-')}.doc`, 'application/msword', proposalHtml(definition, state, sections))} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"><Download className="w-3.5 h-3.5" />Download Word</button>
              <button onClick={() => download(`${base}_${state.docKind.replace(/\s+/g, '-')}.md`, 'text/markdown', proposalMarkdown(definition, state, sections))} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"><FileText className="w-3.5 h-3.5" />Download Markdown</button>
              <button onClick={copyDoc} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"><Copy className="w-3.5 h-3.5" />Copy</button>
            </div>
          </div>

          <article className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6">
            <header><h1 className="text-2xl font-bold text-slate-900">{documentTitle(definition, state)}</h1><p className="text-xs text-slate-500 mt-1">Prepared for {state.clientName?.trim() || definition.businessUnit}{state.vendorName?.trim() ? ` by ${state.vendorName.trim()}` : ''}. Version {definition.version}.</p></header>
            {sections.map((sec, i) => (
              <section key={sec.id} className="space-y-2">
                <h2 className="text-base font-bold text-indigo-900">{i + 1}. {sec.title}</h2>
                {sec.blocks.map((b, bi) => <BlockView key={bi} block={b} />)}
              </section>
            ))}
          </article>
        </div>
      )}
    </div>
  );
};

const BlockView: React.FC<{ block: Block }> = ({ block }) => {
  if (block.kind === 'p') return <p className="text-xs text-slate-700 leading-relaxed">{block.text}</p>;
  if (block.kind === 'ul') return <ul className="list-disc pl-5 space-y-1 text-xs text-slate-700">{block.items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] border border-slate-200">
        <thead className="bg-indigo-50 text-slate-700"><tr>{block.head.map((h, i) => <th key={i} className="text-left px-2 py-1.5 border border-slate-200 font-semibold">{h}</th>)}</tr></thead>
        <tbody>{block.rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} className="px-2 py-1.5 border border-slate-200 align-top">{c}</td>)}</tr>)}</tbody>
        {block.foot && <tfoot><tr>{block.foot.map((c, i) => <td key={i} className="px-2 py-1.5 border border-slate-200 font-bold bg-slate-50">{c}</td>)}</tr></tfoot>}
      </table>
      {block.note && <p className="text-[11px] text-slate-500 italic mt-1">{block.note}</p>}
    </div>
  );
};
