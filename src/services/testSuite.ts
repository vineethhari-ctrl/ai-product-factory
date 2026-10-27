import type {
  DataEntityDefinition,
  DataFieldDefinition,
  ProductDefinition,
  TestCase,
  TestScenario,
  TestSuite,
  TestUseCase,
  TestVector,
} from '../types';
import { allowedTransitions, resolveFieldConstraints, withSystemFields } from './validationEngine';

/**
 * Test suite derived from the BRD by rules. Domain-neutral: every name, rule, field and status comes from the
 * definition. It is the baseline when no model is configured, and the coverage guarantee for a model's suite
 * (`ensureCoverage`): no business rule, journey or record is left without a test.
 */

const MAX_SCENARIOS = 44;
const MAX_CASES = 40;

const businessFields = (e: DataEntityDefinition): DataFieldDefinition[] => withSystemFields(e).fields.filter((f) => f.source !== 'system');
const pad = (n: number, w = 3) => String(n).padStart(w, '0');
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const lc = (s: string) => (/^[A-Z0-9]{2,}/.test(s) || /[a-z][A-Z]/.test(s.split(' ')[0]) ? s : s.charAt(0).toLowerCase() + s.slice(1));

/** A realistic value that satisfies the field's constraints. */
export function sampleValue(f: DataFieldDefinition): unknown {
  const c = resolveFieldConstraints(f);
  if (c.enumValues?.length) return c.enumValues[0];
  switch (c.format) {
    case 'email': return 'user@example.com';
    case 'phone': return '+91 98765 43210';
    case 'url': return 'https://example.com/ref/1';
    case 'uuid': return '3f2b8c1e-5d4a-4e9b-8a77-1c2d3e4f5a6b';
    case 'date': return '2026-01-15';
    case 'datetime': return '2026-01-15T09:30:00Z';
    case 'time': return '09:30';
    case 'integer': return Math.round(((c.min ?? 1) + (c.max ?? (c.min ?? 1) + 99)) / 2);
    case 'decimal': return Number((((c.min ?? 1) + (c.max ?? (c.min ?? 1) + 99)) / 2).toFixed(c.precision ?? 2));
    case 'percentage': return 50;
    case 'boolean': return true;
    case 'currency-code': return 'INR';
    case 'country-code': return 'IN';
    case 'postal-code': return '411001';
    case 'identifier': return 'ID-0001'.slice(0, c.maxLength ?? 7);
    default: {
      const base = `${f.name} sample`;
      const min = c.minLength ?? 0;
      return clip(base.length >= min ? base : base.padEnd(min, 'x'), c.maxLength ?? 120);
    }
  }
}

/** A complete valid record for the entity: every required field, plus a few optional ones. */
export function sampleRecord(e: DataEntityDefinition): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const fields = businessFields(e);
  for (const f of fields.filter((x) => x.required)) out[f.name] = sampleValue(f);
  for (const f of fields.filter((x) => !x.required).slice(0, 2)) out[f.name] = sampleValue(f);
  return out;
}

interface Breaker { field: DataFieldDefinition; value: unknown; why: string; boundary: boolean }

/** Values that break one field's constraint, and values exactly on its limit. */
function breakers(f: DataFieldDefinition): Breaker[] {
  const c = resolveFieldConstraints(f);
  const out: Breaker[] = [];
  if (c.maxLength !== undefined && c.maxLength > 0 && c.maxLength < 5000) {
    out.push({ field: f, value: 'x'.repeat(c.maxLength), why: `exactly ${c.maxLength} characters is accepted`, boundary: true });
    out.push({ field: f, value: 'x'.repeat(c.maxLength + 1), why: `${c.maxLength + 1} characters is rejected (maximum ${c.maxLength})`, boundary: true });
  }
  if (c.minLength !== undefined && c.minLength > 1) out.push({ field: f, value: 'x'.repeat(c.minLength - 1), why: `${c.minLength - 1} characters is rejected (minimum ${c.minLength})`, boundary: true });
  if (c.max !== undefined) {
    out.push({ field: f, value: c.max, why: `the maximum ${c.max} is accepted`, boundary: true });
    out.push({ field: f, value: c.max + (c.precision ? Math.pow(10, -c.precision) : 1), why: `a value above ${c.max} is rejected`, boundary: true });
  }
  if (c.min !== undefined) out.push({ field: f, value: c.min - (c.precision ? Math.pow(10, -c.precision) : 1), why: `a value below ${c.min} is rejected`, boundary: true });
  if (c.enumValues?.length) out.push({ field: f, value: 'NOT_AN_OPTION', why: `a value outside the ${c.enumValues.length} allowed options is rejected`, boundary: false });
  if (c.format && ['email', 'phone', 'url', 'date', 'datetime', 'uuid', 'postal-code'].includes(c.format)) out.push({ field: f, value: 'not-a-valid-value', why: `an invalid ${c.format} is rejected`, boundary: false });
  if (f.required) out.push({ field: f, value: '', why: 'an empty value is rejected because the field is required', boundary: false });
  return out;
}

const moduleForContext = (def: ProductDefinition, context: string): string => {
  const ctx = (context || '').toLowerCase();
  const screen = ctx ? def.screens.find((s) => s.name.toLowerCase().includes(ctx) || ctx.includes(s.name.toLowerCase())) : undefined;
  if (screen) return screen.module;
  const mod = ctx ? def.modules.find((m) => m.name.toLowerCase().includes(ctx)) : undefined;
  return mod?.name ?? def.modules[0]?.name ?? def.productName;
};

const mainEntity = (def: ProductDefinition): DataEntityDefinition | undefined =>
  def.dataEntities.find((e) => e.lifecycle) ?? def.dataEntities[0];

const entityFor = (def: ProductDefinition, text: string): DataEntityDefinition | undefined => {
  const t = text.toLowerCase();
  return def.dataEntities.find((e) => t.includes(e.name.toLowerCase())) ?? mainEntity(def);
};

/** Two scenarios for one business rule: it holds, and it is violated. */
export function scenariosForRule(def: ProductDefinition, rule: ProductDefinition['businessRules'][number]): Array<Omit<TestScenario, 'id'>> {
  const module = moduleForContext(def, rule.context);
  const risk: TestScenario['riskRating'] = rule.confidence === 'CONFIRMED' ? 'CRITICAL' : 'HIGH';
  const code = rule.code || 'BR';
  return [
    { type: 'POSITIVE', module, objective: `${code} holds: ${rule.rule}`, testVector: `Input that satisfies the rule (context: ${rule.context || 'general'})`, riskRating: risk, ruleCode: code, verificationMethod: 'Automated end-to-end test' },
    { type: 'NEGATIVE', module, objective: `${code} is enforced: an input that breaks "${clip(rule.rule, 90)}" is rejected`, testVector: `Input that violates the rule (context: ${rule.context || 'general'})`, riskRating: risk, ruleCode: code, verificationMethod: 'Automated end-to-end test, including the message shown to the user' },
  ];
}

function buildUseCases(def: ProductDefinition): TestUseCase[] {
  const rules = def.businessRules;
  const first = def.screens[0]?.name ?? 'the first screen';
  const journeys = def.userJourneys.length ? def.userJourneys : [];
  return journeys.slice(0, 12).map((j, i) => {
    const involved = def.personas.filter((p) => p.name !== j.persona && j.steps.some((s) => s.toLowerCase().includes(p.name.toLowerCase()))).map((p) => p.name);
    const relevant = rules.filter((r) => j.steps.some((s) => r.context && s.toLowerCase().includes(r.context.toLowerCase().split(' ')[0]))).slice(0, 2);
    const guards = (relevant.length ? relevant : rules.slice(0, 1)).map((r) => ({
      step: `When rule ${r.code} is not satisfied`,
      action: `The product stops the step, leaves the record unchanged and tells the user which rule applies: "${r.rule}"`,
    }));
    return {
      id: `UC-${pad(i + 1)}`,
      title: j.name,
      primaryActor: j.persona || def.personas[0]?.name || 'User',
      secondaryActors: [...involved, ...def.integrations.slice(0, 1).map((x) => x.system)].slice(0, 3),
      preCondition: `${j.persona || 'The user'} is signed in with access to ${first}, and the record is ready for the first step.`,
      trigger: j.steps[0] ?? 'The user starts the journey.',
      mainFlow: j.steps.length ? j.steps : [`Open ${first}`, 'Complete the step', 'Confirm the result'],
      alternativeFlows: [...guards, { step: 'When the user lacks permission for the step', action: 'The product refuses the action, keeps the record unchanged and records the attempt in the audit trail.' }],
      postCondition: j.outcome || 'The journey completes and the record shows its new status.',
      sourceTraceability: [j.id, ...relevant.map((r) => r.code)].filter(Boolean).join(' · '),
    };
  });
}

function buildScenarios(def: ProductDefinition): Array<Omit<TestScenario, 'id'>> {
  const out: Array<Omit<TestScenario, 'id'>> = [];
  for (const r of def.businessRules) out.push(...scenariosForRule(def, r));

  // Lifecycle: the valid path, and a skipped status.
  for (const e of def.dataEntities.filter((x) => x.lifecycle)) {
    const lc2 = e.lifecycle!;
    const path: string[] = [lc2.initial];
    for (let guard = 0; guard < 24; guard++) {
      const next = allowedTransitions(lc2, path[path.length - 1]).find((s) => !path.includes(s) && !/hold|cancel|reject|closed|abandon/i.test(s)) ?? allowedTransitions(lc2, path[path.length - 1]).find((s) => !path.includes(s));
      if (!next) break;
      path.push(next);
    }
    out.push({ type: 'POSITIVE', module: e.name, objective: `A ${lc(e.name)} moves through its statuses in order: ${path.join(' → ')}`, testVector: 'One allowed status change at a time', riskRating: 'HIGH', ruleCode: 'LIFECYCLE', verificationMethod: 'Automated end-to-end test' });
    if (path.length >= 3) out.push({ type: 'NEGATIVE', module: e.name, objective: `Skipping a status is rejected: ${path[0]} directly to ${path[2]}`, testVector: 'A status change the lifecycle does not allow', riskRating: 'CRITICAL', ruleCode: 'LIFECYCLE', verificationMethod: 'Automated API test' });
  }

  // Field limits: the most constrained fields first.
  const limitScenarios: Array<Omit<TestScenario, 'id'>> = [];
  for (const e of def.dataEntities) {
    for (const f of businessFields(e).filter((x) => x.required || resolveFieldConstraints(x).enumValues)) {
      const b = breakers(f).filter((x) => x.boundary).slice(0, 2);
      if (b.length) limitScenarios.push({ type: 'BOUNDARY', module: e.name, objective: `${e.name}: field "${f.name}" at its limits (${b.map((x) => x.why).join('; ')})`, testVector: `${f.name} on and just past its limit`, riskRating: 'MEDIUM', ruleCode: 'VALIDATION', verificationMethod: 'Automated API test' });
    }
  }
  out.push(...limitScenarios.slice(0, 6));

  // Required and format checks on the main record.
  const main = mainEntity(def);
  if (main) {
    const req = businessFields(main).filter((f) => f.required);
    if (req.length) out.push({ type: 'NEGATIVE', module: main.name, objective: `A ${lc(main.name)} without "${req[0].name}" is rejected with a message naming the field`, testVector: `${req[0].name} left empty`, riskRating: 'HIGH', ruleCode: 'VALIDATION', verificationMethod: 'Automated UI and API test' });
  }

  // Permissions: read-only and restricted roles cannot change records.
  for (const p of def.permissions.filter((x) => x.accessLevel === 'Read Only' || x.accessLevel === 'Restricted Segment').slice(0, 2)) {
    out.push({ type: 'NEGATIVE', module: def.modules[0]?.name ?? def.productName, objective: `${p.role} (${p.accessLevel}) cannot change a record outside what the role may do`, testVector: `Write attempt as ${p.role}`, riskRating: 'CRITICAL', ruleCode: 'ACCESS', verificationMethod: 'Automated security test' });
  }

  // Integrations: the product keeps working when another system does not.
  for (const i of def.integrations.slice(0, 3)) {
    out.push({ type: 'EDGE', module: def.modules[0]?.name ?? def.productName, objective: `When ${i.system} is unavailable the product keeps the record, retries, and tells the user what is pending`, testVector: `${i.system} times out, then recovers`, riskRating: 'HIGH', ruleCode: 'INTEGRATION', verificationMethod: 'Resilience test with a stubbed system' });
  }

  // Audit trail.
  out.push({ type: 'POSITIVE', module: def.modules[0]?.name ?? def.productName, objective: 'Every change records who made it, when, and the old and new values; the trail cannot be edited', testVector: 'One create, one change, one status change', riskRating: 'HIGH', ruleCode: 'AUDIT', verificationMethod: 'Automated end-to-end test' });
  return out.slice(0, MAX_SCENARIOS);
}

const stepsFor = (vector: TestVector, role: string, screen: string, entity: string, what: string, rule?: { code: string; rule: string }): string[] => {
  switch (vector) {
    case 'NEGATIVE': return [`Sign in as ${role}.`, `Open ${screen}.`, rule ? `Arrange the condition that breaks rule ${rule.code} ("${clip(rule.rule, 110)}"), then submit the ${entity} using the payload below.` : `Submit the ${entity} using the payload below, which breaks the rule under test.`, 'Observe the response and the message shown to the user.', `Open the ${entity} list and confirm no new or changed ${entity} exists.`];
    case 'BOUNDARY': return [`Sign in as ${role}.`, `Open ${screen}.`, 'Submit the payload with the value on the limit, and confirm it is accepted.', 'Submit the payload with the value just past the limit.', 'Confirm the second submission is rejected and the message names the field and its limit.'];
    case 'EDGE': return [`Sign in as ${role}.`, `Set up the condition: ${what}`, `Perform the ${entity} action on ${screen}.`, 'Restore normal conditions.', 'Confirm nothing was lost, nothing was duplicated, and the user was told what happened.'];
    default: return [`Sign in as ${role}.`, `Open ${screen}.`, `Submit the ${entity} using the payload below.`, 'Confirm the product accepts it and shows the new status.', 'Open the audit trail and confirm the action was recorded with the user and time.'];
  }
};

function buildTestCases(def: ProductDefinition, scenarios: TestScenario[]): TestCase[] {
  const out: TestCase[] = [];
  const role = (def.personas.find((p) => !/auditor|admin/i.test(p.role))?.name) ?? def.personas[0]?.name ?? 'User';
  const screenOf = (module: string) => def.screens.find((s) => s.module === module)?.name ?? def.screens[0]?.name ?? 'the main screen';
  for (const s of scenarios.slice(0, MAX_CASES)) {
    const entity = entityFor(def, `${s.module} ${s.objective}`);
    const payload: Record<string, unknown> = entity ? sampleRecord(entity) : {};
    let note = '';
    // Only a field-limit test can say which value breaks it; a rule test needs the tester to arrange its condition.
    if (entity && (s.type === 'NEGATIVE' || s.type === 'BOUNDARY') && s.ruleCode === 'VALIDATION') {
      const fields = businessFields(entity);
      const target = s.ruleCode === 'VALIDATION' ? fields.find((f) => s.objective.includes(`"${f.name}"`)) ?? fields.find((f) => f.required) : fields.find((f) => f.required);
      const b = target ? breakers(target) : [];
      const pick = s.type === 'BOUNDARY' ? b.filter((x) => x.boundary).slice(-1)[0] : b.find((x) => !x.boundary) ?? b[0];
      if (pick) { payload[pick.field.name] = pick.value; note = pick.why; }
    }
    const rule = def.businessRules.find((r) => r.code === s.ruleCode);
    out.push({
      id: `TC-${pad(out.length + 1)}`,
      title: s.objective,
      vector: s.type,
      targetModule: s.module,
      preconditions: `${role} is signed in. ${entity ? `A ${lc(entity.name)} exists or can be created.` : ''} ${rule ? `Rule ${rule.code} applies.` : ''}`.trim(),
      testPayload: JSON.stringify(payload, null, 2),
      executionSteps: stepsFor(s.type, role, screenOf(s.module), entity?.name ?? 'record', s.testVector, rule),
      expectedResult: s.type === 'POSITIVE'
        ? `The action succeeds. ${rule ? `Rule ${rule.code} is satisfied: ${clip(rule.rule, 140)}` : s.objective}`
        : s.type === 'BOUNDARY'
          ? `On the limit the action succeeds; past it the action is rejected. ${note}`.trim()
          : s.type === 'EDGE'
            ? 'No data is lost or duplicated, the user is told what is pending, and the product recovers without manual repair.'
            : `The action is rejected, nothing is saved, and the message names the problem. ${rule ? `Rule ${rule.code}: ${clip(rule.rule, 120)}` : note}`.trim(),
      passStatus: 'READY',
      traces: [s.ruleCode, s.module].filter(Boolean),
    });
  }
  return out;
}

function buildGherkin(def: ProductDefinition, scenarios: TestScenario[]): string {
  const persona = def.personas.find((p) => !/auditor|admin/i.test(p.role))?.name ?? def.personas[0]?.name ?? 'User';
  const main = mainEntity(def);
  const lines: string[] = [
    `@product @version-${(def.version || 'v1.0').replace(/^v/, '')}`,
    `Feature: ${def.productName} - business rules and workflow`,
    `  As a ${persona}`,
    `  I want the product to enforce the rules the business agreed`,
    `  So that the process runs as specified.`,
    '',
    '  Background:',
    `    Given ${def.productName} is running`,
    `    And I am signed in as "${persona}"`,
    '',
  ];
  for (const r of def.businessRules.slice(0, 12)) {
    const entity = entityFor(def, r.context)?.name ?? 'record';
    lines.push(`  @rule @${(r.code || 'rule').toLowerCase()} @${r.confidence === 'CONFIRMED' ? 'confirmed' : 'inferred'}`);
    lines.push(`  Scenario: ${r.code} - ${clip(r.rule.replace(/[.]+$/, ''), 100)}`);
    lines.push(`    Given a ${lc(entity)} at the stage "${r.context || 'any'}"`);
    lines.push('    When I perform an action that breaks this rule');
    lines.push(`    Then the product rejects the action and shows the rule: "${clip(r.rule, 110)}"`);
    lines.push(`    And the ${lc(entity)} is unchanged`);
    lines.push('');
  }
  if (main?.lifecycle) {
    const lcn = main.lifecycle;
    const rows: string[] = [];
    for (const from of lcn.states.slice(0, 8)) for (const to of allowedTransitions(lcn, from).slice(0, 2)) rows.push(`      | ${from} | ${to} | allowed |`);
    const bad = lcn.states.length >= 3 ? `      | ${lcn.states[0]} | ${lcn.states[lcn.states.length > 3 ? 3 : 2]} | rejected |` : '';
    lines.push('  @lifecycle');
    lines.push(`  Scenario Outline: ${main.name} status changes follow the lifecycle`);
    lines.push(`    Given a ${lc(main.name)} with status "<from>"`);
    lines.push('    When I change its status to "<to>"');
    lines.push('    Then the change is "<result>"');
    lines.push('');
    lines.push('    Examples:');
    lines.push('      | from | to | result |');
    lines.push(...rows.slice(0, 8), ...(bad ? [bad] : []));
    lines.push('');
  }
  if (main) {
    const rows: string[] = [];
    for (const f of businessFields(main).filter((x) => x.required).slice(0, 4)) {
      for (const b of breakers(f).slice(0, 2)) rows.push(`      | ${f.name} | ${JSON.stringify(b.value).slice(0, 40)} | ${b.why.includes('rejected') ? 'rejected' : 'accepted'} |`);
    }
    if (rows.length) {
      lines.push('  @validation @boundary');
      lines.push(`  Scenario Outline: ${main.name} field limits`);
      lines.push(`    When I submit a ${lc(main.name)} with "<field>" set to <value>`);
      lines.push('    Then the submission is <result>');
      lines.push('');
      lines.push('    Examples:');
      lines.push('      | field | value | result |');
      lines.push(...rows.slice(0, 10));
      lines.push('');
    }
  }
  const denied = def.permissions.filter((p) => p.accessLevel === 'Read Only')[0];
  if (denied) {
    lines.push('  @access');
    lines.push(`  Scenario: ${denied.role} cannot change records`);
    lines.push(`    Given I am signed in as "${denied.role}"`);
    lines.push('    When I try to change a record');
    lines.push('    Then the product refuses the action');
    lines.push('    And the attempt is recorded in the audit trail');
  }
  void scenarios;
  return lines.join('\n').trim();
}

/** What the suite proves about the BRD. */
export function computeCoverage(def: ProductDefinition, suite: Pick<TestSuite, 'scenarios' | 'testCases' | 'useCases'>): TestSuite['coverage'] {
  const codes = new Set<string>();
  for (const s of suite.scenarios) codes.add(s.ruleCode);
  for (const t of suite.testCases) for (const x of t.traces ?? []) codes.add(x);
  const text = JSON.stringify([suite.scenarios, suite.testCases]).toLowerCase();
  const journeyIds = new Set(suite.useCases.flatMap((u) => u.sourceTraceability.split(/[·,\s]+/)));
  const journeysCovered = def.userJourneys.filter((j) => journeyIds.has(j.id) || suite.useCases.some((u) => u.title.toLowerCase() === j.name.toLowerCase())).length;
  return {
    rulesTotal: def.businessRules.length,
    rulesCovered: def.businessRules.filter((r) => codes.has(r.code)).length,
    journeysTotal: def.userJourneys.length,
    journeysCovered,
    entitiesTotal: def.dataEntities.length,
    entitiesCovered: def.dataEntities.filter((e) => text.includes(e.name.toLowerCase())).length,
  };
}

/** Add a scenario and a test case for every business rule the suite does not cover, so nothing is left unproven. */
export function ensureCoverage(def: ProductDefinition, suite: TestSuite): TestSuite {
  const covered = new Set<string>([...suite.scenarios.map((s) => s.ruleCode), ...suite.testCases.flatMap((t) => t.traces ?? [])]);
  const missing = def.businessRules.filter((r) => !covered.has(r.code));
  if (!missing.length) return { ...suite, coverage: computeCoverage(def, suite) };
  const scenarios = [...suite.scenarios];
  for (const r of missing) for (const s of scenariosForRule(def, r)) scenarios.push({ ...s, id: `SCN-${pad(scenarios.length + 1)}` });
  const added = scenarios.slice(suite.scenarios.length);
  const extraCases = buildTestCases(def, added).map((t, i) => ({ ...t, id: `TC-${pad(suite.testCases.length + i + 1)}` }));
  const next: TestSuite = { ...suite, scenarios, testCases: [...suite.testCases, ...extraCases], addedForCoverage: missing.map((r) => r.code) };
  return { ...next, coverage: computeCoverage(def, next) };
}

/** Fingerprint of what the tests depend on: rules, journeys, records, access and systems. */
export function testSuiteSignature(def: ProductDefinition): string {
  const text = JSON.stringify([
    def.version,
    def.businessRules.map((r) => [r.code, r.rule, r.context]),
    def.userJourneys.map((j) => [j.id, j.name, j.steps]),
    def.dataEntities.map((e) => [e.name, e.fields.map((f) => f.name), e.lifecycle?.states]),
    def.permissions.map((p) => [p.role, p.accessLevel]),
    def.integrations.map((i) => i.system),
  ]);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `s${(h >>> 0).toString(36)}`;
}

/** The suite to show: the stored one when it was written for this BRD, else the rules-based suite. */
export function currentTestSuite(def: ProductDefinition): TestSuite {
  return def.testSuite && def.testSuite.basedOn === testSuiteSignature(def) ? def.testSuite : buildTestSuite(def);
}

/** The offline test suite for a definition. */
export function buildTestSuite(def: ProductDefinition): TestSuite {
  const scenarios: TestScenario[] = buildScenarios(def).map((s, i) => ({ ...s, id: `SCN-${pad(i + 1)}` }));
  const useCases = buildUseCases(def);
  const testCases = buildTestCases(def, scenarios);
  const suite: TestSuite = {
    origin: 'OFFLINE',
    generatedAt: new Date().toISOString(),
    basedOn: testSuiteSignature(def),
    useCases,
    scenarios,
    testCases,
    gherkinFeature: buildGherkin(def, scenarios),
    coverage: { rulesTotal: 0, rulesCovered: 0, journeysTotal: 0, journeysCovered: 0, entitiesTotal: 0, entitiesCovered: 0 },
  };
  return { ...suite, coverage: computeCoverage(def, suite) };
}
