import { z } from "zod";
import { callGeminiJSON } from "./geminiClient";
import { callClaudeJSON } from "./claudeClient";
import { type AITask, type Provider, providerOrder } from "./routing";
import { beginAICall, cacheKey, endAICall, readCache, writeCache } from "./usage";

/**
 * Provider chain for every backend LLM call:
 *   0. Cache: the same task and prompt as before returns the saved result (free, not counted)
 *   1. Usage limits (server/usage.ts): over a limit, return null so the local engine answers
 *   2. The task's providers in its order (routing.ts `providerOrder`); a provider without a key,
 *      or whose call fails, passes to the next
 *   3. null -> the caller uses its deterministic local engine
 *
 * `coerce` reshapes Gemini's raw JSON before schema validation. Gemini follows
 * the shape written in the prompt, while Claude is constrained by the schema
 * directly, so the two can differ (see evidenceMapping).
 */

type ProviderCall = (task: AITask, prompt: string, schema: z.ZodType, coerce?: (raw: unknown) => unknown) => Promise<unknown | null>;

const PROVIDERS: Record<Provider, ProviderCall> = {
  gemini: (task, prompt, schema, coerce) => callGeminiJSON(task, prompt, schema, coerce),
  claude: (task, prompt, schema) => callClaudeJSON(task, prompt, schema),
};

const KEY_ENV: Record<Provider, string> = { gemini: "GEMINI_API_KEY", claude: "ANTHROPIC_API_KEY" };
const hasKey = (p: Provider) => !!process.env[KEY_ENV[p]]?.trim();

/** For tests: replace a provider with a stub. Returns a function that restores it. */
export function setProviderForTests(provider: Provider, call: ProviderCall): () => void {
  const original = PROVIDERS[provider];
  PROVIDERS[provider] = call;
  return () => { PROVIDERS[provider] = original; };
}

export async function callLLMJSON<S extends z.ZodType>(
  task: AITask,
  prompt: string,
  schema: S,
  coerce?: (raw: unknown) => unknown
): Promise<z.infer<S> | null> {
  const order = providerOrder(task).filter(hasKey);
  // No configured provider for this task: nothing to cache, meter or limit.
  if (order.length === 0) return null;

  const key = cacheKey(task, prompt);
  const cached = readCache(task, key);
  if (cached !== undefined) {
    const parsed = schema.safeParse(cached);
    if (parsed.success) return parsed.data;
  }

  if (!beginAICall(task)) return null;
  let result: z.infer<S> | null = null;
  try {
    for (const [i, provider] of order.entries()) {
      result = (await PROVIDERS[provider](task, prompt, schema, coerce)) as z.infer<S> | null;
      if (result) break;
      if (order[i + 1]) console.warn(`[AI Engine] ${task}: ${provider} unavailable - failing over to ${order[i + 1]}.`);
    }
    if (result) writeCache(key, result);
    return result;
  } finally {
    endAICall(task, result !== null);
  }
}
