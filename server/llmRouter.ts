import { z } from "zod";
import { callGeminiJSON } from "./geminiClient";
import { callClaudeJSON } from "./claudeClient";
import type { AITask } from "./routing";
import { beginAICall, cacheKey, endAICall, readCache, writeCache } from "./usage";

/**
 * Provider chain for every backend LLM call:
 *   0. Cache: the same task and prompt as before returns the saved result (free, not counted)
 *   1. Usage limits (server/usage.ts): over a limit, return null so the local engine answers
 *   2. Gemini (primary, GEMINI_API_KEY)
 *   3. Claude (failover, ANTHROPIC_API_KEY; model per task in MODEL_ROUTES)
 *   4. null -> the caller uses its deterministic local engine
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
  // No provider configured: nothing to cache, meter or limit.
  if (!process.env.GEMINI_API_KEY?.trim() && !process.env.ANTHROPIC_API_KEY?.trim()) return null;

  const key = cacheKey(task, prompt);
  const cached = readCache(task, key);
  if (cached !== undefined) {
    const parsed = schema.safeParse(cached);
    if (parsed.success) return parsed.data;
  }

  if (!beginAICall(task)) return null;
  let result: z.infer<S> | null = null;
  try {
    result = await callGeminiJSON(task, prompt, schema, coerce);
    if (!result) {
      console.warn(`[AI Engine] ${task}: Gemini unavailable - failing over to Claude.`);
      result = await callClaudeJSON(task, prompt, schema);
    }
    if (result) writeCache(key, result);
    return result;
  } finally {
    endAICall(task, result !== null);
  }
}
