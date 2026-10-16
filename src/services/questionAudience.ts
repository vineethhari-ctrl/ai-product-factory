import type { Audience, BusinessUnderstanding, ClarificationItem, EvidenceItem, OpenQuestionItem, ProductDefinition } from '../types';

/**
 * Who a question is for, so each team only gets questions it can answer:
 * - BU: business flows, rules, user journeys and KPIs, in plain business language.
 * - TECH (BA & Tech Team): data design, interfaces, architecture and system limits.
 *
 * A question goes to the BU only when it contains no technical vocabulary; anything technical
 * goes to the BA & Tech Team, whatever the model or the author declared. Shared by the server
 * (which labels every question it returns) and the browser (which labels older saved projects).
 * The term list is software vocabulary, never business-domain vocabulary.
 */

export const AUDIENCE_LABEL: Record<Audience, string> = { BU: 'BU Team', TECH: 'BA & Tech Team' };
export const AUDIENCE_HINT: Record<Audience, string> = {
  BU: 'Business flows, rules, user journeys and KPIs',
  TECH: 'Data design, interfaces, architecture and system limits',
};
export const ANSWERED_BY: Record<Audience, string> = { BU: 'Business Unit / Product Lead', TECH: 'BA / Tech Lead' };

/**
 * Words a business reader should never have to decode. Words that are also everyday business language in
 * some industries (queue, table, index, query, log, staging, repository, integration, system, SLA, server,
 * container, tenant, protocol, deploy, polling) only count inside an unmistakably technical phrase.
 */
const TECH_TERMS: RegExp[] = [
  /\bdatabases?\b/i, /\bDB\b/, /\bschemas?\b/i, /\bdata ?models?\b/i, /\b(?:primary|foreign) keys?\b/i,
  /\bdatabase (?:table|quer(?:y|ies)|column)s?\b/i, /\buuids?\b/i, /\brow[- ]level\b/i, /\bRLS\b/,
  /\bpartition(?:ed|ing)? by\b/i, /\bshard(?:s|ing)?\b/i, /\bschema migrations?\b/i, /\bnullable\b/i, /\bvarchar\b/i,
  /\benums?\b/i, /\bcrud\b/i, /\borm\b/i, /\bregex(?:es)?\b/i,
  /\bAPIs?\b/, /\bendpoints?\b/i, /\bREST(?:ful)?\b/, /\bgraphql\b/i, /\bgrpc\b/i, /\bwebhooks?\b/i, /\bwebsockets?\b/i,
  /\bJSON\b/i, /\bXML\b/, /\bSQL\b/i, /\bnosql\b/i, /\bSDKs?\b/, /\bpayloads?\b/i, /\bHTTPS?\b/i, /\b[45]xx\b/i,
  /\bstatus codes?\b/i, /\b(?:integration|network|transport) protocols?\b/i, /\bmiddleware\b/i,
  /\barchitectur(?:e|al)\b/i, /\bmicro-?services?\b/i, /\bmonolith(?:ic)?\b/i, /\bback-?end\b/i, /\bfront-?end\b/i,
  /\b(?:application|web|database|file) servers?\b/i, /\bserver-side\b/i, /\bserverless\b/i, /\bkubernetes\b/i, /\bdocker\b/i,
  /\b(?:docker|software) containers?\b/i, /\b(?:cloud|IT) infrastructure\b/i, /\b(?:code|software|release) deployments?\b/i, /\bload[- ]balanc/i, /\bscalab(?:le|ility)\b/i, /\blatency\b/i, /\bthroughput\b/i,
  /\b(?:rps|tps)\b/i, /\bconcurrency\b/i, /\brate[- ]limit/i, /\bretr(?:y|ies)\b/i, /\btimeouts?\b/i,
  /\bcircuit[- ]breaker\b/i, /\bidempoten/i, /\bcach(?:e|es|ing)\b/i, /\bmessage (?:queue|bus|broker)s?\b/i,
  /\bkafka\b/i, /\bpub\/?sub\b/i, /\bevent bus\b/i, /\bcron\b/i, /\bbatch jobs?\b/i, /\bETL\b/, /\bAPI polling\b/i,
  /\boauth2?\b/i, /\bSAML\b/i, /\bOIDC\b/i, /\bSSO\b/, /\bJWT\b/i, /\bMFA\b/, /\b(?:access|auth|bearer|session) tokens?\b/i,
  /\bencrypt(?:ion|ed)?\b/i, /\bTLS\b/, /\bSSL\b/, /\bhash(?:ing|ed)\b/i, /\bmulti-?tenan/i, /\btenant (?:keys?|ids?|isolation)\b/i,
  /\bRBAC\b/, /\bACLs?\b/, /\bci\/?cd\b/i, /\benvironment variables?\b/i, /\bsource code\b/i, /\bproduction code\b/i,
];

/** The technical terms found in a text (empty when it reads as plain business language). */
export function technicalTerms(text: string): string[] {
  const found: string[] = [];
  for (const re of TECH_TERMS) {
    const m = text.match(re);
    if (m && !found.includes(m[0].toLowerCase())) found.push(m[0].toLowerCase());
  }
  return found;
}

/** TECH when declared so or when the text uses technical vocabulary; otherwise the declared audience, else BU. */
export function resolveAudience(text: string, declared?: string): Audience {
  if (declared === 'TECH') return 'TECH';
  if (technicalTerms(text).length > 0) return 'TECH';
  return 'BU';
}

const PLAIN_IMPACT = 'The requirements for this part cannot be finalised until this is answered.';

/** Label a clarification; a BU question keeps a plain "impact if ignored" so the BU never sees jargon. */
export function labelClarification(c: ClarificationItem): ClarificationItem {
  const audience = resolveAudience(c.question, c.audience);
  const impactIfIgnored = audience === 'BU' && technicalTerms(c.impactIfIgnored ?? '').length > 0 ? PLAIN_IMPACT : c.impactIfIgnored;
  return { ...c, audience, impactIfIgnored };
}

export const labelOpenQuestion = (q: OpenQuestionItem): OpenQuestionItem => ({ ...q, audience: resolveAudience(q.question, q.audience) });

const labelGap = (g: EvidenceItem): EvidenceItem => ({ ...g, audience: resolveAudience(`${g.title} ${g.description}`, g.audience) });

interface QuestionContext {
  /** The record the product manages, e.g. "Service Request". */
  subject: string;
  /** Lifecycle stages from the brief, when known. */
  stages: string[];
  /** Main user role, when known. */
  role?: string;
  askedAt: string;
}

const lower = (s: string) => s.toLowerCase();

/** Plain business questions every product needs answered; built only from the BU's own nouns. */
export function defaultBUClarifications(ctx: QuestionContext): ClarificationItem[] {
  const s = lower(ctx.subject);
  const flow = ctx.stages.length >= 3 ? ` (${ctx.stages[0]} to ${ctx.stages[ctx.stages.length - 1]})` : '';
  const steps = ctx.stages.length >= 3 ? `stage${flow}` : 'step';
  const item = (id: string, type: ClarificationItem['type'], question: string, impactIfIgnored: string): ClarificationItem =>
    ({ id, type, question, impactIfIgnored, askedAt: ctx.askedAt, status: 'OPEN', audience: 'BU' });
  return [
    item('clr-bu-1', 'HIGH: MISSING LOGIC',
      `Who approves a ${s}, and what should happen when it is rejected: is it sent back for correction, closed, or escalated?`,
      'Without an agreed approval path, the screens and rules for decisions cannot be designed.'),
    item('clr-bu-2', 'HIGH: MISSING LOGIC',
      `How quickly must each ${steps} be completed, and who should be told when it runs late?`,
      'Without target times, late work cannot be flagged and the team cannot be held to a standard.'),
    item('clr-bu-3', 'HIGH: MISSING LOGIC',
      `Which 3 to 5 numbers will show that this is working, for example the time from start to finish of a ${s}, how many are stuck, or how many are completed each week?`,
      'Without agreed measures, the dashboards cannot show what matters to the business.'),
    item('clr-bu-4', 'BLOCKER: CONTRADICTION',
      `Can any step of a ${s} be skipped or done out of order? If so, who is allowed to do it and must they give a reason?`,
      'Without this, the process may either block legitimate exceptions or allow uncontrolled shortcuts.'),
    item('clr-bu-5', 'MEDIUM: PERMISSION GAP',
      `Which roles may view, create or change a ${s} at each ${ctx.stages.length >= 3 ? 'stage' : 'step'}${ctx.role ? `, and what should a ${ctx.role} not be able to see or change` : ''}?`,
      'Without this, people may see or change information they should not.'),
    item('clr-bu-6', 'HIGH: MISSING LOGIC',
      `What goes wrong most often today with a ${s}, and what must the new process do differently?`,
      'Without this, the new product may repeat the problems it is meant to solve.'),
  ];
}

/** Technical prerequisites the BA & Tech Team must settle before build. */
export function defaultTechClarifications(ctx: QuestionContext & { module: string; productName: string }): ClarificationItem[] {
  const item = (id: string, type: ClarificationItem['type'], question: string, impactIfIgnored: string): ClarificationItem =>
    ({ id, type, question, impactIfIgnored, askedAt: ctx.askedAt, status: 'OPEN', audience: 'TECH' });
  return [
    item('clr-dev-1', 'BLOCKER: CONTRADICTION',
      `High availability and fallback: what retry policy, timeouts and circuit-breaker limits apply when downstream integrations for ${ctx.module} return 5xx errors or time out at peak load?`,
      'Developers cannot build backend retry middleware without explicit timeout boundaries.'),
    item('clr-dev-2', 'HIGH: MISSING LOGIC',
      `Data isolation: are database records for ${ctx.subject} partitioned by tenant organisation key, or is cross-tenant read access allowed for audit roles?`,
      'Needed for schema partitioning and row-level security policies.'),
    item('clr-dev-3', 'HIGH: MISSING LOGIC',
      `Authentication: do override actions in ${ctx.module} require federated SSO (SAML/OIDC) with MFA, and which OAuth2 scopes does each role get?`,
      'Needed for identity gateway integration and token scope validation.'),
    item('clr-dev-4', 'MEDIUM: PERMISSION GAP',
      `Retention: what is the retention and purge schedule for audit logs and attachments in ${ctx.productName}, and must the audit records in the database be immutable?`,
      'Needed for scheduled retention jobs and data-governance compliance.'),
    item('clr-dev-5', 'HIGH: MISSING LOGIC',
      `Interfaces: which external systems exchange ${ctx.subject} data, through which API or file interface, in which direction and how often?`,
      'Needed to design integration contracts, error handling and data ownership.'),
  ];
}

/**
 * Give every clarification, gap and conflict an audience, and make sure each team has questions:
 * when one side is empty, the standard questions for it are added.
 */
export function withQuestionAudiences(
  u: BusinessUnderstanding,
  ctx: Omit<QuestionContext, 'askedAt'> & { module?: string; productName?: string }
): BusinessUnderstanding {
  const askedAt = u.extractedAt || new Date().toISOString();
  const labelled = (u.clarifications ?? []).map(labelClarification);
  const has = (a: Audience) => labelled.some((c) => c.audience === a);
  const full = { ...ctx, askedAt };
  const clarifications = [
    ...labelled,
    ...(has('BU') ? [] : defaultBUClarifications(full)),
    ...(has('TECH') ? [] : defaultTechClarifications({ ...full, module: ctx.module || 'the core module', productName: ctx.productName || 'the product' })),
  ];
  return {
    ...u,
    clarifications,
    missingInformation: (u.missingInformation ?? []).map(labelGap),
    conflicts: (u.conflicts ?? []).map(labelGap),
  };
}

export function definitionWithAudiences(d: ProductDefinition): ProductDefinition {
  return { ...d, openQuestions: (d.openQuestions ?? []).map(labelOpenQuestion) };
}

/** Items for one audience; items saved before audiences existed are labelled on the fly. */
export function forAudience<T extends { audience?: Audience }>(items: T[], audience: Audience, text: (t: T) => string): T[] {
  return items.filter((i) => resolveAudience(text(i), i.audience) === audience);
}
