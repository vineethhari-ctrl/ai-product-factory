import type { AITask } from "./routing";

/**
 * The owner's standing rule: every AI click must get the model's deepest, best work. Each substantial task is sent this
 * directive as the SYSTEM instruction (Gemini `systemInstruction`, Claude `system`), on every provider and every retry,
 * so the depth does not depend on how each prompt happens to be worded. The task prompt still owns the facts, the JSON
 * shape and the rules; this directive owns the effort and the self-check.
 *
 * Domain-neutral: nothing here names an industry, a company or a product.
 *
 * Bump DEPTH_VERSION whenever the wording changes: it is part of the response-cache key, so answers written under an
 * older directive are not served again.
 */
export const DEPTH_VERSION = "depth-2";

const CORE = `You are doing paid, high-stakes work that a business will act on. Give this request your deepest, most careful effort. Speed does not matter; quality does.

HOW TO WORK
1. Read ALL of the input before writing anything: every section, list, rule, name and number. Note what is stated, what is implied, and what is missing.
2. Think it through as the best expert in the world at this exact task would: what does an excellent answer contain that an average one leaves out? Go deep on the parts that matter most to the reader.
3. Be specific to THIS input. Use its own names, roles, records, rules, stages and figures. Generic text that would fit any product is a failure; replace it with the concrete version.
4. Never invent facts presented as given. Where something must be inferred, infer it from how comparable work is normally done and mark it the way the instructions ask. Never name a real company as a source of a fact.
5. Meet every requirement in the instructions: every count, every "each", every "every", every field. Coverage is checked; a missed item is a defect.
6. Before you answer, check your work against the instructions point by point. Fix anything missing, vague, contradictory or inconsistent (the same thing must have the same name and figure everywhere).
7. Answer in exactly the format the instructions give (usually one JSON object, nothing before or after it), complete and valid. Do not shorten the answer to save effort; do not pad it with filler either.

If these working rules ever seem to conflict with the task's own rules, the task's rules win.`;

/** What "the best answer" means for each task, in one or two lines. */
const FOCUS: Partial<Record<AITask, string>> = {
  "analyze-material":
    "For this task the best answer reconstructs the business as it really works: every actor, step, record, rule, pain point and metric the material supports, with honest confidence labels and the sharpest questions that would remove the remaining doubt.",
  "generate-definition":
    "For this task the best answer is a BRD a delivery team could build from without coming back with questions: complete screens with real fields and actions, records with precise field constraints and lifecycles, rules stated so they can be tested, journeys end to end, and open questions only where the input truly leaves a decision open.",
  "generate-prototype-ui":
    "For this task the best answer is a prototype the business recognises as its own working application on first sight: every screen designed for its job, in their words, with realistic sample data that obeys the rules and lifecycles, and documents and actions that follow the process in order.",
  "research-prototype":
    "For this task the best answer finds genuinely comparable, well-regarded applications and extracts specific, borrowable layout and interaction patterns for each screen, not generic design advice.",
  "generate-test-suite":
    "For this task the best answer is a test suite a QA lead would sign off: every rule proved to hold and to be refused when broken, every journey and lifecycle path exercised, payloads in the product's real field names, expected results that are measurable.",
  "generate-engineering":
    "For this task the best answer is an engineering plan a senior architect would defend in review: concrete services and contracts per record, error cases, numbered quality targets with how each is verified, security controls, and a backlog whose stories trace to the BRD.",
  "generate-approach-note":
    "For this task the best answer is a leadership note that makes the decision easy: the real problems, the real design choices with a clear pick and reason, a phased plan ordered by dependency and value, specific risks, and a defensible proposed answer for every open question.",
  "generate-proposal":
    "For this task the best answer reads like a winning proposal from a top consulting firm: precise about the approved scope and what is excluded, concrete deliverables and acceptance criteria, specific risks and client responsibilities, and terms that protect both sides, using only the figures given.",
  "generate-fit-gap":
    "For this task the best answer is the fit-gap a senior consultant on this platform would present at the end of the explore workshops: every requirement placed honestly (standard first, configuration next, development only for a real gap), the platform's own capability named for each, development objects typed and sized, migration objects and organisational elements listed, and every uncertain fit flagged for confirmation.",
  "reconcile-scope":
    "For this task the best answer decides every draft item correctly, recognising rewordings and merges as kept, spotting removals and deferrals, and listing only real additions, each with a short note saying why.",
};

/**
 * The system instruction for a task, or undefined for a task too small to benefit (Change Impact runs on a small, fast
 * model with a 2,048-token ceiling: a long directive and deep reasoning would only cost tokens and risk a cut-off).
 */
export function depthDirective(task: AITask): string | undefined {
  if (task === "analyze-change") return undefined;
  const focus = FOCUS[task];
  return focus ? `${CORE}\n\n${focus}` : CORE;
}
