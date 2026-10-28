import type { ProductDefinition } from "../src/types";
import { decisionsFor } from "../src/services/approachNote";
import { definitionDigest } from "./definitionDigest";

/**
 * Prompt for the Solution Approach Note: the document a leadership reader and the architecture review use to decide
 * whether, how and in what order to build the product. Written for THIS product from its finished BRD. Domain-neutral:
 * nothing here names an industry; every noun the model uses comes from the definition below.
 */
export function buildApproachPrompt(def: ProductDefinition): string {
  const decisions = decisionsFor(def);
  const modules = def.modules.map((m, i) => `M${i + 1}. ${m.name}: ${m.description}`).join("\n");
  return `ROLE: You are a principal solution architect and business analyst. You write the Solution Approach Note that leadership reads to decide whether and how to build this product, and that the architecture review uses to challenge it. Write for a smart reader who has not read the BRD: concrete, specific to THIS product, no filler.

${definitionDigest(def)}

MODULES (every one must appear in the phases):
${modules}

OPEN QUESTIONS (answer each by its number in "recommendations"):
${decisions.map((d, i) => `Q${i + 1} [${d.team}] ${d.question}`).join("\n") || "- none"}

WHAT TO PRODUCE:
1. executiveSummary: 3 to 5 sentences. What the product is, who it serves, the main change it makes to how the work is done, and why now. Do not copy the objective word for word.
2. problems: 4 to 6 problems of the current way of working, each naming who is hurt, what goes wrong and what it costs. Use the BU's stated problems first. Where the BU stated few, infer the rest from the process and start those with "Inferred:". A description of the product is not a problem.
3. assumptions: the assumptions the design rests on that the BU has not confirmed (figures, windows, thresholds, partner behaviour). Keep each testable: someone can say yes or no.
4. solution: 6 to 10 short paragraphs. How the platform works end to end: one per module (what it does, which records and roles it uses, which rules govern it) plus the cross-cutting design (access, record integrity and history, integrations, how rules are enforced). Use the BRD's own names, rule codes and figures.
5. alternatives: 2 to 4 REAL design choices this product has to make, where more than one answer is defensible and the open questions or rules show the choice matters (for example a heavier mechanism versus a lighter one, build versus integrate, one shared standard versus per-party settings). For each: the option, the trade-off in a sentence or two, and your proposed pick with the reason. Choices the BRD already settles are not alternatives.
6. phases: 3 phases in delivery order (indicative sprint ranges, three sprints each, "the delivery team sizes it"). Order by dependency and value: the first phase delivers a working thin slice end to end that the business can try. EVERY module above appears in exactly one phase. For each phase: focus, delivers (screens and integrations by their names), exitCriteria (2 to 4 checks that prove the phase is done, tied to rules and journeys).
7. risks: 5 to 8 risks specific to this product, each with the impact and a concrete mitigation someone could act on. Not generic delivery risks. Risks about unconfirmed rules, partner systems, records of proof or history, privacy, and the hardest rules to get right are typical; only include one if it applies here.
8. recommendations: for EVERY open question above, a proposed answer to confirm or reject (ref "Q1", "Q2", ...). State the answer, with the reason in one clause. It is a proposal, never a fact.

QUALITY RULES:
- Use only module, record, role, screen and rule names that appear above. Never invent a rule code.
- A figure the BRD does not carry is a proposal: say "proposed". Never present an invented figure as given. Use the same figure everywhere it appears.
- Do not repeat BRD sentences back; add reasoning the BRD lacks (why this order, why this choice, what could go wrong).
- No timestamps, no random ids, no marketing language.

Return ONLY valid JSON, no prose before or after, in exactly this shape:
{
  "executiveSummary": "",
  "problems": [""],
  "assumptions": [""],
  "solution": [""],
  "alternatives": [{"option": "", "tradeoff": "", "recommendation": ""}],
  "phases": [{"phase": "Phase 1: ...", "focus": "", "timeline": "Sprint 1 - 3 (indicative; the delivery team sizes it)", "delivers": [""], "exitCriteria": [""]}],
  "risks": [{"risk": "", "impact": "", "mitigation": ""}],
  "recommendations": [{"ref": "Q1", "recommendation": ""}]
}`;
}
