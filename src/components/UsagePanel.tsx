import React, { useCallback, useEffect, useState } from 'react';
import { Gauge, UserRound, X } from 'lucide-react';
import { USAGE_CHANGED_EVENT, getProjectId, getUser, setUser } from '../services/aiSession';

interface ButtonUsage {
  task: string;
  label: string;
  user: { used: number; limit: number; tokens: number; resetsAt: string | null };
  project: { used: number; limit: number; resetsAt: string | null };
}

interface UsageReport {
  user: string;
  project: string;
  limits: { projectButtonLimit: number; userButtonLimit: number; userDailyTokens: number; monthlyBudgetUsd: number };
  me: { tokensUsed: number; tokensLeft: number | null; tokensResetAt: string | null; costUsd: number; cacheHits: number };
  buttons: ButtonUsage[];
  team: {
    monthCostUsd: number;
    budgetUsd: number;
    budgetLeftUsd: number | null;
    monthClicks: number;
    monthTokens: number;
    monthCacheHits: number;
    byUser: Array<{ user: string; clicks: number; tokens: number; costUsd: number }>;
    byDay: Array<{ day: string; clicks: number; tokens: number; costUsd: number }>;
  };
}

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n));
const usd = (n: number) => `$${n.toFixed(2)}`;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : '');

const Bar: React.FC<{ used: number; limit: number }> = ({ used, limit }) => {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const tone = pct >= 100 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
};

const Count: React.FC<{ used: number; limit: number }> = ({ used, limit }) => (
  <span className={`font-mono font-semibold ${limit > 0 && used >= limit ? 'text-rose-600' : 'text-slate-800'}`}>
    {used}/{limit > 0 ? limit : '∞'}
  </span>
);

/** Asks the BA for a name once; their AI usage is tracked against it. */
export const IdentityPrompt: React.FC = () => {
  const [open, setOpen] = useState(() => !getUser());
  const [name, setName] = useState('');
  useEffect(() => {
    const reopen = () => setOpen(!getUser());
    window.addEventListener(USAGE_CHANGED_EVENT, reopen);
    return () => window.removeEventListener(USAGE_CHANGED_EVENT, reopen);
  }, []);
  if (!open) return null;
  const save = () => {
    if (!name.trim()) return;
    setUser(name);
    setOpen(false);
  };
  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl space-y-4">
        <div className="flex items-center gap-2">
          <UserRound className="w-5 h-5 text-indigo-600" />
          <h2 className="text-base font-bold text-slate-900">Who is working today?</h2>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          AI calls have a daily allowance per person. Enter your name or work email so your usage is counted to you.
        </p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="e.g. priya.raman@company.com"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-hidden focus:border-indigo-500"
        />
        <button
          onClick={save}
          disabled={!name.trim()}
          className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
    </div>
  );
};

/** Header button + dropdown: my tokens and clicks per AI button today, this project's clicks, the team's month. */
export const UsagePanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<UsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/usage');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setReport(await res.json());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(USAGE_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(USAGE_CHANGED_EVENT, refresh);
  }, [refresh]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const left = report?.me.tokensLeft;
  const label = report ? (left === null || left === undefined ? `${k(report.me.tokensUsed)} used` : `${k(left)} left`) : 'AI usage';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        title="Your AI usage today"
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
          left === 0 ? 'border-rose-200 text-rose-700 bg-rose-50' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
        }`}
      >
        <Gauge className="w-3.5 h-3.5 text-indigo-500" />
        <span>AI tokens: {label}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[420px] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-xl z-50 text-xs">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div>
              <div className="font-bold text-slate-900 text-sm">AI usage</div>
              <div className="text-slate-500">
                {getUser() || 'anonymous'} ·{' '}
                <button className="text-indigo-600 hover:underline" onClick={() => { setUser(''); setOpen(false); }}>change</button>
                {' '}· project <span className="font-mono">{getProjectId()}</span>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
          </div>

          {error && <div className="px-4 py-3 text-rose-600">Usage unavailable: {error}</div>}

          {report && (
            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              <section className="space-y-1.5">
                <div className="flex justify-between font-semibold text-slate-800">
                  <span>Your tokens, last 24 hours</span>
                  <span className="font-mono">
                    {k(report.me.tokensUsed)} / {report.limits.userDailyTokens > 0 ? k(report.limits.userDailyTokens) : '∞'}
                  </span>
                </div>
                <Bar used={report.me.tokensUsed} limit={report.limits.userDailyTokens} />
                <div className="flex justify-between text-slate-500">
                  <span>
                    {left !== null && left !== undefined ? `${k(left)} left` : 'No daily limit'} · about {usd(report.me.costUsd)}
                  </span>
                  {report.me.tokensResetAt && <span>frees up from {when(report.me.tokensResetAt)}</span>}
                </div>
              </section>

              <section>
                <div className="font-semibold text-slate-800 mb-1.5">AI buttons, last 24 hours</div>
                <table className="w-full">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-slate-400 text-left">
                      <th className="py-1 font-semibold">Button</th>
                      <th className="py-1 font-semibold text-right">You</th>
                      <th className="py-1 font-semibold text-right">This project</th>
                      <th className="py-1 font-semibold text-right">Your tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.buttons.map((b) => (
                      <tr key={b.task} className="border-t border-slate-100">
                        <td className="py-1.5 text-slate-700">{b.label}</td>
                        <td className="py-1.5 text-right"><Count used={b.user.used} limit={b.user.limit} /></td>
                        <td className="py-1.5 text-right"><Count used={b.project.used} limit={b.project.limit} /></td>
                        <td className="py-1.5 text-right font-mono text-slate-600">{k(b.user.tokens)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-1.5 text-slate-500 leading-relaxed">
                  Over a limit, the button still works but answers with the free offline engine. Re-running the same input reuses
                  the saved result for free ({report.me.cacheHits} reused today). To add detail, prefer <b>Request Change</b>: it uses
                  a small, cheap model.
                </p>
              </section>

              <section className="space-y-1.5 border-t border-slate-100 pt-3">
                <div className="flex justify-between font-semibold text-slate-800">
                  <span>Team this month</span>
                  <span className="font-mono">
                    {usd(report.team.monthCostUsd)} / {report.team.budgetUsd > 0 ? usd(report.team.budgetUsd) : 'no cap'}
                  </span>
                </div>
                {report.team.budgetUsd > 0 && <Bar used={report.team.monthCostUsd} limit={report.team.budgetUsd} />}
                <div className="text-slate-500">
                  {report.team.monthClicks} AI calls · {k(report.team.monthTokens)} tokens · {report.team.monthCacheHits} reused free
                </div>
                {report.team.byUser.length > 0 && (
                  <table className="w-full mt-1">
                    <tbody>
                      {report.team.byUser.slice(0, 8).map((u) => (
                        <tr key={u.user} className="border-t border-slate-100">
                          <td className="py-1 text-slate-700 truncate max-w-[180px]">{u.user}</td>
                          <td className="py-1 text-right text-slate-500">{u.clicks} calls</td>
                          <td className="py-1 text-right font-mono text-slate-500">{k(u.tokens)}</td>
                          <td className="py-1 text-right font-mono text-slate-800">{usd(u.costUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p className="text-[10px] text-slate-400">Costs are estimates from list prices; check your provider's bill.</p>
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
