import React, { useState } from 'react';
import type { EngineeringPackage, EngineeringPlan } from '../types';

/**
 * The architecture and delivery plan of the engineering package: what to build, how, in what order, and what
 * could go wrong. Written by the AI when one is configured, derived from the BRD by rules otherwise; the badge says which.
 */

const Section: React.FC<{ title: string; sub?: string; children: React.ReactNode }> = ({ title, sub, children }) => (
  <section className="space-y-2">
    <div className="border-b border-slate-100 pb-1.5">
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </div>
    {children}
  </section>
);

const Table: React.FC<{ head: string[]; children: React.ReactNode }> = ({ head, children }) => (
  <div className="overflow-x-auto border border-slate-200 rounded-xl">
    <table className="w-full text-xs text-left">
      <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase text-[10px]"><tr>{head.map((h) => <th key={h} className="p-2.5 px-3">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100 text-slate-700 align-top">{children}</tbody>
    </table>
  </div>
);

/** Minimal markdown: headings, bullet lists and paragraphs. */
const Markdown: React.FC<{ text: string }> = ({ text }) => (
  <div className="text-xs text-slate-700 leading-relaxed space-y-1.5">
    {text.split('\n').map((line, i) => {
      if (/^#{1,3}\s/.test(line)) return <div key={i} className="font-bold text-slate-900 pt-1">{line.replace(/^#+\s/, '')}</div>;
      if (/^\s*[-*]\s/.test(line)) return <div key={i} className="pl-4 relative before:content-['•'] before:absolute before:left-1">{line.replace(/^\s*[-*]\s/, '')}</div>;
      if (!line.trim()) return null;
      return <p key={i}>{line}</p>;
    })}
  </div>
);

const METHOD_TONE: Record<string, string> = { GET: 'bg-sky-100 text-sky-800', POST: 'bg-emerald-100 text-emerald-800', PATCH: 'bg-amber-100 text-amber-800', PUT: 'bg-amber-100 text-amber-800', DELETE: 'bg-rose-100 text-rose-800' };

export const EngineeringPlanPanel: React.FC<{ plan: EngineeringPlan; contracts: EngineeringPackage['apiRequirements'] }> = ({ plan, contracts }) => {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Architecture & Delivery Plan</h2>
          <p className="text-xs text-slate-500">How to build what the BRD describes: contracts, services, quality targets, security, backlog and risks.</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${plan.origin === 'AI' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
          {plan.origin === 'AI' ? 'Written by the AI from this BRD' : 'Derived from this BRD by rules (not written by the AI)'}
        </span>
      </div>

      <Section title="Architecture overview"><Markdown text={plan.architectureOverview} /></Section>

      <Section title={`Services and modules (${plan.services.length})`}>
        <Table head={['Service', 'Responsibility', 'Owns', 'Exposes', 'Depends on']}>
          {plan.services.map((s) => (
            <tr key={s.name}><td className="p-2.5 px-3 font-bold text-slate-900">{s.name}</td><td className="p-2.5 px-3">{s.responsibility}</td><td className="p-2.5 px-3">{s.owns.join(', ') || 'Uses records owned by other services'}</td><td className="p-2.5 px-3 font-mono text-[11px]">{s.exposes.join(', ') || '—'}</td><td className="p-2.5 px-3">{s.dependsOn.join(', ') || '—'}</td></tr>
          ))}
        </Table>
      </Section>

      <Section title={`API contracts (${contracts.length})`} sub="Click a row for the request and response samples. Roles and error cases are in the description.">
        <div className="space-y-1.5">
          {contracts.map((c, i) => (
            <div key={`${c.method}${c.endpoint}${i}`} className="border border-slate-200 rounded-lg overflow-hidden">
              <button onClick={() => setOpen(open === i ? null : i)} className="w-full text-left p-2.5 px-3 flex items-start gap-3 hover:bg-slate-50 cursor-pointer">
                <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold shrink-0 mt-0.5 ${METHOD_TONE[c.method] ?? 'bg-slate-100 text-slate-700'}`}>{c.method}</span>
                <span className="min-w-0"><span className="font-mono text-xs font-semibold text-slate-900 block break-all">{c.endpoint}</span><span className="text-[11px] text-slate-600">{c.description}</span></span>
              </button>
              {open === i && (
                <div className="grid md:grid-cols-2 gap-px bg-slate-200 border-t border-slate-200">
                  <div className="bg-slate-950 p-3"><div className="text-[10px] uppercase text-slate-400 mb-1">Request</div><pre className="text-[11px] text-emerald-300 whitespace-pre-wrap break-all">{c.requestBodySample}</pre></div>
                  <div className="bg-slate-950 p-3"><div className="text-[10px] uppercase text-slate-400 mb-1">Response</div><pre className="text-[11px] text-sky-300 whitespace-pre-wrap break-all">{c.responseBodySample}</pre></div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {plan.events.length > 0 && (
        <Section title={`Events (${plan.events.length})`}>
          <Table head={['Event', 'Produced by', 'Consumed by', 'Payload']}>
            {plan.events.map((e, i) => <tr key={`${e.name}${i}`}><td className="p-2.5 px-3 font-mono font-semibold">{e.name}</td><td className="p-2.5 px-3">{e.producer}</td><td className="p-2.5 px-3">{e.consumers.join(', ')}</td><td className="p-2.5 px-3"><pre className="font-mono text-[10px] whitespace-pre-wrap">{e.payloadSample}</pre></td></tr>)}
          </Table>
        </Section>
      )}

      <Section title={`Quality targets (${plan.nonFunctional.length})`} sub="Each target is measurable and says how it is verified.">
        <Table head={['Area', 'Requirement', 'Target', 'Verified by']}>
          {plan.nonFunctional.map((n, i) => <tr key={`${n.area}${i}`}><td className="p-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">{n.area}</td><td className="p-2.5 px-3">{n.requirement}</td><td className="p-2.5 px-3 font-semibold">{n.target}</td><td className="p-2.5 px-3">{n.howVerified}</td></tr>)}
        </Table>
      </Section>

      <div className="grid md:grid-cols-2 gap-6">
        <Section title="Security controls"><ul className="text-xs text-slate-700 space-y-1.5 list-disc pl-4">{plan.security.map((x, i) => <li key={i}>{x}</li>)}</ul></Section>
        <Section title="Test strategy"><ul className="text-xs text-slate-700 space-y-1.5 list-disc pl-4">{plan.testStrategy.map((x, i) => <li key={i}>{x}</li>)}</ul></Section>
      </div>

      {plan.integrationContracts.length > 0 && (
        <Section title="Integration contracts">
          <Table head={['System', 'Direction', 'Protocol', 'Data exchanged', 'When it fails']}>
            {plan.integrationContracts.map((c, i) => <tr key={`${c.system}${i}`}><td className="p-2.5 px-3 font-bold text-slate-900">{c.system}</td><td className="p-2.5 px-3">{c.direction}</td><td className="p-2.5 px-3">{c.protocol}</td><td className="p-2.5 px-3">{c.dataExchanged}</td><td className="p-2.5 px-3">{c.failureHandling}</td></tr>)}
          </Table>
        </Section>
      )}

      <Section title={`Backlog (${plan.backlog.reduce((n, e) => n + e.stories.length, 0)} stories in ${plan.backlog.length} epics)`}>
        <div className="grid md:grid-cols-2 gap-3">
          {plan.backlog.map((e) => (
            <div key={e.epic} className="border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="font-bold text-xs text-slate-900">{e.epic}</div>
              {e.stories.map((s, i) => (
                <div key={i} className="text-[11px] text-slate-700">
                  <div className="font-semibold">{s.title}</div>
                  <ul className="list-disc pl-4 text-slate-600">{s.acceptance.map((a, k) => <li key={k}>{a}</li>)}</ul>
                  {s.traces.length > 0 && <div className="text-[10px] text-slate-400 mt-0.5">Traces: {s.traces.join(' · ')}</div>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </Section>

      <div className="grid md:grid-cols-2 gap-6">
        <Section title="Deployment and operations"><ul className="text-xs text-slate-700 space-y-1.5 list-disc pl-4">{plan.deployment.map((x, i) => <li key={i}>{x}</li>)}</ul></Section>
        <Section title="Risks">
          <ul className="text-xs text-slate-700 space-y-2">{plan.risks.map((r, i) => <li key={i} className="border border-slate-200 rounded-lg p-2"><div className="font-semibold">{r.risk}</div><div className="text-slate-500">Impact: {r.impact}</div><div className="text-slate-500">Mitigation: {r.mitigation}</div></li>)}</ul>
        </Section>
      </div>
    </div>
  );
};
