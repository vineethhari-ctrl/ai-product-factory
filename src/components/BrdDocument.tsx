import React from 'react';
import { ProductDefinition, ConfidenceStatus } from '../types';
import { constraintSummary, withSystemFields } from '../services/validationEngine';
import { AUDIENCE_LABEL, forAudience } from '../services/questionAudience';

/**
 * The BRD as a document: every section the engineering and BU teams need to sign off,
 * built only from the definition (and the BU's parsed brief when there is one).
 * Domain-neutral: the standard-requirements section names no domain.
 */

const NFRS: Array<[string, string]> = [
  ['Performance', 'Lists and search answer in under 2 seconds for 95% of requests at the expected peak load; a record opens in under 1 second.'],
  ['Availability', 'Business-hours availability of at least 99.5%; planned maintenance outside business hours with advance notice to users.'],
  ['Security', 'Single sign-on, role-based access on every screen and action, least-privilege data access, personal and financial fields masked for roles without a need to know.'],
  ['Audit & traceability', 'Every create, change, stage movement and approval records who, when, from-to values and the reason; the audit trail cannot be edited.'],
  ['Data retention', 'Records and their audit trail are kept for the period the business and regulator require; archived data stays searchable.'],
  ['Usability', 'A new user completes the main task without training; every error says what to fix; works on current desktop browsers, and on phones for screens used by outside parties.'],
  ['Integration resilience', 'Failed calls to other systems are retried, queued and visible to an administrator; no record is lost or duplicated.'],
];

const Heading: React.FC<{ n: number; title: string; sub?: string }> = ({ n, title, sub }) => (
  <div className="border-b border-slate-100 pb-2">
    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
      <span className="w-6 h-6 rounded-md bg-indigo-50 text-indigo-700 text-xs font-bold flex items-center justify-center">{n}</span>
      {title}
    </h3>
    {sub && <p className="text-[11px] text-slate-500 mt-1 ml-8">{sub}</p>}
  </div>
);

const Chip: React.FC<{ status?: ConfidenceStatus | string }> = ({ status }) => {
  if (!status) return null;
  const tone = status === 'CONFIRMED' ? 'bg-emerald-50 text-emerald-700' : status === 'INFERRED' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700';
  return <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${tone}`}>{status}</span>;
};

const Table: React.FC<{ head: string[]; children: React.ReactNode }> = ({ head, children }) => (
  <div className="overflow-x-auto border border-slate-200 rounded-xl">
    <table className="w-full text-xs text-left">
      <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase text-[10px]">
        <tr>{head.map((h) => <th key={h} className="p-3 px-4">{h}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-slate-100 text-slate-700 align-top">{children}</tbody>
    </table>
  </div>
);

export const BrdBody: React.FC<{ definition: ProductDefinition }> = ({ definition }) => {
  const d = definition;
  const brief = d.blueprintBrief;
  const problems = d.problemStatement?.length ? d.problemStatement : brief?.painPoints ?? [];
  const kpis = d.successMetrics?.length ? d.successMetrics : brief?.kpis ?? [];
  const stages = brief?.stages ?? [];
  const owners = brief?.stageOwners ?? [];
  const accessOf = (role: string) => d.permissions.find((p) => p.role === role)?.accessLevel ?? '';
  let n = 0;
  const next = () => ++n;

  const open = d.openQuestions ?? [];
  const bu = forAudience(open, 'BU', (q) => q.question);
  const tech = forAudience(open, 'TECH', (q) => q.question);

  return (
    <>
      <div className="space-y-3">
        <Heading n={next()} title="Executive Summary & Business Objectives" />
        <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-200">{d.objective}</p>
        {brief?.goal && <p className="text-[11px] text-slate-500 italic">BU goal: {brief.goal}</p>}
      </div>

      {(problems.length || kpis.length) ? (
        <div className="space-y-3">
          <Heading n={next()} title="Problem Statement & Success Measures" sub="The problems and measures the business named. Baselines and targets are set by the BU." />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {problems.length ? (
              <div className="p-4 bg-rose-50/50 border border-rose-100 rounded-xl space-y-2">
                <div className="font-bold text-rose-800 uppercase text-[10px] tracking-wider">Problems today</div>
                <ol className="space-y-1.5 list-decimal list-inside text-slate-700">{problems.map((p, i) => <li key={i}>{p}</li>)}</ol>
              </div>
            ) : null}
            {kpis.length ? (
              <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-2">
                <div className="font-bold text-emerald-800 uppercase text-[10px] tracking-wider">Success measures (KPIs)</div>
                <ol className="space-y-1.5 list-decimal list-inside text-slate-700">{kpis.map((k, i) => <li key={i}>{k} <span className="text-slate-400">· baseline and target to be set by the BU</span></li>)}</ol>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <Heading n={next()} title={`Functional Scope & System Modules (${d.modules.length})`} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {d.modules.map((m, idx) => (
            <div key={m.id || idx} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="font-bold text-slate-900 flex items-center justify-between">
                <span>{n}.{idx + 1} {m.name}</span><Chip status={m.confidence} />
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">{m.description}</p>
              <p className="text-slate-400 text-[10px]">{d.screens.filter((s) => s.module === m.name).map((s) => s.name).join(' · ') || 'No screens assigned'}</p>
            </div>
          ))}
        </div>
      </div>

      {stages.length >= 3 && (
        <div className="space-y-3">
          <Heading n={next()} title={`Process & Lifecycle (${stages.length} stages)`} sub="The order of work, who does each stage, and the rules that govern it." />
          <Table head={['#', 'Stage', 'Owner', 'Rules that apply']}>
            {stages.map((st, i) => (
              <tr key={st}>
                <td className="p-3 px-4 font-mono text-slate-400">{i + 1}</td>
                <td className="p-3 px-4 font-bold text-slate-900">{st}</td>
                <td className="p-3 px-4">{owners[i] || '—'}</td>
                <td className="p-3 px-4 text-[11px]">{d.businessRules.filter((r) => r.context === st).map((r) => r.code).join(', ') || '—'}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      <div className="space-y-3">
        <Heading n={next()} title={`User Personas & Security Access (${d.personas.length})`} />
        <Table head={['Persona', 'Responsibilities & goals', 'Access level', 'Permissions']}>
          {d.personas.map((p, idx) => (
            <tr key={p.id || idx}>
              <td className="p-3 px-4"><div className="font-bold text-slate-900">{p.name}</div><div className="text-indigo-700 font-semibold text-[11px]">{p.role}</div></td>
              <td className="p-3 px-4 text-[11px]"><ul className="list-disc list-inside">{p.keyGoals.map((g, i) => <li key={i}>{g}</li>)}</ul></td>
              <td className="p-3 px-4 font-semibold">{accessOf(p.name) || '—'}</td>
              <td className="p-3 px-4 font-mono text-[11px]">{p.permissions.join(', ')}</td>
            </tr>
          ))}
        </Table>
      </div>

      <div className="space-y-3">
        <Heading n={next()} title={`User Journeys (${d.userJourneys.length})`} />
        <div className="space-y-3">
          {d.userJourneys.map((j, idx) => (
            <div key={j.id || idx} className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-bold text-slate-900">{n}.{idx + 1} {j.name} <span className="text-slate-400 font-normal">· {j.persona}</span></div>
                <Chip status={j.confidence} />
              </div>
              <ol className="flex flex-wrap gap-1.5">
                {j.steps.map((s, i) => <li key={i} className="px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px]"><span className="text-indigo-600 font-bold mr-1">{i + 1}</span>{s}</li>)}
              </ol>
              <p className="text-[11px] text-slate-600"><span className="font-semibold">Outcome:</span> {j.outcome}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Heading n={next()} title={`Functional Requirements by Screen (${d.screens.length})`} sub="What each screen is for, what it shows and what the user can do." />
        <Table head={['Screen', 'Layout', 'Purpose', 'Shows', 'User actions']}>
          {d.screens.map((s) => (
            <tr key={s.id}>
              <td className="p-3 px-4"><div className="font-bold text-slate-900">{s.name}</div><div className="text-[10px] text-slate-400">{s.module}</div></td>
              <td className="p-3 px-4 font-mono text-[11px]">{s.layoutType}</td>
              <td className="p-3 px-4 text-[11px]">{s.purpose}</td>
              <td className="p-3 px-4 text-[11px]">{[...(s.ui?.kpis ?? []).map((k) => k.label), ...(s.ui?.table ? [s.ui.table.title] : []), ...(s.ui?.chart ? [s.ui.chart.title] : [])].join(' · ') || s.components.join(' · ')}</td>
              <td className="p-3 px-4 text-[11px]">{(s.ui?.primaryActions ?? []).join(' · ') || '—'}</td>
            </tr>
          ))}
        </Table>
      </div>

      <div className="space-y-3">
        <Heading n={next()} title={`Business Rules (${d.businessRules.length})`} sub="CONFIRMED rules are the BU's own words; INFERRED ones are predicted and need review." />
        <div className="space-y-2 text-xs">
          {d.businessRules.map((rule, idx) => (
            <div key={rule.id || idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-3">
              <span className="px-2 py-0.5 bg-slate-900 text-white font-mono font-bold text-[10px] rounded shrink-0 mt-0.5">{rule.code || `BR-${idx + 1}`}</span>
              <div className="space-y-0.5 flex-1">
                <div className="font-semibold text-slate-900">{rule.rule}</div>
                <div className="text-slate-500 text-[11px]">Applies to: {rule.context}</div>
              </div>
              <Chip status={rule.confidence} />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Heading n={next()} title={`Data Dictionary (${d.dataEntities.length} entities)`} sub="Business fields with their format, whether they are compulsory, and their validation. System fields are added automatically." />
        <div className="space-y-4">
          {d.dataEntities.map((e, idx) => {
            const full = withSystemFields(e);
            return (
              <div key={e.id || idx} className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="p-3 px-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                  <div><div className="font-bold font-mono text-slate-900 text-xs">{e.name}</div><p className="text-slate-600 text-[11px]">{e.description}</p></div>
                  <Chip status={e.confidence} />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] text-left">
                    <thead className="text-slate-400 uppercase text-[10px] border-b border-slate-100"><tr><th className="p-2 px-4">Field</th><th className="p-2 px-4">Format</th><th className="p-2 px-4">Required</th><th className="p-2 px-4">Validation</th></tr></thead>
                    <tbody className="divide-y divide-slate-50">
                      {full.fields.filter((f) => f.source !== 'system').map((f) => (
                        <tr key={f.name}>
                          <td className="p-2 px-4 font-mono font-semibold text-slate-800">{f.name}</td>
                          <td className="p-2 px-4">{f.constraints?.format ?? f.type}</td>
                          <td className="p-2 px-4">{f.required ? 'Yes' : 'No'}</td>
                          <td className="p-2 px-4 text-slate-500">{constraintSummary(f).join(', ') || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {e.lifecycle && (
                  <div className="p-3 px-4 border-t border-slate-100 text-[11px] text-slate-600">
                    <span className="font-semibold text-slate-800">Lifecycle ({e.lifecycle.statusField}):</span> {e.lifecycle.states.join(' → ')}
                  </div>
                )}
                {(e.rules?.length || e.crossRecordRules?.length) ? (
                  <ul className="p-3 px-4 border-t border-slate-100 text-[11px] text-slate-600 list-disc list-inside">
                    {e.rules?.map((r) => <li key={r.id}>{r.message}</li>)}
                    {e.crossRecordRules?.map((r, i) => <li key={`x${i}`}>{r} <span className="text-slate-400">(enforced by the backend)</span></li>)}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {(d.validations.length > 0 || d.notifications.length > 0) && (
        <div className="space-y-3">
          <Heading n={next()} title="Validations & Notifications" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Table head={['Field', 'Rule', 'Message']}>
              {d.validations.map((v, i) => <tr key={i}><td className="p-3 px-4 font-mono">{v.field}</td><td className="p-3 px-4 text-[11px]">{v.validationRule}</td><td className="p-3 px-4 text-[11px] text-slate-500">{v.errorMessage}</td></tr>)}
            </Table>
            <Table head={['When', 'Channel', 'Who is told']}>
              {d.notifications.map((v, i) => <tr key={i}><td className="p-3 px-4 text-[11px]">{v.event}</td><td className="p-3 px-4 text-[11px]">{v.channel}</td><td className="p-3 px-4 text-[11px]">{v.recipient}</td></tr>)}
            </Table>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <Heading n={next()} title={`Integrations & Interfaces (${d.integrations.length})`} />
        <Table head={['System', 'Style', 'Purpose', 'Status']}>
          {d.integrations.map((i, idx) => (
            <tr key={i.id || idx}><td className="p-3 px-4 font-bold text-slate-900">{i.system}</td><td className="p-3 px-4 text-[11px]">{i.protocol}</td><td className="p-3 px-4 text-[11px]">{i.purpose}</td><td className="p-3 px-4"><Chip status={i.confidence} /></td></tr>
          ))}
        </Table>
      </div>

      <div className="space-y-3">
        <Heading n={next()} title="Non-Functional Requirements" sub={d.nonFunctionalRequirements?.length ? 'Written for this product. The BA & Tech team confirms or changes the targets.' : 'Proposed standard targets. The BA & Tech team confirms or changes them.'} />
        <Table head={['Area', 'Requirement', 'Target']}>
          {(d.nonFunctionalRequirements?.length ? d.nonFunctionalRequirements : NFRS.map(([area, requirement]) => ({ area, requirement, target: '' }))).map((n, i) => (
            <tr key={`${n.area}${i}`}><td className="p-3 px-4 font-bold text-slate-900 whitespace-nowrap">{n.area}</td><td className="p-3 px-4 text-[11px]">{n.requirement}</td><td className="p-3 px-4 text-[11px] font-semibold">{n.target || 'To be set by the tech team'}</td></tr>
          ))}
        </Table>
        {d.risks?.length ? (
          <>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pt-2">Risks to delivery and operation</div>
            <Table head={['Risk', 'Impact', 'Mitigation']}>
              {d.risks.map((r, i) => <tr key={i}><td className="p-3 px-4 text-[11px] font-semibold text-slate-900">{r.risk}</td><td className="p-3 px-4 text-[11px]">{r.impact}</td><td className="p-3 px-4 text-[11px]">{r.mitigation}</td></tr>)}
            </Table>
          </>
        ) : null}
      </div>

      <div className="space-y-3">
        <Heading n={next()} title="Assumptions, Risks & Open Questions" />
        {d.assumptions.length > 0 && (
          <Table head={['Assumption', 'Risk', 'Status']}>
            {d.assumptions.map((a) => <tr key={a.id}><td className="p-3 px-4 text-[11px]">{a.statement}</td><td className="p-3 px-4 font-semibold">{a.riskLevel}</td><td className="p-3 px-4 text-[11px]">{a.status}</td></tr>)}
          </Table>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {([['BU', bu], ['TECH', tech]] as const).map(([aud, qs]) => (
            <div key={aud} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="font-bold text-slate-900">{AUDIENCE_LABEL[aud]} <span className="text-slate-400 font-normal">({qs.length} open)</span></div>
              {qs.length === 0 ? <div className="text-slate-400">None open.</div> : (
                <ol className="space-y-1.5 list-decimal list-inside text-[11px] text-slate-700">
                  {qs.map((q) => <li key={q.id}>{q.question} <span className={q.urgency === 'blocking' ? 'text-rose-600 font-semibold' : 'text-slate-400'}>[{q.urgency}]</span></li>)}
                </ol>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};
