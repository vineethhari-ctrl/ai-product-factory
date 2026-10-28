import type { ApproachNote, ProductDefinition } from '../types';
import { testSuiteSignature } from './testSuite';
import { forAudience } from './questionAudience';

/**
 * Solution Approach Note. A model writes it from the finished BRD when one is configured (server/approachNoteService.ts);
 * this file is the rules-based note that answers otherwise: derived from the BRD (no fixed wording, no domain words: every noun is the
 * definition's own). Problems come from the BRD's problem statement, the plan covers every module, risks are the
 * BRD's own plus those the definition's state implies, and the open questions become decisions with an owner and a deadline.
 */

const words = (t: string) => new Set(t.toLowerCase().match(/[a-z0-9]{5,}/g) ?? []);
const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((w) => b.has(w)).length;

const due = (u?: string) => (u === 'blocking' ? 'Before Phase 1 starts' : u === 'important' ? 'Before Phase 2 starts' : 'Before Phase 3 starts');

/** Every open question as a decision: BU Team first, then BA & Tech Team, each with a date from its urgency. */
export function decisionsFor(def: ProductDefinition): ApproachNote['decisions'] {
  const open = (def.openQuestions ?? []).filter((q) => q.status === 'open');
  return (['BU', 'TECH'] as const).flatMap((aud) =>
    forAudience(open, aud, (q) => q.question).map((q) => ({
      team: aud === 'BU' ? 'BU Team' : 'BA & Tech Team',
      neededBy: due(q.urgency),
      question: q.question,
    })));
}

export function buildApproachNote(def: ProductDefinition): ApproachNote {
  const brief = def.blueprintBrief;
  const mods = def.modules ?? [];
  const problems = def.problemStatement?.length ? def.problemStatement : brief?.painPoints ?? [];

  // Phases: modules in the order the BRD gives them (the process order), split in three; integrations follow the module they serve.
  const per = Math.max(1, Math.ceil(mods.length / 3));
  const groups = [0, 1, 2].map((i) => mods.slice(i * per, (i + 1) * per)).filter((g) => g.length);
  const integrationPhase = new Map<string, number>();
  for (const it of def.integrations ?? []) {
    const iw = words(`${it.system} ${it.purpose}`);
    let best = -1, bestScore = 0;
    groups.forEach((g, gi) => {
      const score = g.reduce((n, m) => n + overlap(iw, words(`${m.name} ${m.description}`)), 0);
      if (score > bestScore) { best = gi; bestScore = score; }
    });
    integrationPhase.set(it.system, best >= 0 ? best : Math.min(1, groups.length - 1));
  }
  const names = ['Phase 1: Foundation and first release', 'Phase 2: Core rollout', 'Phase 3: Completion and scale'];
  const phased = groups.map((g, gi) => {
    const screens = (def.screens ?? []).filter((s) => g.some((m) => m.name === s.module)).map((s) => s.name);
    const ints = (def.integrations ?? []).filter((it) => integrationPhase.get(it.system) === gi).map((it) => it.system);
    const delivers = [...screens.slice(0, 6), ...(ints.length ? [`Integrations: ${ints.join('; ')}`] : [])];
    return {
      phase: names[gi],
      focus: `${gi === 0 ? 'Set up roles and access, the shared records with their field rules and lifecycles, then ' : ''}build ${g.map((m) => m.name).join('; ')}.`,
      timeline: `Sprint ${gi * 3 + 1} - ${gi * 3 + 3} (indicative; the delivery team sizes it)`,
      delivers,
    };
  });

  const lifecycles = def.dataEntities.filter((e) => e.lifecycle).length;
  const architecture: string[] = [
    ...mods.map((m) => `${m.name}: ${m.description}`),
    `Access: ${def.personas.length} roles (${def.personas.map((p) => p.name).join(', ')}), each limited to the records and actions in its permissions.`,
    `Records: ${def.dataEntities.length} (${def.dataEntities.map((e) => e.name).join(', ')}), each with field constraints; ${lifecycles === 0 ? 'none has' : lifecycles === 1 ? '1 has' : `${lifecycles} have`} a status lifecycle that rejects forbidden changes.`,
    `Rules: ${def.businessRules.length} business rules enforced by the platform; ${def.businessRules.filter((r) => r.confidence === 'CONFIRMED').length} stated by the BU, ${def.businessRules.filter((r) => r.confidence === 'INFERRED').length} proposed by the AI.`,
    ...(def.integrations?.length ? [`Integrations: ${def.integrations.map((i) => `${i.system} (${i.protocol})`).join('; ')}.`] : []),
  ];

  const risks: ApproachNote['keyRisksAndMitigations'] = (def.risks ?? []).map((r) => ({ risk: r.risk, impact: r.impact, mitigation: r.mitigation }));
  const inferredRules = def.businessRules.filter((r) => r.confidence !== 'CONFIRMED').length;
  const open = (def.openQuestions ?? []).filter((q) => q.status === 'open');
  const blocking = open.filter((q) => q.urgency === 'blocking');
  if (inferredRules > 0) {
    risks.push({
      risk: `${inferredRules} of ${def.businessRules.length} business rules, and the figures in them, were proposed by the AI and not stated by the BU.`,
      impact: 'A wrong figure or rule is built into screens, tests and the engineering plan, and costs rework later.',
      mitigation: 'The BU reviews each INFERRED rule and figure in the BRD and confirms, corrects or removes it before Phase 1 sign-off.',
    });
  }
  if (blocking.length) {
    risks.push({
      risk: `${blocking.length} open question(s) are marked blocking.`,
      impact: 'The scope or rules they decide cannot be frozen until they are answered.',
      mitigation: 'Each has an owner and a date in "Decisions needed" below; no phase starts on an unanswered blocking question.',
    });
  }
  if ((def.integrations?.length ?? 0) > 0) {
    risks.push({
      risk: `${def.integrations.length} external systems must work with the platform (${def.integrations.map((i) => i.system).join('; ')}).`,
      impact: 'Each partner system sets its own formats, access rules and test windows; a late one delays its phase.',
      mitigation: 'Name an owner and a test environment for each in Phase 1; build each against an agreed contract so work does not wait for the partner.',
    });
  }
  const crossRules = def.dataEntities.reduce((n, e) => n + (e.crossRecordRules?.length ?? 0), 0);
  if (crossRules > 0) {
    risks.push({
      risk: `${crossRules} rule(s) need stored data (uniqueness, capacity, references) and cannot be checked from one record alone.`,
      impact: 'They are not covered by the stateless record check and are easy to miss.',
      mitigation: 'The back end enforces each in the database; the test suite has a case for each.',
    });
  }

  const decisions = decisionsFor(def);

  return {
    origin: 'OFFLINE',
    basedOn: testSuiteSignature(def),
    docId: `APN-${(def.productName || 'SYS').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()}-01`,
    status: 'DRAFT FOR ARCHITECTURE REVIEW',
    executiveSummary: def.objective,
    asIsProblemStatement: problems.length ? problems : ['The BU has not stated the problems yet; the BRD\'s open questions ask for them.'],
    assumptions: (def.assumptions ?? []).map((a) => `${a.statement} (risk ${a.riskLevel})`),
    toBeTargetArchitecture: architecture,
    alternatives: [],
    phasedExecutionStrategy: phased,
    keyRisksAndMitigations: risks,
    decisions,
  };
}

export function approachNoteText(def: ProductDefinition, n: ApproachNote = buildApproachNote(def)): string {
  const list = (items: string[]) => items.map((x) => `• ${x}`).join('\n');
  return [
    `=== SOLUTION APPROACH NOTE: ${def.productName} ===\nDoc ID: ${n.docId} | Version: ${def.version}`,
    `1. EXECUTIVE SUMMARY\n${n.executiveSummary}`,
    `2. PROBLEMS TODAY\n${list(n.asIsProblemStatement)}`,
    n.assumptions.length ? `3. ASSUMPTIONS (to be confirmed by the BU)\n${list(n.assumptions)}` : '',
    `4. PROPOSED SOLUTION\n${list(n.toBeTargetArchitecture)}`,
    n.alternatives.length ? `4b. OPTIONS CONSIDERED\n${n.alternatives.map((a) => `• ${a.option}\n   Trade-off: ${a.tradeoff}\n   Proposed: ${a.recommendation}`).join('\n')}` : '',
    `5. PHASED ROLLOUT\n${n.phasedExecutionStrategy.map((p) => `${p.phase} (${p.timeline})\n   ${p.focus}${p.delivers.length ? `\n   Delivers: ${p.delivers.join('; ')}` : ''}${p.exitCriteria?.length ? `\n   Done when: ${p.exitCriteria.join('; ')}` : ''}`).join('\n')}`,
    `6. RISKS & MITIGATIONS\n${n.keyRisksAndMitigations.map((r) => `Risk: ${r.risk}${r.impact ? `\nImpact: ${r.impact}` : ''}\nMitigation: ${r.mitigation}`).join('\n\n')}`,
    n.decisions.length ? `7. DECISIONS NEEDED\n${n.decisions.map((d) => `• [${d.team}, ${d.neededBy}] ${d.question}${d.recommendation ? `\n   Proposed answer: ${d.recommendation}` : ''}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

/** The note to show: the stored one when it was written for this BRD, else the rules-based note. */
export function currentApproachNote(def: ProductDefinition): ApproachNote {
  return def.approachNote && def.approachNote.basedOn === testSuiteSignature(def) ? def.approachNote : buildApproachNote(def);
}
