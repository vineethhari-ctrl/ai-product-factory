import type { BusinessUnderstanding, EvidenceItem } from "../src/types";
import { deriveSubject } from "./blueprint";

/**
 * Prompt rules that make the model write each question for one audience: the BU Team (business only, no
 * technical words) or the BA & Tech Team. The server still checks every BU question afterwards
 * (src/services/questionAudience.ts) and moves any that contain technical words to the BA & Tech Team.
 */
export const QUESTION_AUDIENCE_RULES = `   - "BU" (BU Team): business flows, business rules, user journeys, approvals, timings and KPIs only. Write in plain language a business manager understands without help. Never use technical words such as database, schema, data model, API, endpoint, architecture, server, protocol, token, SSO, encryption, JSON, retry, timeout, cache, latency, multi-tenancy or deployment. Ask what the business needs, never how it will be built.
   - "TECH" (BA & Tech Team): data design, interfaces with other systems, architecture, security mechanisms, performance and system limits. Technical terms are expected here.
   - Each question belongs to exactly one audience. When a concern has a business decision and a technical consequence, write two separate questions, one for each audience.
   - Give both audiences questions specific to this product (aim for 4 to 8 each), never generic boilerplate.`;

const real = (i: EvidenceItem) => i.status !== "MISSING";

/** Nouns for the standard questions, taken only from the BU's own input. */
export function questionContext(u: BusinessUnderstanding, productName: string, businessUnit: string) {
  return {
    subject: u.blueprintBrief?.subject ?? u.dataEntities?.find(real)?.title ?? deriveSubject(productName, businessUnit),
    stages: u.blueprintBrief?.stages ?? [],
    role: u.personas?.find(real)?.title,
    module: u.modules?.find(real)?.title,
    productName,
  };
}
