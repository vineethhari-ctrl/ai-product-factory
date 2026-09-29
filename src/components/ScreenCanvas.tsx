import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Lock,
  Minus,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { ScreenDefinition, ScreenUISpec } from '../types';

interface ScreenCanvasProps {
  screen: ScreenDefinition & { ui: ScreenUISpec };
  /** True for read-only / auditor roles: actions are shown but locked. */
  readOnly: boolean;
}

const BENCHMARK_TAG = 'Industry benchmark';

/** Colour a cell that looks like a status. Returns null for ordinary text. */
function statusStyle(value: string): string | null {
  if (/^(active|completed|approved|resolved|healthy|online|paid|delivered|confirmed|passed|open)$/i.test(value.trim())) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (/^(pending|scheduled|in progress|in review|review|new|processing|awaiting.*|draft)$/i.test(value.trim())) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  if (/^(overdue|blocked|failed|critical|rejected|offline|breached|escalated|late|expired)$/i.test(value.trim())) {
    return 'bg-rose-50 text-rose-700 border-rose-200';
  }
  return null;
}

const StatusOrText: React.FC<{ value: string }> = ({ value }) => {
  const style = statusStyle(value);
  return style ? (
    <span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] font-semibold ${style}`}>{value}</span>
  ) : (
    <span>{value}</span>
  );
};

const TrendIcon: React.FC<{ trend: 'up' | 'down' | 'flat' }> = ({ trend }) => {
  if (trend === 'up') return <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />;
  if (trend === 'down') return <TrendingDown className="w-3.5 h-3.5 text-rose-600" />;
  return <Minus className="w-3.5 h-3.5 text-slate-400" />;
};

export const ScreenCanvas: React.FC<ScreenCanvasProps> = ({ screen, readOnly }) => {
  const { ui } = screen;
  const [activeFilter, setActiveFilter] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [search, setSearch] = useState('');
  const [wizardStep, setWizardStep] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 3500);
    return () => clearTimeout(t);
  }, [feedback]);

  const isBenchmark =
    screen.confidence === 'INFERRED' || (screen.evidence ?? []).some((e) => e.startsWith(BENCHMARK_TAG));

  const filterLabel = ui.filters[activeFilter] ?? '';
  const rows = useMemo(() => {
    const byFilter =
      !filterLabel || /^all\b/i.test(filterLabel)
        ? ui.table.rows
        : ui.table.rows.filter((r) => r.some((c) => c.toLowerCase().includes(filterLabel.toLowerCase())));
    const q = search.trim().toLowerCase();
    return q ? byFilter.filter((r) => r.some((c) => c.toLowerCase().includes(q))) : byFilter;
  }, [ui.table.rows, filterLabel, search]);

  const selected = rows[Math.min(selectedIdx, Math.max(rows.length - 1, 0))];
  const selectedTitle = selected?.[0] ?? '';
  const statusColIdx = ui.table.columns.findIndex((c) => /status|state|stage/i.test(c));

  const runAction = (action: string) => {
    if (readOnly) return;
    setFeedback(selectedTitle ? `${action}: ${selectedTitle}` : action);
  };

  // ── Shared building blocks ────────────────────────────────────────────────
  const kpiRow = (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {ui.kpis.map((k) => (
        <div key={k.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k.label}</div>
          <div className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">{k.value}</div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
            <TrendIcon trend={k.trend} />
            <span>{k.delta}</span>
          </div>
        </div>
      ))}
    </div>
  );

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {ui.filters.map((f, i) => (
          <button
            key={f}
            onClick={() => {
              setActiveFilter(i);
              setSelectedIdx(0);
            }}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
              i === activeFilter
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-700'
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelectedIdx(0);
          }}
          placeholder={`Search ${ui.table.title.toLowerCase()}...`}
          className="pl-8 pr-3 py-1.5 w-56 max-w-full rounded-lg border border-slate-200 bg-white text-xs focus:outline-hidden focus:border-indigo-400"
        />
      </div>
    </div>
  );

  const actionsBar = ui.primaryActions.length > 0 && (
    <div className="flex flex-wrap items-center gap-2">
      {ui.primaryActions.map((a, i) => (
        <button
          key={a}
          onClick={() => runAction(a)}
          disabled={readOnly}
          title={readOnly ? 'Your selected role has read-only access' : undefined}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            readOnly
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : i === 0
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-xs'
                : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 cursor-pointer'
          }`}
        >
          {readOnly && <Lock className="w-3 h-3" />}
          {a}
        </button>
      ))}
    </div>
  );

  const table = (
    <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">{ui.table.title}</h3>
        <span className="text-[11px] text-slate-500">{rows.length} record(s)</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              {ui.table.columns.map((c) => (
                <th key={c} className="px-4 py-2.5 font-semibold whitespace-nowrap">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr
                key={`${row[0]}-${ri}`}
                onClick={() => setSelectedIdx(ri)}
                className={`border-t border-slate-100 cursor-pointer transition-colors ${
                  ri === selectedIdx ? 'bg-indigo-50/70' : 'hover:bg-slate-50'
                }`}
              >
                {row.map((cell, ci) => (
                  <td key={ci} className={`px-4 py-2.5 whitespace-nowrap ${ci === 0 ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                    <StatusOrText value={cell} />
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={ui.table.columns.length} className="px-4 py-8 text-center text-slate-500">
                  No sample records match this filter in the prototype.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const selectedRecord = selected && (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Selected record</div>
          <div className="text-base font-bold text-slate-900">{selectedTitle}</div>
        </div>
        {statusColIdx >= 0 && <StatusOrText value={selected[statusColIdx] ?? ''} />}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        {ui.table.columns.slice(1).map((c, i) => (
          <div key={c}>
            <dt className="text-slate-500">{c}</dt>
            <dd className="font-semibold text-slate-800"><StatusOrText value={selected[i + 1] ?? ''} /></dd>
          </div>
        ))}
      </dl>
    </div>
  );

  const panels = (cols: string) => (
    <div className={`grid gap-3 ${cols}`}>
      {ui.detailPanels.map((p) => (
        <div key={p.title} className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <h4 className="text-xs font-bold text-slate-900 mb-2.5">{p.title}</h4>
          <dl className="space-y-2 text-xs">
            {p.items.map((it) => (
              <div key={it.label} className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-500">{it.label}</dt>
                <dd className="font-semibold text-slate-800 text-right"><StatusOrText value={it.value} /></dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );

  // ── Layouts ───────────────────────────────────────────────────────────────
  let body: React.ReactNode;
  switch (screen.layoutType) {
    case 'table-detail':
      body = (
        <>
          {toolbar}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">{table}</div>
            <div className="space-y-4">
              {selectedRecord}
              {actionsBar}
              {panels('grid-cols-1')}
            </div>
          </div>
        </>
      );
      break;

    case 'split-view':
      body = (
        <>
          {toolbar}
          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 text-sm font-bold text-slate-900">{ui.table.title}</div>
              <ul className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                {rows.map((row, ri) => (
                  <li key={`${row[0]}-${ri}`}>
                    <button
                      onClick={() => setSelectedIdx(ri)}
                      className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                        ri === selectedIdx ? 'bg-indigo-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">{row[0]}</div>
                        <div className="text-[11px] text-slate-500 truncate">{row[1] ?? ''}</div>
                      </div>
                      {statusColIdx >= 0 && <StatusOrText value={row[statusColIdx] ?? ''} />}
                    </button>
                  </li>
                ))}
                {rows.length === 0 && <li className="px-4 py-8 text-center text-xs text-slate-500">No sample records match.</li>}
              </ul>
            </div>
            <div className="lg:col-span-3 space-y-4">
              {selectedRecord}
              {actionsBar}
              {panels('sm:grid-cols-2')}
            </div>
          </div>
        </>
      );
      break;

    case 'form-wizard': {
      const steps = ui.detailPanels.length > 0 ? ui.detailPanels : [{ title: 'Details', items: [] }];
      const step = steps[Math.min(wizardStep, steps.length - 1)];
      const isLast = wizardStep >= steps.length - 1;
      body = (
        <>
          <ol className="flex flex-wrap items-center gap-2">
            {steps.map((s, i) => (
              <li key={s.title} className="flex items-center gap-2">
                <span
                  className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center ${
                    i < wizardStep ? 'bg-emerald-500 text-white' : i === wizardStep ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {i < wizardStep ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </span>
                <span className={`text-xs font-semibold ${i === wizardStep ? 'text-slate-900' : 'text-slate-500'}`}>{s.title}</span>
                {i < steps.length - 1 && <span className="w-6 h-px bg-slate-300" />}
              </li>
            ))}
          </ol>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900">{step.title}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {step.items.map((it) => (
                <label key={`${step.title}-${it.label}`} className="space-y-1 text-xs">
                  <span className="font-semibold text-slate-700">{it.label}</span>
                  <input
                    defaultValue={it.value}
                    disabled={readOnly}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:outline-hidden focus:border-indigo-400 disabled:bg-slate-50"
                  />
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setWizardStep((s) => Math.max(0, s - 1))}
                disabled={wizardStep === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-700 disabled:opacity-40 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <button
                onClick={() => (isLast ? runAction(ui.primaryActions[0] ?? 'Submit') : setWizardStep((s) => s + 1))}
                disabled={isLast && readOnly}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-slate-100 disabled:text-slate-400 cursor-pointer"
              >
                {isLast ? ui.primaryActions[0] ?? 'Submit' : 'Next'} {!isLast && <ArrowRight className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          {table}
        </>
      );
      break;
    }

    case 'profile-360': {
      const initials = selectedTitle
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
      body = (
        <>
          {toolbar}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs flex flex-wrap items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-lg font-bold">
              {initials || '—'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-lg font-bold text-slate-900 truncate">{selectedTitle || 'No record selected'}</div>
              <div className="text-xs text-slate-500">{selected?.[1] ?? ''}</div>
            </div>
            {statusColIdx >= 0 && selected && <StatusOrText value={selected[statusColIdx] ?? ''} />}
            {actionsBar}
          </div>
          {panels('md:grid-cols-2 xl:grid-cols-3')}
          {table}
        </>
      );
      break;
    }

    case 'dashboard':
    default:
      body = (
        <>
          {toolbar}
          {table}
          {actionsBar}
          {panels('md:grid-cols-2 xl:grid-cols-3')}
        </>
      );
  }

  return (
    <div className="space-y-4">
      {isBenchmark && (
        <div className="flex flex-wrap items-start gap-2.5 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 via-purple-50 to-indigo-50 px-4 py-3">
          <Sparkles className="w-4 h-4 text-violet-600 mt-0.5 shrink-0" />
          <div className="text-xs text-violet-900 flex-1">
            <span className="font-bold">Industry benchmark · inferred.</span>{' '}
            {ui.benchmarkNote ?? 'Predicted from how comparable products are built; needs BU validation.'}
          </div>
        </div>
      )}

      {!isBenchmark && ui.benchmarkNote && (
        <div className="flex flex-wrap items-start gap-2.5 rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-blue-50 to-cyan-50 px-4 py-3">
          <Sparkles className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
          <div className="text-xs text-indigo-900 flex-1">
            <span className="font-bold">{ui.benchmarkNote}</span>
          </div>
        </div>
      )}

      {feedback && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">
          {feedback} (simulated)
        </div>
      )}

      {screen.layoutType !== 'form-wizard' && kpiRow}
      {body}

      <p className="text-[11px] text-slate-400">Sample values are illustrative and are not real data.</p>
    </div>
  );
};
