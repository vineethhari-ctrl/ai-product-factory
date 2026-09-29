import { z } from "zod";
import { callGeminiJSON } from "./geminiClient";
import { callClaudeJSON } from "./claudeClient";
import type { AITask } from "./routing";

/**
 * Provider chain for every backend LLM call:
 *   1. Gemini (primary, GEMINI_API_KEY)
 *   2. Claude (failover, ANTHROPIC_API_KEY; model per task in MODEL_ROUTES)
 *   3. null -> the caller uses its deterministic local engine
 *
 * `coerce` reshapes Gemini's raw JSON before schema validation. Gemini follows
 * the shape written in the prompt, while Claude is constrained by the schema
 * directly, so the two can differ (see evidenceMapping).
 */
export async function callLLMJSON<S extends z.ZodType>(
  task: AITask,
  prompt: string,
  schema: S,
  coerce?: (raw: unknown) => unknown
): Promise<z.infer<S> | null> {
  const fromGemini = await callGeminiJSON(task, prompt, schema, coerce);
  if (fromGemini) return fromGemini;

  console.warn(`[AI Engine] ${task}: Gemini unavailable - failing over to Claude.`);
  return callClaudeJSON(task, prompt, schema);
}
