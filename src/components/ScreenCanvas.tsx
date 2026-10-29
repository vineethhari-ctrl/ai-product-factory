import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Lock,
  Minus,
  Search,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { DataEntityDefinition, ScreenDefinition, ScreenUISpec } from '../types';
import { EntityForm } from './EntityForm';
import { TransactionScreen } from './TransactionScreen';
import { ProofChain } from './ProofChain';
import { BoardView, ChartCard, PhoneCanvas, StatusOrText, TimelineCard } from './UIBlocks';

interface ScreenCanvasProps {
  screen: ScreenDefinition & { ui: ScreenUISpec };
  /** True for read-only / auditor roles: actions are shown but locked. */
  readOnly: boolean;
  /** The product's data entities. A form-wizard screen renders a validated form for the entity it edits. */
  entities?: DataEntityDefinition[];
  /** The page header already shows the first primary action, so the screen does not repeat it. */
  actionInHeader?: boolean;
}

const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The entity a form screen edits: the blueprint's explicit reference, else a name match against the screen. */
function resolveEntity(screen: ScreenDefinition, ui: ScreenUISpec, entities: DataEntityDefinition[] | undefined): DataEntityDefinition | null {
  if (!entities || entities.length === 0) return null;
  if (ui.entity) {
    const exact = entities.find((e) => normName(e.name) === normName(ui.entity!));
    if (exact) return exact;
  }
  const haystack = normName(`${screen.name} ${screen.module} ${screen.purpose}`);
  return entities.find((e) => normName(e.name).length >= 4 && haystack.includes(normName(e.name))) ?? null;
}

const PERSON_COLUMN = /owner|party|assign|advisor|supervisor|agent|requester|approver|manager|engineer|technician|handler|customer|member|\bby\b|\buser\b/i;
const AVATAR_COLORS = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-sky-500', 'bg-violet-500'];

const PersonCell: React.FC<{ value: string }> = ({ value }) => {
  if (!value || value === '—') return <span>{value}</span>;
  const initials = value.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const color = AVATAR_COLORS[value.length % AVATAR_COLORS.length];
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`w-6 h-6 rounded-full text-[10px] font-bold text-white flex items-center justify-center ${color}`}>{initials}</span>
      <span>{value}</span>
    </span>
  );
};

const TrendIcon: React.FC<{ trend: 'up' | 'down' | 'flat' }> = ({ trend }) => {
  if (trend === 'up') return <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />;
  if (trend === 'down') return <TrendingDown className="w-3.5 h-3.5 text-rose-600" />;
  return <Minus className="w-3.5 h-3.5 text-slate-400" />;
};

export const ScreenCanvas: React.FC<ScreenCanvasProps> = ({ screen, readOnly, entities, actionInHeader }) => {
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

  const [view, setView] = useState<'list' | 'board'>(ui.board ? 'board' : 'list');

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

  // Stages in order: the filter chips, minus "All" and side states, counted over every sample row.
  const stages = ui.filters.filter((f) => !/^all\b/i.test(f) && !/^(on hold|cancell?ed|closed|archived)$/i.test(f.trim()));
  // Counts per stage: a "per stage" panel or a chart over the stages when the design has one (real volumes),
  // else the sample rows.
  const countPanel = ui.detailPanels.find((p) => /per stage|by stage/i.test(p.title));
  const countFrom = (labels: string[], values: string[]) => (st: string) => {
    const i = labels.findIndex((l) => l.toLowerCase() === st.toLowerCase());
    const n = i >= 0 ? Number(String(values[i]).replace(/[^0-9.]/g, '')) : NaN;
    return Number.isFinite(n) ? n : undefined;
  };
  const fromPanel = countPanel ? countFrom(countPanel.items.map((it) => it.label), countPanel.items.map((it) => it.value)) : undefined;
  const fromChart = ui.chart && ui.chart.kind !== 'line' ? countFrom(ui.chart.labels, ui.chart.values.map(String)) : undefined;
  const stageCounts = stages.map((st) =>
    fromPanel?.(st) ?? fromChart?.(st) ??
    (statusColIdx >= 0 ? ui.table.rows.filter((r) => (r[statusColIdx] ?? '').toLowerCase() === st.toLowerCase()).length : 0),
  );
  const maxCount = Math.max(1, ...stageCounts);
  const currentStage = selected && statusColIdx >= 0 ? stages.findIndex((st) => st.toLowerCase() === (selected[statusColIdx] ?? '').toLowerCase()) : -1;

  const pipeline = stages.length >= 3 && statusColIdx >= 0 && (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-900">Work by stage</h3>
        <span className="text-[11px] text-slate-500">Click a stage to filter</span>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
        {stages.map((st, i) => {
          const fi = ui.filters.indexOf(st);
          const on = activeFilter === fi;
          return (
            <button
              key={st}
              onClick={() => { setActiveFilter(on ? 0 : fi); setSelectedIdx(0); }}
              className={`text-left rounded-lg border p-3 cursor-pointer transition-colors ${on ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_7%,white)]' : 'border-slate-200 hover:border-[color-mix(in_srgb,var(--brand)_45%,white)]'}`}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-600 text-[9px] flex items-center justify-center">{i + 1}</span>
                <span className="truncate">{st}</span>
              </div>
              <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{stageCounts[i]}</div>
              <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${(stageCounts[i] / maxCount) * 100}%` }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const stageProgress = currentStage >= 0 && stages.length >= 3 && (
    <ol className="flex items-center gap-1">
      {stages.map((st, i) => (
        <li key={st} className="flex-1 min-w-0">
          <div className={`h-1.5 rounded-full ${i < currentStage ? 'bg-emerald-500' : i === currentStage ? 'bg-[var(--brand)]' : 'bg-slate-200'}`} />
          <div className={`mt-1 text-[10px] truncate ${i === currentStage ? 'font-bold text-[var(--brand)]' : 'text-slate-400'}`}>{st}</div>
        </li>
      ))}
    </ol>
  );

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

  // List or board: screens the AI gave a board open on it, with a switch back to the list.
  const viewSwitch = ui.board && (
    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold">
      {(['board', 'list'] as const).map((v) => (
        <button
          key={v}
          onClick={() => setView(v)}
          className={`px-3 py-1 rounded-md cursor-pointer ${view === v ? 'bg-[var(--brand)] text-white' : 'text-slate-600 hover:text-slate-900'}`}
        >
          {v === 'board' ? 'Board' : 'List'}
        </button>
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
                ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                : 'bg-white text-slate-600 border-slate-200 hover:border-[color-mix(in_srgb,var(--brand)_45%,white)] hover:text-[var(--brand)]'
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
      {viewSwitch}
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelectedIdx(0);
          }}
          placeholder={`Search ${ui.table.title.toLowerCase()}...`}
          className="pl-8 pr-3 py-1.5 w-56 max-w-full rounded-lg border border-slate-200 bg-white text-xs focus:outline-hidden focus:border-[var(--brand)]"
        />
      </div>
      </div>
    </div>
  );

  const actionList = actionInHeader ? ui.primaryActions.slice(1) : ui.primaryActions;
  const actionsBar = actionList.length > 0 && (
    <div className="flex flex-wrap items-center gap-2">
      {actionList.map((a, i) => (
        <button
          key={a}
          onClick={() => runAction(a)}
          disabled={readOnly}
          title={readOnly ? 'Your selected role has read-only access' : undefined}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            readOnly
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : i === 0
                ? 'bg-[var(--brand)] hover:brightness-110 text-white cursor-pointer shadow-xs'
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
                  ri === selectedIdx ? 'bg-[color-mix(in_srgb,var(--brand)_7%,white)]' : 'hover:bg-slate-50'
                }`}
              >
                {row.map((cell, ci) => (
                  <td key={ci} className={`px-4 py-2.5 whitespace-nowrap ${ci === 0 ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                    {ci > 0 && PERSON_COLUMN.test(ui.table.columns[ci] ?? '') && ci !== statusColIdx ? (
                      <PersonCell value={cell} />
                    ) : (
                      <StatusOrText value={cell} chip={ci === statusColIdx} />
                    )}
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
        {statusColIdx >= 0 && <StatusOrText value={selected[statusColIdx] ?? ''} chip />}
      </div>
      {stageProgress}
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
      {ui.detailPanels.filter((p) => !(pipeline && /per stage|by stage/i.test(p.title))).map((p) => (
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

  const openCard = (title: string) => {
    const i = rows.findIndex((r) => r[0] === title);
    if (i >= 0) setSelectedIdx(i);
    setView('list');
  };
  const records = ui.board && view === 'board' ? <BoardView board={ui.board} onOpen={openCard} /> : table;

  const timeline = ui.timeline && ui.timeline.length > 0 && <TimelineCard events={ui.timeline} />;
  const chartRow = (ui.chart || timeline) && (
    <div className={`grid gap-4 ${ui.chart && timeline ? 'lg:grid-cols-3' : ''}`}>
      {ui.chart && <div className={timeline ? 'lg:col-span-2' : ''}><ChartCard chart={ui.chart} /></div>}
      {timeline}
    </div>
  );

  if (ui.device === 'phone') {
    return <PhoneCanvas title={screen.name} ui={ui} readOnly={readOnly} />;
  }

  // ── Layouts ───────────────────────────────────────────────────────────────
  let body: React.ReactNode;
  switch (screen.layoutType) {
    case 'transaction':
      if (ui.document) {
        body = <TransactionScreen key={screen.id} ui={{ ...ui, document: ui.document }} readOnly={readOnly} />;
        break;
      }
    // A transaction screen without a document is shown as a record list.
    // falls through
    case 'table-detail':
      body = (
        <>
          {pipeline}
          {ui.chart && <ChartCard chart={ui.chart} />}
          {toolbar}
          {ui.board && view === 'board' ? (
            // A board needs the full width; the selected record and its panels sit below it.
            <>
              {records}
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="space-y-4">{selectedRecord}{actionsBar}</div>
                <div>{timeline}</div>
                <div>{panels('grid-cols-1')}</div>
              </div>
            </>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-4">{records}</div>
              <div className="space-y-4">
                {selectedRecord}
                {actionsBar}
                {timeline}
                {panels('grid-cols-1')}
              </div>
            </div>
          )}
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
                        ri === selectedIdx ? 'bg-[color-mix(in_srgb,var(--brand)_7%,white)]' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">{row[0]}</div>
                        <div className="text-[11px] text-slate-500 truncate">{row[1] ?? ''}</div>
                      </div>
                      {statusColIdx >= 0 && <StatusOrText value={row[statusColIdx] ?? ''} chip />}
                    </button>
                  </li>
                ))}
                {rows.length === 0 && <li className="px-4 py-8 text-center text-xs text-slate-500">No sample records match.</li>}
              </ul>
            </div>
            <div className="lg:col-span-3 space-y-4">
              {selectedRecord}
              {actionsBar}
              {timeline}
              {panels('sm:grid-cols-2')}
            </div>
          </div>
        </>
      );
      break;

    case 'form-wizard': {
      const formEntity = resolveEntity(screen, ui, entities);
      if (formEntity) {
        body = (
          <>
            <EntityForm
              key={formEntity.name}
              entity={formEntity}
              readOnly={readOnly}
              stepTitles={ui.detailPanels.map((p) => p.title)}
              submitLabel={ui.primaryActions[0]}
            />
            {table}
          </>
        );
        break;
      }
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
                    i < wizardStep ? 'bg-emerald-500 text-white' : i === wizardStep ? 'bg-[var(--brand)] text-white' : 'bg-slate-200 text-slate-500'
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
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:outline-hidden focus:border-[var(--brand)] disabled:bg-slate-50"
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
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-[var(--brand)] hover:brightness-110 text-white disabled:bg-slate-100 disabled:text-slate-400 cursor-pointer"
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
            <div className="w-14 h-14 rounded-2xl bg-[var(--brand)] text-white flex items-center justify-center text-lg font-bold">
              {initials || '—'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-lg font-bold text-slate-900 truncate">{selectedTitle || 'No record selected'}</div>
              <div className="text-xs text-slate-500">{selected?.[1] ?? ''}</div>
            </div>
            {statusColIdx >= 0 && selected && <StatusOrText value={selected[statusColIdx] ?? ''} chip />}
            {actionsBar}
          </div>
          {stageProgress && <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-2xs">{stageProgress}</div>}
          {chartRow}
          {panels('md:grid-cols-2 xl:grid-cols-3')}
          {records}
        </>
      );
      break;
    }

    case 'dashboard':
    default:
      body = (
        <>
          {pipeline}
          {chartRow}
          {toolbar}
          {records}
          {actionsBar}
          {panels('md:grid-cols-2 xl:grid-cols-3')}
        </>
      );
  }

  return (
    <div className="space-y-4">
      {feedback && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">
          {feedback} (simulated)
        </div>
      )}

      {screen.layoutType !== 'form-wizard' && kpiRow}
      {ui.chain?.ledgerOnly ? null : body}
      {ui.chain && (
        <ProofChain key={`${screen.id}-chain`} title={ui.chain.title} note={ui.chain.note} columns={ui.table.columns} rows={ui.table.rows} readOnly={readOnly} provenance={ui.addedBy === 'FACTORY' ? 'factory-screen' : ui.chain.by === 'FACTORY' ? 'factory-marker' : 'ai'} />
      )}

    </div>
  );
};
