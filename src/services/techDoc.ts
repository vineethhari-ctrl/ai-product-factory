import type { EngineeringPlan, ProductDefinition, TestSuite } from '../types';
import type { Block, Section } from './docRender';

/**
 * The team's technical documents as sections (docRender.ts), so they can be downloaded as Word like the BRD and the proposal:
 * the test suite (use cases, scenario matrix, test cases, Gherkin) and the engineering plan (architecture, services, API
 * contracts, events, quality targets, security, integrations, backlog, deployment, risks, test strategy).
 * Written for the delivery team: no commercial information. Domain-neutral.
 */

const p = (text: string, bold = false): Block => ({ kind: 'p', text, ...(bold ? { bold: true } : {}) });
const ul = (items: string[]): Block => ({ kind: 'ul', items });
const table = (head: string[], rows: string[][], extra: Partial<Extract<Block, { kind: 'table' }>> = {}): Block => ({ kind: 'table', head, rows, ...extra });
const numbered = (steps: string[]) => steps.map((s, i) => `${i + 1}. ${s.replace(/^\s*\d+[.)]\s*/, '')}`).join('\n');
const dash = (s: string | undefined) => (s && s.trim() ? s : '-');
const list = (xs: string[] | undefined) => (xs && xs.length ? xs.join('; ') : '-');

/** The test suite as a document. */
export function testSuiteSections(def: ProductDefinition, suite: TestSuite): Section[] {
  const s: Section[] = [];
  const c = suite.coverage;
  s.push({ id: 'about', title: 'About this test suite', blocks: [
    p(`${suite.origin === 'AI' ? 'Written by the AI from the BRD.' : 'Derived from the BRD by rules.'} ${suite.useCases.length} use case${suite.useCases.length === 1 ? '' : 's'}, ${suite.scenarios.length} scenario${suite.scenarios.length === 1 ? '' : 's'} and ${suite.testCases.length} test case${suite.testCases.length === 1 ? '' : 's'} for ${def.productName} (${def.version}).`),
    table(['What the suite proves', 'Covered', 'Of'], [
      ['Business rules', String(c.rulesCovered), String(c.rulesTotal)],
      ['Journeys', String(c.journeysCovered), String(c.journeysTotal)],
      ['Records', String(c.entitiesCovered), String(c.entitiesTotal)],
    ]),
    ...(suite.addedForCoverage?.length ? [p(`Added so that every rule is tested: ${suite.addedForCoverage.join(', ')}.`)] : []),
  ] });

  s.push({ id: 'usecases', title: 'Use cases', blocks: suite.useCases.flatMap((u): Block[] => [
    p(`${u.id}: ${u.title}`, true),
    table(['', 'Detail'], [
      ['Main actor', u.primaryActor + (u.secondaryActors?.length ? ` (with ${u.secondaryActors.join(', ')})` : '')],
      ['Before', dash(u.preCondition)], ['Starts when', dash(u.trigger)],
      ['Main flow', numbered(u.mainFlow)],
      ['Other flows', u.alternativeFlows?.length ? u.alternativeFlows.map((a) => `${a.step}: ${a.action}`).join('\n') : '-'],
      ['After', dash(u.postCondition)], ['Traces to', dash(u.sourceTraceability)],
    ]),
  ]) });

  s.push({ id: 'scenarios', title: 'Scenario matrix', blocks: [
    table(['ID', 'Type', 'Module', 'What is tested', 'Risk', 'Rule', 'How it is verified'],
      suite.scenarios.map((x) => [x.id, x.type, x.module, `${x.objective}${x.testVector ? ` (${x.testVector})` : ''}`, x.riskRating, dash(x.ruleCode), dash(x.verificationMethod)])),
  ] });

  s.push({ id: 'testcases', title: 'Test cases', blocks: suite.testCases.flatMap((t): Block[] => [
    p(`${t.id}: ${t.title}`, true),
    table(['', 'Detail'], [
      ['Type and module', `${t.vector} / ${t.targetModule}`],
      ['Set-up', dash(t.preconditions)],
      ['Test data', dash(t.testPayload)],
      ['Steps', numbered(t.executionSteps)],
      ['Expected result', dash(t.expectedResult)],
      ['Traces to', list(t.traces)],
    ]),
  ]) });

  if (suite.gherkinFeature?.trim()) s.push({ id: 'gherkin', title: 'Automated checks (Gherkin feature)', blocks: [p('The same scenarios as a feature file for an automated test tool.'), p(suite.gherkinFeature.trim())] });
  return s;
}

/** The engineering plan as a document. */
export function engineeringSections(def: ProductDefinition, plan: EngineeringPlan): Section[] {
  const s: Section[] = [];
  s.push({ id: 'architecture', title: 'Architecture', blocks: [p(`${plan.origin === 'AI' ? 'Written by the AI from the BRD.' : 'Derived from the BRD by rules.'} ${def.productName} (${def.version}).`), p(plan.architectureOverview)] });
  if (plan.services.length) s.push({ id: 'services', title: 'Services', blocks: [table(['Service', 'Responsibility', 'Owns', 'Exposes', 'Depends on'], plan.services.map((x) => [x.name, x.responsibility, list(x.owns), list(x.exposes), list(x.dependsOn)]))] });
  if (plan.apiContracts?.length) {
    s.push({ id: 'api', title: 'API contracts', blocks: [
      table(['Method', 'Endpoint', 'What it does'], plan.apiContracts.map((a) => [a.method, a.endpoint, a.description])),
      ...plan.apiContracts.flatMap((a): Block[] => [p(`${a.method} ${a.endpoint}`, true), table(['Request example', 'Response example'], [[dash(a.requestBodySample), dash(a.responseBodySample)]])]),
    ] });
  }
  if (plan.events.length) s.push({ id: 'events', title: 'Events', blocks: [table(['Event', 'Sent by', 'Received by', 'Example payload'], plan.events.map((e) => [e.name, e.producer, list(e.consumers), dash(e.payloadSample)]))] });
  if (plan.nonFunctional.length) s.push({ id: 'quality', title: 'Quality targets', blocks: [table(['Area', 'Requirement', 'Target', 'How it is verified'], plan.nonFunctional.map((n) => [n.area, n.requirement, n.target, n.howVerified]))] });
  if (plan.security.length) s.push({ id: 'security', title: 'Security controls', blocks: [ul(plan.security)] });
  if (plan.integrationContracts.length) s.push({ id: 'integrations', title: 'Integration contracts', blocks: [table(['System', 'Direction', 'Protocol', 'Data exchanged', 'If it fails'], plan.integrationContracts.map((i) => [i.system, i.direction, i.protocol, i.dataExchanged, i.failureHandling]))] });
  if (plan.backlog.length) {
    s.push({ id: 'backlog', title: 'Backlog', blocks: plan.backlog.flatMap((e): Block[] => [
      p(e.epic, true),
      table(['Story', 'Accepted when', 'Traces to'], e.stories.map((st) => [st.title, st.acceptance.map((a) => `- ${a}`).join('\n'), list(st.traces)])),
    ]) });
  }
  if (plan.deployment.length) s.push({ id: 'deployment', title: 'Deployment', blocks: [ul(plan.deployment)] });
  if (plan.risks.length) s.push({ id: 'risks', title: 'Risks', blocks: [table(['Risk', 'Impact', 'What to do'], plan.risks.map((r) => [r.risk, r.impact, r.mitigation]))] });
  if (plan.testStrategy.length) s.push({ id: 'teststrategy', title: 'Test strategy', blocks: [ul(plan.testStrategy)] });
  return s;
}
