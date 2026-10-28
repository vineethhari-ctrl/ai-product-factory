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
   - Give both audiences questions specific to this product (aim for 4 to 8 each), never generic boilerplate.
   - QUESTION QUALITY: First list to yourself every fact the BU's material already states (who does what, the steps, the named systems, the stated rules). Never ask for one of those again and never put your own guess in its place ("for example ..."); use the BU's own words and ask only for what they left open: a limit or threshold, an exception path, an owner for a decision, a time limit, who may see what, what happens when something is changed, replaced, reversed or handed over, how a figure is calculated and who defines it, how much history is kept. Each question names one decision, in the BU's own terms, with the options that matter, so it can be answered in a sentence.
   - QUESTION TYPE (where a question has a "type" field it is "<IMPORTANCE>: <KIND>", chosen separately; where it has "urgency", blocking = BLOCKER or HIGH, important = MEDIUM, nice-to-have = LOW): IMPORTANCE is BLOCKER (the answer contradicts what the BU said or stops all further design), HIGH (a wrong guess would change the rules, the money, the legal position or who may see what), MEDIUM (changes one screen, record or integration), LOW (a wider-scope or nice-to-have idea). KIND is CONTRADICTION (two statements disagree), MISSING LOGIC (a rule, limit, owner or exception is not stated), PERMISSION GAP (only about who may do or see something), POLICY CHOICE (a standard, regulation, price or commercial decision), SCOPE (what is in or out of this release). Pick the KIND that is true of the question, then rate its IMPORTANCE on its own: a policy or scope question is often MEDIUM or LOW.
   - RANK HONESTLY: when every question is marked high, none stands out. At most about one third of each team's questions may be BLOCKER, HIGH or blocking; order your questions most important first.`;

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
