import type { ProductDefinition } from "../src/types";
import { platformName } from "../src/services/fitGap";
import { definitionDigest } from "./definitionDigest";

/**
 * Prompt for the fit-gap of a package implementation: how the platform the business chose meets each requirement of the
 * finished BRD. The platform is the BA's own words; this code names no platform, company or industry. The model brings its
 * knowledge of that platform and must flag every fit it is not sure of.
 */
export function buildFitGapPrompt(def: ProductDefinition): string {
  const platform = platformName(def);
  const rules = def.businessRules.map((r) => r.code).join(", ") || "none";
  const systems = def.integrations.map((i) => i.system).join(", ") || "none";
  return `ROLE: You are a senior solution architect and lead functional consultant for ${platform}, running the fit-gap at the end of the explore / design workshops of an implementation. The business has already chosen ${platform}; the question is how it meets each requirement below, not whether to build a new application.

${definitionDigest(def)}

COVERAGE (checked by the server): every business rule (${rules}) and every integration (${systems}) must appear in the "traces" of at least one row. Every screen must be covered by a row. Every record that holds business data today is a migration object.

WHAT TO PRODUCE:
1. summary: 3 to 4 sentences for leadership: how much of the scope ${platform} meets as standard or by configuration, where the real gaps are, and the main migration and change effort.
2. areas: the process areas / ${platform} modules or functional areas in scope, in ${platform}'s own terms (the standard names a consultant on this platform would use).
3. rows: one per requirement (a screen's job, a rule, an integration, a journey step the standard handles differently). For each:
   - area: one of the areas above.
   - requirement: the business need in one sentence, with the BRD's own names.
   - traces: the BRD items it covers (rule codes exactly as above, screen names, integration systems, record names).
   - fit: "standard" (works out of the box), "configure" (met by settings, no code), "develop" (a real gap closed by development), "process-change" (the business adopts the platform's standard way of working instead; say what changes), or "third-party" (outside the platform: another product or service).
   - platformFeature: how ${platform} meets it, in its own terms: the standard capability, application, transaction, configuration area or object a consultant would name. Name it only when you are confident it exists in ${platform}; otherwise describe it and end with "(to be confirmed)".
   - gap: for anything but "standard", what the standard does not do and how the gap is closed (one or two sentences).
   - objectType: only for "develop": "Report", "Interface", "Conversion", "Enhancement", "Form" or "Workflow".
   - complexity: "Low", "Medium" or "High" (for development: the size of the build; otherwise the configuration effort).
   Prefer, in this order: standard, configuration, process change, development. Development needs a reason the standard cannot meet. Every integration is an Interface unless ${platform} has a standard connector for that exact system (then "configure", and say which).
4. migration: every record type to load before go-live: name (the BRD's record name), source (where it comes from today; "to be confirmed" if not stated), complexity, notes (open items vs history, volumes or cleansing to agree).
5. orgStructure: the organisational elements that must be defined in ${platform} for this scope, in its own terms (for example the entities, units, sites and number ranges it needs), each with a short note of what the BU must decide.
6. authorisations: every role in the BRD mapped to the ${platform} access it needs (in ${platform}'s terms, as a short description).
7. openPoints: 4 to 8 points a ${platform} consultant or the BU must confirm before the design is frozen (licence or edition dependencies, uncertain fits, localisation, data ownership).

QUALITY RULES:
- Use the BRD's own names and rule codes exactly. Never invent a rule code, a record or an integration.
- Be honest about fit: do not call something standard to make the picture look better. When unsure, say so with "(to be confirmed)".
- Never state licence prices, effort in days or money: the estimate is computed elsewhere.
- No timestamps, no random ids, no marketing language.

Return ONLY valid JSON, no prose before or after, in exactly this shape:
{
  "summary": "",
  "areas": [""],
  "rows": [{"area": "", "requirement": "", "traces": [""], "fit": "standard", "platformFeature": "", "gap": "", "objectType": "Report", "complexity": "Low"}],
  "migration": [{"name": "", "source": "", "complexity": "Medium", "notes": ""}],
  "orgStructure": [""],
  "authorisations": [{"role": "", "access": ""}],
  "openPoints": [""]
}`;
}

/** Added to Understand Business and the BRD when the initiative implements a package platform. */
export function packageDirective(platform: string): string {
  return `PACKAGE IMPLEMENTATION (CRITICAL): This initiative implements ${platform}, a platform the business has already chosen. It is NOT a new application built from scratch.
- Describe the business processes, roles, records, rules, integrations and reports the business needs, in the BU's words. These requirements will be matched to ${platform}'s standard capabilities in a fit-gap.
- Screens are the work the users must be able to do on ${platform} (the standard screens and apps they will use, and any extension the business needs), not a custom design. Keep their names to the job, not to a guessed technical object.
- Records are the business data ${platform} must hold or that must be migrated into it; integrations are the systems ${platform} must exchange data with.
- Where the business states a requirement that ${platform}'s standard usually handles differently, keep the requirement and raise an open question for the BU on whether they would adopt the standard way of working.
- Never state effort, licence or money figures.`;
}
