import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { AITask, GeminiRoute, TASK_ROUTE, ROUTING_MATRIX } from "./routing";

/**
 * Gemini provider (primary). Uses GEMINI_API_KEY. One model per task, chosen by
 * the Model Routing Architecture Matrix (routing.ts); transient errors
 * (429/503) are retried with backoff. Returns null when the key is missing or
 * the call fails, so the router can fail over to Claude.
 */

/** Task -> Gemini model, temperature and output ceiling. Edit the matrix in routing.ts. */
export const GEMINI_MODELS: Record<AITask, GeminiRoute> = Object.fromEntries(
  (Object.keys(TASK_ROUTE) as AITask[]).map((task) => [task, ROUTING_MATRIX[TASK_ROUTE[task]].gemini])
) as Record<AITask, GeminiRoute>;

const MAX_ATTEMPTS = 3;

let cachedClient: GoogleGenAI | null = null;
let warnedMissingKey = false;

function getClient(): GoogleGenAI | null {
  if (cachedClient) return cachedClient;
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    if (!warnedMissingKey) {
      console.warn("[AI Engine] GEMINI_API_KEY is not set - skipping Gemini.");
      warnedMissingKey = true;
    }
    return null;
  }
  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

function isTransient(err: any): boolean {
  const msg = typeof err?.message === "string" ? err.message : "";
  return (
    err?.status === 503 || err?.status === 429 || err?.code === 503 || err?.code === 429 ||
    /503|429|high demand|UNAVAILABLE|Resource has been exhausted/i.test(msg)
  );
}

/** Strip code fences and surrounding prose so JSON.parse sees only the payload. */
function extractJson(text: string): string {
  let clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  if (first !== -1 && last > first) clean = clean.substring(first, last + 1);
  return clean;
}

export async function callGeminiJSON<S extends z.ZodType>(
  task: AITask,
  prompt: string,
  schema: S,
  coerce?: (raw: unknown) => unknown
): Promise<z.infer<S> | null> {
  const ai = getClient();
  if (!ai) return null;

  const { model, temperature, maxTokens } = GEMINI_MODELS[task];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const started = Date.now();
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: "application/json", temperature, maxOutputTokens: maxTokens },
      });

      if (response.candidates?.[0]?.finishReason === "MAX_TOKENS") {
        console.warn(`[AI Engine] ${task}: ${model} hit its ${maxTokens}-token output ceiling and the JSON is cut off; raise maxTokens in routing.ts.`);
        return null;
      }
      if (!response.text) {
        console.warn(`[AI Engine] ${task}: ${model} returned empty text.`);
        return null;
      }

      const raw = JSON.parse(extractJson(response.text));
      const result = schema.safeParse(coerce ? coerce(raw) : raw);
      if (!result.success) {
        const issue = result.error.issues[0];
        console.warn(`[AI Engine] ${task}: ${model} output failed schema validation (${issue?.path.join(".") || "root"}: ${issue?.message}).`);
        return null;
      }

      const u = response.usageMetadata;
      console.log(`[AI Engine] ${task}: ${model} ok in ${Date.now() - started}ms (output ${u?.candidatesTokenCount ?? "?"} of ${maxTokens}, thinking ${u?.thoughtsTokenCount ?? 0} tokens).`);
      return result.data;
    } catch (err: any) {
      if (isTransient(err) && attempt < MAX_ATTEMPTS) {
        const delay = attempt * 1500;
        console.warn(`[AI Engine] ${task}: ${model} transient error on attempt ${attempt}; retrying in ${delay}ms.`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      console.warn(`[AI Engine] ${task}: ${model} failed: ${String(err?.message || err).replace(/\s+/g, " ").slice(0, 160)}`);
      return null;
    }
  }
  return null;
}
