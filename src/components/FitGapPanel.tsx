import React, { useEffect, useRef, useState } from 'react';
import { Boxes, Check, Copy, Sparkles } from 'lucide-react';
import type { DeliveryMode, FitCategory, ProductDefinition } from '../types';
import { currentFitGap, devObjects, FIT_LABEL, FIT_ORDER, fitGapCounts, fitGapSignature, isPackage } from '../services/fitGap';
import { fitGapText } from '../services/brdDoc';
import { copyToClipboard } from '../services/clipboardUtils';
import { DeliveryPicker } from './DeliveryPicker';

const FIT_STYLE: Record<FitCategory, string> = {
  standard: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  configure: 'bg-sky-50 text-sky-800 border-sky-200',
  develop: 'bg-amber-50 text-amber-800 border-amber-200',
  'process-change': 'bg-violet-50 text-violet-800 border-violet-200',
  'third-party': 'bg-slate-100 text-slate-700 border-slate-300',
};

interface Props {
  definition: ProductDefinition;
  onChangeDelivery?: (d: DeliveryMode) => void;
  onGenerateFitGap?: () => void;
  isGenerating?: boolean;
  aiBusy?: boolean;
}

/** Fit-gap of a package implementation: how the chosen platform meets each requirement of the BRD. */
export const FitGapPanel: React.FC<Props> = ({ definition, onChangeDelivery, onGenerateFitGap, isGenerating, aiBusy }) => {
  const pkg = isPackage(definition);
  const [draft, setDraft] = useState<DeliveryMode>(definition.delivery ?? { kind: 'custom' });
  const [filter, setFilter] = useState<FitCategory | 'all'>('all');
  const [copied, setCopied] = useState(false);
  useEffect(() => { setDraft(definition.delivery ?? { kind: 'custom' }); }, [definition.delivery?.kind, definition.delivery?.platform]);

  // Opening the tab asks the AI once per BRD and platform (free with no AI configured: the server answers by rules).
  const tried = useRef('');
  useEffect(() => {
    if (!pkg || !onGenerateFitGap || aiBusy) return;
    const sig = fitGapSignature(definition);
    if (definition.fitGap?.basedOn === sig || tried.current === sig) return;
    tried.current = sig;
    onGenerateFitGap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkg, definition, aiBusy]);

  if (!pkg) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 max-w-3xl">
        <div className="flex items-center gap-2"><Boxes className="w-5 h-5 text-indigo-600" /><h3 className="text-lg font-bold text-slate-900">Fit-gap (package implementation)</h3></div>
        <p className="text-sm text-slate-600">This initiative is set up as a <b>new application</b>. If the business has chosen a package platform instead, switch the delivery type: the factory then assesses every requirement against that platform (standard, configuration, development, process change), lists the development objects and migration objects, and sizes the proposal on configuration, development and migration instead of a custom build.</p>
        {onChangeDelivery && (
          <>
            <DeliveryPicker value={draft} onChange={setDraft} />
            <button
              type="button"
              disabled={draft.kind !== 'package' || !draft.platform?.trim()}
              onClick={() => onChangeDelivery({ kind: 'package', platform: draft.platform?.trim() })}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 text-white text-xs font-bold cursor-pointer disabled:cursor-not-allowed"
            >Set as package implementation</button>
          </>
        )}
      </div>
    );
  }

  const fg = currentFitGap(definition);
  const counts = fitGapCounts(fg);
  const rows = filter === 'all' ? fg.rows : fg.rows.filter((r) => r.fit === filter);
  const groups = devObjects(fg);
  const copy = async () => {
    if (await copyToClipboard(fitGapText(definition, fg))) { setCopied(true); setTimeout(() => setCopied(false), 2500); }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Package implementation</p>
            <h3 className="text-xl font-bold text-slate-900">Fit-gap: {fg.platform}</h3>
            <p className="text-xs text-slate-500 mt-1">
              {fg.origin === 'AI' ? `Written by the AI from this BRD, using its knowledge of ${fg.platform}. Fits marked "to be confirmed" need a platform consultant.` : `Derived from the shape of the BRD by rules, not from ${fg.platform} itself. A platform consultant must confirm every fit.`}
              {fg.addedForCoverage?.length ? ` The server added rows the AI left out: ${fg.addedForCoverage.join(', ')}.` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer">
              {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}{copied ? 'Copied' : 'Copy fit-gap'}
            </button>
            {onGenerateFitGap && (
              <button type="button" onClick={onGenerateFitGap} disabled={isGenerating || aiBusy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-300 text-white text-xs font-semibold cursor-pointer">
                <Sparkles className="w-4 h-4" />{isGenerating ? 'Assessing…' : fg.origin === 'AI' ? 'Reassess with AI' : 'Assess with AI'}
              </button>
            )}
          </div>
        </div>
        <p className="text-sm text-slate-700">{fg.summary}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setFilter('all')} className={`px-3 py-1.5 rounded-full border text-xs font-semibold cursor-pointer ${filter === 'all' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-300'}`}>All ({fg.rows.length})</button>
          {FIT_ORDER.filter((k) => counts[k]).map((k) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-full border text-xs font-semibold cursor-pointer ${filter === k ? 'ring-2 ring-indigo-500/40' : ''} ${FIT_STYLE[k]}`}>{FIT_LABEL[k]} ({counts[k]})</button>
          ))}
        </div>
        {onChangeDelivery && (
          <details className="text-xs text-slate-600">
            <summary className="cursor-pointer font-semibold">Change platform or delivery type</summary>
            <div className="mt-2 space-y-2 max-w-xl">
              <DeliveryPicker value={draft} onChange={setDraft} compact />
              <button type="button" disabled={draft.kind === 'package' && !draft.platform?.trim()} onClick={() => onChangeDelivery(draft.kind === 'package' ? { kind: 'package', platform: draft.platform?.trim() } : { kind: 'custom' })} className="px-3 py-1.5 rounded-lg bg-slate-800 text-white font-semibold disabled:bg-slate-300 cursor-pointer">Apply</button>
            </div>
          </details>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Area</th><th className="px-3 py-2">Requirement</th><th className="px-3 py-2">Fit</th><th className="px-3 py-2">How {fg.platform} meets it</th><th className="px-3 py-2">Gap and how it is closed</th><th className="px-3 py-2">Complexity</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">{r.id}</td>
                <td className="px-3 py-2 text-slate-700">{r.area}</td>
                <td className="px-3 py-2 text-slate-900">{r.requirement}{r.traces.length ? <span className="block text-[10px] text-slate-400 mt-0.5">Covers: {r.traces.join(', ')}</span> : null}</td>
                <td className="px-3 py-2"><span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${FIT_STYLE[r.fit]}`}>{FIT_LABEL[r.fit]}{r.objectType ? `: ${r.objectType}` : ''}</span></td>
                <td className="px-3 py-2 text-slate-700">{r.platformFeature}</td>
                <td className="px-3 py-2 text-slate-600">{r.gap || '—'}</td>
                <td className="px-3 py-2 text-slate-700">{r.complexity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h4 className="text-sm font-bold text-slate-900 mb-2">Development objects</h4>
          {groups.length ? groups.map((g) => (
            <div key={g.type} className="mb-3">
              <p className="text-xs font-semibold text-slate-700">{g.type} ({g.rows.length})</p>
              <ul className="list-disc pl-5 text-xs text-slate-600">{g.rows.map((r) => <li key={r.id}>{r.id} {r.requirement} <span className="text-slate-400">({r.complexity})</span></li>)}</ul>
            </div>
          )) : <p className="text-xs text-slate-500">No development: everything is met by standard, configuration or process change.</p>}
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h4 className="text-sm font-bold text-slate-900 mb-2">Data migration ({fg.migration.length})</h4>
          <ul className="space-y-1 text-xs text-slate-600">{fg.migration.map((m) => <li key={m.name}><b className="text-slate-800">{m.name}</b> from {m.source} <span className="text-slate-400">({m.complexity})</span>{m.notes ? `: ${m.notes}` : ''}</li>)}</ul>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h4 className="text-sm font-bold text-slate-900 mb-2">Organisational structure to define</h4>
          <ul className="list-disc pl-5 text-xs text-slate-600 space-y-1">{fg.orgStructure.map((o, i) => <li key={i}>{o}</li>)}</ul>
          <h4 className="text-sm font-bold text-slate-900 mt-4 mb-2">Roles and access</h4>
          <ul className="space-y-1 text-xs text-slate-600">{fg.authorisations.map((a) => <li key={a.role}><b className="text-slate-800">{a.role}</b>: {a.access}</li>)}</ul>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h4 className="text-sm font-bold text-slate-900 mb-2">To confirm with a {fg.platform} consultant or the BU</h4>
          <ul className="list-disc pl-5 text-xs text-slate-600 space-y-1">{fg.openPoints.map((o, i) => <li key={i}>{o}</li>)}</ul>
        </div>
      </div>
    </div>
  );
};
