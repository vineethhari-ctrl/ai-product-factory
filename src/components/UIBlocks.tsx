import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Lock, Signal, Wifi } from 'lucide-react';
import type { ScreenChart, ScreenUISpec, UITheme } from '../types';

/**
 * Building blocks the prototype canvas draws from a screen's UI spec: status chips, a chart, a board,
 * an activity timeline and a phone-sized screen. Colours come from the product theme through the CSS
 * variables --brand and --brand-accent set by the app frame.
 */

/** Colour a cell that looks like a status. Returns null for ordinary text. */
export function statusStyle(value: string): string | null {
  const v = value.trim();
  if (/^(active|completed?|done|approved|resolved|healthy|online|paid|delivered|confirmed|passed|open|ready|closed won)$/i.test(v)) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (/^(pending|scheduled|in progress|in review|review|new|processing|awaiting.*|waiting.*|draft|medium)$/i.test(v)) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  if (/^(overdue|blocked|failed|critical|urgent|rejected|offline|breached|escalated|late|expired|declined)$/i.test(v)) {
    return 'bg-rose-50 text-rose-700 border-rose-200';
  }
  if (/^(submitted|on hold|queued|assigned|high)$/i.test(v)) {
    return 'bg-sky-50 text-sky-700 border-sky-200';
  }
  if (/^(closed|archived|cancelled|canceled|inactive|low)$/i.test(v)) {
    return 'bg-slate-100 text-slate-600 border-slate-200';
  }
  if (/^on track$/i.test(v)) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (/^at risk$/i.test(v)) return 'bg-amber-50 text-amber-700 border-amber-200';
  return null;
}

const BRAND_CHIP = 'bg-[color-mix(in_srgb,var(--brand)_10%,white)] text-[var(--brand)] border-[color-mix(in_srgb,var(--brand)_30%,white)]';

/** `chip` marks a status column: values that are not a known status (e.g. a lifecycle stage) still render as a chip. */
export const StatusOrText: React.FC<{ value: string; chip?: boolean }> = ({ value, chip }) => {
  const style = statusStyle(value) ?? (chip && value && value !== '—' ? BRAND_CHIP : null);
  return style ? (
    <span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${style}`}>{value}</span>
  ) : (
    <span>{value}</span>
  );
};

// ── Theme ─────────────────────────────────────────────────────────────────

/** Palettes for prototypes the AI did not theme: picked from the product name so each product looks its own. */
const OFFLINE_PALETTES: Array<[string, string]> = [
  ['#2563eb', '#0ea5e9'], ['#0d9488', '#f59e0b'], ['#059669', '#0ea5e9'], ['#ea580c', '#0f766e'],
  ['#0284c7', '#22c55e'], ['#4f46e5', '#06b6d4'], ['#be123c', '#f59e0b'], ['#7c3aed', '#14b8a6'],
];

export function themeFor(productName: string, aiTheme?: UITheme): UITheme {
  if (aiTheme) return aiTheme;
  let h = 0;
  for (const ch of productName) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [primaryColor, accentColor] = OFFLINE_PALETTES[h % OFFLINE_PALETTES.length];
  return { primaryColor, accentColor, sidebarStyle: 'dark', density: 'comfortable' };
}

/** CSS variables the blocks and the app frame read. */
export const themeVars = (theme: UITheme): React.CSSProperties =>
  ({ '--brand': theme.primaryColor, '--brand-accent': theme.accentColor } as React.CSSProperties);

// ── Chart ─────────────────────────────────────────────────────────────────

const SERIES = ['var(--brand)', 'var(--brand-accent)', 'color-mix(in srgb, var(--brand) 55%, white)', 'color-mix(in srgb, var(--brand-accent) 55%, white)', '#94a3b8', '#cbd5e1'];

export const ChartCard: React.FC<{ chart: ScreenChart }> = ({ chart }) => {
  const max = Math.max(1, ...chart.values);
  const total = chart.values.reduce((a, b) => a + b, 0) || 1;
  const fmt = (v: number) => (Number.isInteger(v) ? v.toLocaleString('en-US') : v.toFixed(1));

  let body: React.ReactNode;
  if (chart.kind === 'donut') {
    let acc = 0;
    const r = 52;
    const c = 2 * Math.PI * r;
    body = (
      <div className="flex items-center gap-6">
        <svg viewBox="0 0 140 140" className="w-36 h-36 shrink-0 -rotate-90">
          <circle cx="70" cy="70" r={r} fill="none" stroke="#f1f5f9" strokeWidth="18" />
          {chart.values.map((v, i) => {
            const len = (v / total) * c;
            const el = (
              <circle key={i} cx="70" cy="70" r={r} fill="none" stroke={SERIES[i % SERIES.length]} strokeWidth="18"
                strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-acc} />
            );
            acc += len;
            return el;
          })}
        </svg>
        <ul className="space-y-2 text-xs min-w-0">
          {chart.labels.map((l, i) => (
            <li key={l} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: SERIES[i % SERIES.length] }} />
              <span className="text-slate-600 truncate">{l}</span>
              <span className="ml-auto pl-3 font-semibold text-slate-900 tabular-nums">{fmt(chart.values[i])}</span>
              <span className="text-slate-400 tabular-nums w-9 text-right">{Math.round((chart.values[i] / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    );
  } else if (chart.kind === 'line') {
    const W = 520, H = 160, pad = 8;
    const pts = chart.values.map((v, i) => [pad + (i * (W - 2 * pad)) / Math.max(1, chart.values.length - 1), H - pad - (v / max) * (H - 2 * pad)]);
    const line = pts.map((p) => p.join(',')).join(' ');
    body = (
      <div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-40" preserveAspectRatio="none">
          {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="#f1f5f9" />)}
          <polygon points={`${pad},${H - pad} ${line} ${W - pad},${H - pad}`} fill="var(--brand)" opacity="0.08" />
          <polyline points={line} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.5" fill="white" stroke="var(--brand)" strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
        </svg>
        <div className="flex justify-between text-[10px] text-slate-400 mt-1">
          {chart.labels.map((l) => <span key={l} className="truncate">{l}</span>)}
        </div>
      </div>
    );
  } else {
    body = (
      <div className="flex items-end gap-3 h-44 pt-4">
        {chart.values.map((v, i) => (
          <div key={i} className="flex-1 min-w-0 flex flex-col items-center gap-1.5 h-full justify-end">
            <span className="text-[11px] font-semibold text-slate-700 tabular-nums">{fmt(v)}</span>
            <div className="w-full max-w-12 rounded-t-md" style={{ height: `${Math.max(4, (v / max) * 100)}%`, background: i % 2 ? 'var(--brand-accent)' : 'var(--brand)' }} />
            <span className="text-[10px] text-slate-500 text-center leading-tight line-clamp-2">{chart.labels[i]}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
      <h3 className="text-sm font-bold text-slate-900 mb-2">{chart.title}</h3>
      {body}
    </div>
  );
};

// ── Board ─────────────────────────────────────────────────────────────────

export const BoardView: React.FC<{ board: NonNullable<ScreenUISpec['board']>; onOpen?: (title: string) => void }> = ({ board, onOpen }) => (
  <div className="flex items-start gap-3 overflow-x-auto pb-2">
    {board.columns.map((col) => (
      <div key={col.title} className="w-64 shrink-0 rounded-xl bg-slate-100/80 border border-slate-200 p-2.5">
        <div className="flex items-center justify-between px-1 mb-2">
          <span className="text-xs font-bold text-slate-700 truncate">{col.title}</span>
          <span className="text-[11px] font-semibold text-slate-500 bg-white rounded-full px-2 py-0.5 border border-slate-200">{col.cards.length}</span>
        </div>
        <div className="space-y-2">
          {col.cards.map((card, i) => (
            <button
              key={`${card.title}-${i}`}
              onClick={() => onOpen?.(card.title)}
              className="w-full text-left rounded-lg bg-white border border-slate-200 p-3 shadow-2xs hover:border-[color-mix(in_srgb,var(--brand)_45%,white)] hover:shadow-xs transition cursor-pointer"
            >
              <div className="text-xs font-bold text-slate-900 truncate">{card.title}</div>
              <div className="text-[11px] text-slate-500 truncate mt-0.5">{card.subtitle}</div>
              {card.tag && <div className="mt-2"><StatusOrText value={card.tag} chip /></div>}
            </button>
          ))}
          {col.cards.length === 0 && <div className="text-[11px] text-slate-400 px-1 py-3 text-center">Nothing here</div>}
        </div>
      </div>
    ))}
  </div>
);

// ── Timeline ──────────────────────────────────────────────────────────────

export const TimelineCard: React.FC<{ title?: string; events: NonNullable<ScreenUISpec['timeline']> }> = ({ title = 'Recent activity', events }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
    <h3 className="text-sm font-bold text-slate-900 mb-3">{title}</h3>
    <ol className="relative space-y-3.5 before:absolute before:left-[5px] before:top-1.5 before:bottom-1.5 before:w-px before:bg-slate-200">
      {events.map((e, i) => (
        <li key={i} className="relative pl-5">
          <span className={`absolute left-0 top-1 w-[11px] h-[11px] rounded-full border-2 border-white ${i === 0 ? 'bg-[var(--brand)]' : 'bg-slate-300'}`} />
          <div className="text-xs text-slate-800"><span className="font-semibold">{e.who}</span> {e.what}</div>
          <div className="text-[11px] text-slate-400">{e.when}</div>
        </li>
      ))}
    </ol>
  </div>
);

// ── Phone ─────────────────────────────────────────────────────────────────

/**
 * A screen an outside party opens on their phone: a list of their records, and one record at a time with
 * big actions. Drawn inside a phone frame so the BU sees exactly what that person sees.
 */
export const PhoneCanvas: React.FC<{ title: string; ui: ScreenUISpec; readOnly: boolean }> = ({ title, ui, readOnly }) => {
  const [open, setOpen] = useState<number | null>(ui.table.rows.length === 1 ? 0 : null);
  const [done, setDone] = useState<string | null>(null);
  const statusIdx = ui.table.columns.findIndex((c) => /status|state|stage/i.test(c));
  const row = open !== null ? ui.table.rows[open] : null;

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="w-[340px] rounded-[44px] bg-slate-900 p-3 shadow-2xl">
        <div className="rounded-[34px] overflow-hidden bg-slate-50 h-[640px] flex flex-col">
          <div className="bg-[var(--brand)] text-white px-5 pt-3 pb-4">
            <div className="flex items-center justify-between text-[10px] font-semibold opacity-90">
              <span>9:41</span>
              <span className="flex items-center gap-1"><Signal className="w-3 h-3" /><Wifi className="w-3 h-3" /></span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              {row && (
                <button onClick={() => { setOpen(null); setDone(null); }} className="-ml-1 p-1 rounded-full hover:bg-white/15 cursor-pointer" aria-label="Back">
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              <div className="text-lg font-bold leading-tight truncate">{row ? row[0] : title}</div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {!row && (
              <>
                {ui.kpis.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {ui.kpis.slice(0, 2).map((k) => (
                      <div key={k.label} className="rounded-2xl bg-white border border-slate-200 p-3">
                        <div className="text-[10px] font-semibold text-slate-500 leading-tight">{k.label}</div>
                        <div className="text-xl font-bold text-slate-900 mt-1">{k.value}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide pt-1">{ui.table.title}</div>
                {ui.table.rows.map((r, i) => (
                  <button key={i} onClick={() => setOpen(i)} className="w-full text-left rounded-2xl bg-white border border-slate-200 p-3.5 flex items-center gap-3 cursor-pointer active:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-slate-900 truncate">{r[0]}</div>
                      <div className="text-xs text-slate-500 truncate">{r[1]}</div>
                      {statusIdx >= 0 && <div className="mt-1.5"><StatusOrText value={r[statusIdx]} chip /></div>}
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                  </button>
                ))}
              </>
            )}

            {row && (
              <>
                {statusIdx >= 0 && <StatusOrText value={row[statusIdx]} chip />}
                <div className="rounded-2xl bg-white border border-slate-200 divide-y divide-slate-100">
                  {ui.table.columns.slice(1).map((c, i) => (i + 1 === statusIdx ? null : (
                    <div key={c} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-xs">
                      <span className="text-slate-500">{c}</span>
                      <span className="font-semibold text-slate-900 text-right">{row[i + 1]}</span>
                    </div>
                  )))}
                </div>
                {ui.detailPanels.slice(0, 2).map((p) => (
                  <div key={p.title} className="rounded-2xl bg-white border border-slate-200 px-4 py-3">
                    <div className="text-xs font-bold text-slate-900 mb-2">{p.title}</div>
                    {p.items.map((it) => (
                      <div key={it.label} className="flex justify-between gap-3 text-xs py-1">
                        <span className="text-slate-500">{it.label}</span>
                        <span className="font-semibold text-slate-800 text-right">{it.value}</span>
                      </div>
                    ))}
                  </div>
                ))}
                {ui.timeline && ui.timeline.length > 0 && <TimelineCard title="What happened so far" events={ui.timeline.slice(0, 4)} />}
                {done && <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold px-3 py-2">{done} (simulated)</div>}
              </>
            )}
          </div>

          {row && ui.primaryActions.length > 0 && (
            <div className="px-4 pb-6 pt-2 space-y-2 bg-slate-50 border-t border-slate-200">
              {ui.primaryActions.slice(0, 2).map((a, i) => (
                <button
                  key={a}
                  disabled={readOnly}
                  onClick={() => setDone(a)}
                  className={`w-full rounded-xl py-3 text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    i === 0 ? 'bg-[var(--brand)] text-white' : 'bg-white text-slate-800 border border-slate-300'
                  }`}
                >
                  {readOnly && <Lock className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}{a}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="text-[11px] text-slate-500">Phone screen: tap a {ui.table.title.toLowerCase().replace(/s$/, '')} to open it.</p>
    </div>
  );
};
