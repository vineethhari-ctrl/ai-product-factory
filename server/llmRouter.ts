import { z } from "zod";
import { createHash } from "node:crypto";
import { callGeminiJSON } from "./geminiClient";
import { callClaudeJSON } from "./claudeClient";
import { type AITask, type Provider, hasProviderKey, providerOrder } from "./routing";
import { beginAICall, cacheKey, currentFailures, currentServedModel, endAICall, readCache, setAIStatus, writeCache } from "./usage";

/**
 * Provider chain for every backend LLM call:
 *   0. Cache: the same task and prompt as before returns the saved result (free, not counted)
 *   1. Usage limits (server/usage.ts): over a limit, return null so the local engine answers
 *   2. The task's providers in its order (routing.ts `providerOrder`); a provider without a key,
 *      or whose call fails, passes to the next. Gemini tries a second model itself (routing.ts `geminiModels`).
 *   3. null -> the caller uses its deterministic local engine
 *
 * Every outcome is recorded with `setAIStatus`, so the browser can say who answered and, when the
 * offline engine had to step in, why (busy, quota, cut-off answer...) and offer a retry.
 *
 * `coerce` reshapes Gemini's raw JSON before schema validation. Gemini follows
 * the shape written in the prompt, while Claude is constrained by the schema
 * directly, so the two can differ (see evidenceMapping).
 */

/** An image sent with the prompt (base64, no data: prefix), e.g. a reference screen. */
export interface AIImage {
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  data: string;
}

export interface LLMOptions {
  images?: AIImage[];
}

type ProviderCall = (task: AITask, prompt: string, schema: z.ZodType, coerce?: (raw: unknown) => unknown, options?: LLMOptions) => Promise<unknown | null>;

const PROVIDERS: Record<Provider, ProviderCall> = {
  gemini: (task, prompt, schema, coerce, options) => callGeminiJSON(task, prompt, schema, coerce, options?.images),
  claude: (task, prompt, schema, _coerce, options) => callClaudeJSON(task, prompt, schema, options?.images),
};

/** For tests: replace a provider with a stub. Returns a function that restores it. */
export function setProviderForTests(provider: Provider, call: ProviderCall): () => void {
  const original = PROVIDERS[provider];
  PROVIDERS[provider] = call;
  return () => { PROVIDERS[provider] = original; };
}

/** Images change the answer, so they are part of the cache key (by hash, not content). */
function cachePrompt(prompt: string, images?: AIImage[]) {
  if (!images?.length) return prompt;
  return `${prompt}\n[images: ${images.map((i) => createHash("sha256").update(i.data).digest("hex")).join(",")}]`;
}

export async function callLLMJSON<S extends z.ZodType>(
  task: AITask,
  prompt: string,
  schema: S,
  coerce?: (raw: unknown) => unknown,
  options?: LLMOptions
): Promise<z.infer<S> | null> {
  const order = providerOrder(task).filter(hasProviderKey);
  // No configured provider for this task: nothing to cache, meter or limit.
  if (order.length === 0) {
    setAIStatus({ task, outcome: "offline-no-key" });
    return null;
  }

  const key = cacheKey(task, cachePrompt(prompt, options?.images));
  const cached = readCache(task, key);
  if (cached !== undefined) {
    const parsed = schema.safeParse(cached);
    if (parsed.success) {
      setAIStatus({ task, outcome: "cache" });
      return parsed.data;
    }
  }

  if (!beginAICall(task)) {
    setAIStatus({ task, outcome: "offline-limit" });
    return null;
  }
  let result: z.infer<S> | null = null;
  try {
    for (const [i, provider] of order.entries()) {
      result = (await PROVIDERS[provider](task, prompt, schema, coerce, options)) as z.infer<S> | null;
      if (result) break;
      if (order[i + 1]) console.warn(`[AI Engine] ${task}: ${provider} unavailable - failing over to ${order[i + 1]}.`);
    }
    if (result) {
      writeCache(key, result);
      setAIStatus({ task, outcome: "ai", model: currentServedModel() });
    } else {
      setAIStatus({ task, outcome: "offline-failed", failures: [...currentFailures()] });
    }
    return result;
  } finally {
    endAICall(task, result !== null);
  }
}
