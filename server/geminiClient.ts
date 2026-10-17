import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { AITask, geminiModels, geminiRoute, providerKey } from "./routing";
import { type ProviderFailure, recordProviderFailure, recordServedModel, recordTokens } from "./usage";
import type { AIImage } from "./llmRouter";

/**
 * Gemini provider. Uses GEMINI_API_KEY. The task's models are tried in order (routing.ts
 * `geminiModels`: the routed model, then a second one), so a busy or unavailable model passes to
 * the next model before the router moves on to the next provider. Transient errors (429/503) are
 * retried with backoff on each model. Every failure is recorded in plain language for the BA.
 * Returns null when the key is missing or every model failed.
 */

const MAX_ATTEMPTS = 3;

let cachedClient: GoogleGenAI | null = null;
let cachedKey = "";
let warnedMissingKey = false;
let testClient: GoogleGenAI | null = null;

/** For tests: answer with a stand-in client (only `models.generateContent` is used). Returns a restore function. */
export function setGeminiClientForTests(client: unknown): () => void {
  testClient = client as GoogleGenAI;
  return () => { testClient = null; };
}

function getClient(): GoogleGenAI | null {
  if (testClient) return testClient;
  const apiKey = providerKey("gemini");
  if (cachedClient && cachedKey === apiKey) return cachedClient;
  if (!apiKey) {
    if (!warnedMissingKey) {
      console.warn("[AI Engine] GEMINI_API_KEY is not set (or is still the .env.example placeholder) - skipping Gemini.");
      warnedMissingKey = true;
    }
    return null;
  }
  cachedClient = new GoogleGenAI({ apiKey });
  cachedKey = apiKey;
  return cachedClient;
}

const errorText = (err: any) => `${err?.status ?? err?.code ?? ""} ${typeof err?.message === "string" ? err.message : String(err)}`;

/** Sort an error into what the BA needs to know. */
export function classifyGeminiError(err: any): ProviderFailure["kind"] {
  const status = Number(err?.status ?? err?.code);
  const msg = errorText(err);
  if (status === 503 || status === 500 || /\b(503|500)\b|high demand|UNAVAILABLE|overloaded|INTERNAL/i.test(msg)) return "busy";
  if (status === 429 || /\b429\b|RESOURCE_EXHAUSTED|quota|rate limit|Resource has been exhausted/i.test(msg)) return "quota";
  if (status === 404 || /\b404\b|NOT_FOUND|is not found|not supported for generateContent/i.test(msg)) return "unavailable-model";
  if (status === 401 || status === 403 || /API key not valid|API_KEY_INVALID|PERMISSION_DENIED|UNAUTHENTICATED/i.test(msg)) return "key";
  if (status === 400 && /SAFETY|blocked/i.test(msg)) return "refused";
  if (status === 400) return "bad-answer";
  return "network";
}

const KIND_MESSAGE: Record<ProviderFailure["kind"], string> = {
  busy: "is overloaded at Google right now (503)",
  quota: "hit its quota or rate limit for this key (429)",
  "unavailable-model": "is not available for this key (404)",
  key: "rejected the API key",
  "cut-off": "ran out of room and its answer was cut off",
  "bad-answer": "answered, but not in the format the app needs",
  refused: "declined to answer",
  network: "could not be reached",
};

function fail(model: string, kind: ProviderFailure["kind"], task: AITask, detail: string) {
  console.warn(`[AI Engine] ${task}: ${model} failed (${kind}): ${detail.replace(/\s+/g, " ").slice(0, 200)}`);
  recordProviderFailure({ provider: "gemini", model, kind, message: `Gemini ${model} ${KIND_MESSAGE[kind]}` });
}

const isTransient = (kind: ProviderFailure["kind"]) => kind === "busy" || kind === "quota";

/** Strip code fences and surrounding prose so JSON.parse sees only the payload. */
function extractJson(text: string): string {
  let clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  if (first !== -1 && last > first) clean = clean.substring(first, last + 1);
  return clean;
}

/** One model: up to MAX_ATTEMPTS on transient errors. Returns the data, or the failure kind. */
async function callModel<S extends z.ZodType>(
  ai: GoogleGenAI,
  task: AITask,
  model: string,
  prompt: string,
  schema: S,
  coerce: ((raw: unknown) => unknown) | undefined,
  images: AIImage[] | undefined,
  webSearch = false
): Promise<{ data: z.infer<S> } | { kind: ProviderFailure["kind"] }> {
  const { temperature, maxTokens } = geminiRoute(task);
  const contents = images?.length
    ? [{ role: "user", parts: [...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } })), { text: prompt }] }]
    : prompt;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const started = Date.now();
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        // Google Search grounding cannot be combined with JSON mode on every model, so a searching call
        // asks for JSON in the prompt and is validated below like any other answer.
        config: webSearch
          ? { tools: [{ googleSearch: {} }], temperature, maxOutputTokens: maxTokens }
          : { responseMimeType: "application/json", temperature, maxOutputTokens: maxTokens },
      });

      // Billed whether or not the answer is usable; thinking tokens are billed as output.
      const usage = response.usageMetadata;
      recordTokens(task, model, usage?.promptTokenCount ?? 0, (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0));

      const finish = response.candidates?.[0]?.finishReason;
      if (finish === "MAX_TOKENS") {
        fail(model, "cut-off", task, `hit its ${maxTokens}-token output ceiling; raise maxTokens in routing.ts`);
        return { kind: "cut-off" };
      }
      if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT" || finish === "RECITATION") {
        fail(model, "refused", task, `finish reason ${finish}`);
        return { kind: "refused" };
      }
      if (!response.text) {
        fail(model, "bad-answer", task, "empty text");
        return { kind: "bad-answer" };
      }

      let raw: unknown;
      try {
        raw = JSON.parse(extractJson(response.text));
      } catch {
        fail(model, "bad-answer", task, "the answer was not valid JSON");
        return { kind: "bad-answer" };
      }
      if (webSearch && raw && typeof raw === "object") {
        // The pages Google Search returned, so the BA can see what the research read.
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
        const found = chunks.flatMap((c) => (c.web?.uri ? [{ title: c.web.title || c.web.uri, url: c.web.uri }] : []));
        const obj = raw as { sources?: unknown };
        if (found.length && !Array.isArray(obj.sources)) obj.sources = found;
      }
      const result = schema.safeParse(coerce ? coerce(raw) : raw);
      if (!result.success) {
        const issue = result.error.issues[0];
        fail(model, "bad-answer", task, `schema validation (${issue?.path.join(".") || "root"}: ${issue?.message})`);
        return { kind: "bad-answer" };
      }

      console.log(`[AI Engine] ${task}: ${model} ok in ${Date.now() - started}ms (output ${usage?.candidatesTokenCount ?? "?"} of ${maxTokens}, thinking ${usage?.thoughtsTokenCount ?? 0} tokens).`);
      return { data: result.data };
    } catch (err: any) {
      const kind = classifyGeminiError(err);
      if (isTransient(kind) && attempt < MAX_ATTEMPTS) {
        const delay = attempt * 1500;
        console.warn(`[AI Engine] ${task}: ${model} ${kind} on attempt ${attempt}; retrying in ${delay}ms.`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      fail(model, kind, task, errorText(err));
      return { kind };
    }
  }
  return { kind: "network" };
}

export async function callGeminiJSON<S extends z.ZodType>(
  task: AITask,
  prompt: string,
  schema: S,
  coerce?: (raw: unknown) => unknown,
  images?: AIImage[],
  webSearch = false
): Promise<z.infer<S> | null> {
  const ai = getClient();
  if (!ai) return null;

  const models = geminiModels(task);
  for (const [i, model] of models.entries()) {
    const outcome = await callModel(ai, task, model, prompt, schema, coerce, images, webSearch);
    if ("data" in outcome) {
      recordServedModel(model);
      return outcome.data;
    }
    // A rejected key fails the same way on every model.
    if (outcome.kind === "key") return null;
    if (models[i + 1]) console.warn(`[AI Engine] ${task}: trying the second Gemini model ${models[i + 1]}.`);
  }
  return null;
}
