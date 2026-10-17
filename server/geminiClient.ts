import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { AITask, type GeminiAuth, geminiAuth, geminiModels, geminiRoute } from "./routing";
import { type ProviderFailure, recordAnswerRepairs, recordProviderFailure, recordServedModel, recordTokens } from "./usage";
import { describeIssues, parseJsonLoose, repairToSchema } from "./answerRepair";
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

/** SDK options for the chosen service. `vertexai` is always explicit, so a PC-wide Google variable cannot flip it. */
export function geminiClientOptions(auth: GeminiAuth) {
  if (auth.backend === "api") return { vertexai: false, apiKey: auth.apiKey };
  return auth.apiKey ? { vertexai: true, apiKey: auth.apiKey } : { vertexai: true, project: auth.project, location: auth.location };
}

function getClient(): GoogleGenAI | null {
  if (testClient) return testClient;
  const auth = geminiAuth();
  if (!auth) {
    if (!warnedMissingKey) {
      console.warn("[AI Engine] No usable Gemini sign-in (GEMINI_API_KEY, or GOOGLE_API_KEY / GOOGLE_CLOUD_PROJECT for Vertex; a placeholder counts as unset) - skipping Gemini.");
      warnedMissingKey = true;
    }
    return null;
  }
  // `vertexai` is always passed, so a Google variable on the PC can never switch the service behind the app's back.
  const signature = JSON.stringify(auth);
  if (cachedClient && cachedKey === signature) return cachedClient;
  cachedClient = new GoogleGenAI(geminiClientOptions(auth));
  cachedKey = signature;
  console.log(`[AI Engine] Gemini via ${auth.backend === "vertex" ? `Vertex AI (${auth.apiKey ? "API key" : `project ${auth.project}, ${auth.location}`})` : "the Gemini API"}.`);
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

type Interpreted<T> = { ok: true; data: T; repairs: string[] } | { ok: false; detail: string; problems: string[] };

/** Read a model's text as the schema's data: parse loosely, reshape (`coerce`), then repair small mistakes. */
function interpret<S extends z.ZodType>(
  text: string,
  schema: S,
  coerce: ((raw: unknown) => unknown) | undefined,
  sources: Array<{ title: string; url: string }>
): Interpreted<z.infer<S>> {
  const raw = parseJsonLoose(text);
  if (raw === undefined) {
    return { ok: false, detail: "the answer was not valid JSON", problems: ["The answer was not valid JSON. Return exactly one JSON object and nothing else."] };
  }
  // The pages Google Search returned, so the BA can see what the research read.
  if (sources.length && raw && typeof raw === "object" && !Array.isArray((raw as { sources?: unknown }).sources)) {
    (raw as { sources?: unknown }).sources = sources;
  }
  const shaped = coerce ? coerce(raw) : raw;
  const result = repairToSchema(schema, shaped);
  if (result.success) return { ok: true, data: result.data, repairs: result.repairs };
  const problems = describeIssues(result.issues, shaped);
  return { ok: false, detail: `schema validation (${problems[0] ?? "unknown"})`, problems };
}

const correctionPrompt = (problems: string[]) => `Your previous answer could not be used: it does not match the required JSON format.
Fix exactly these problems and keep everything else the same:
${problems.map((p) => `- ${p}`).join("\n")}

Return the complete corrected JSON object only: no explanation, no code fences.`;

function logServed(task: AITask, model: string, started: number, usage: any, maxTokens: number, repairs: string[], corrected = false) {
  console.log(`[AI Engine] ${task}: ${model} ok in ${Date.now() - started}ms (output ${usage?.candidatesTokenCount ?? "?"} of ${maxTokens}, thinking ${usage?.thoughtsTokenCount ?? 0} tokens)${corrected ? " after one correction" : ""}.`);
  if (repairs.length) {
    console.log(`[AI Engine] ${task}: ${model} answer used after ${repairs.length} small fix(es): ${repairs.slice(0, 6).join("; ")}${repairs.length > 6 ? "; ..." : ""}`);
  }
}

/** What a Gemini answer looks like to the rest of this file, whether it arrived whole or as a stream. */
interface GeminiAnswer {
  text?: string;
  candidates?: Array<{ finishReason?: string; groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
}

/**
 * One request to a model. The answer is read as a STREAM: a long answer (a thinking model writing a large JSON for
 * several minutes) would otherwise sit silent past the HTTP client's 5-minute wait for the first byte and fail with
 * "fetch failed" even though Google was still working. Streaming keeps bytes flowing from the first second.
 * A stand-in client without streaming (tests) is answered with the plain call.
 */
async function generate(ai: GoogleGenAI, params: Parameters<GoogleGenAI["models"]["generateContent"]>[0]): Promise<GeminiAnswer> {
  const models = ai.models as unknown as { generateContentStream?: (p: unknown) => Promise<AsyncIterable<any>> };
  if (typeof models.generateContentStream !== "function") return (await ai.models.generateContent(params)) as GeminiAnswer;
  let text = "";
  let finishReason: string | undefined;
  let usage: GeminiAnswer["usageMetadata"];
  const grounding: Array<{ web?: { uri?: string; title?: string } }> = [];
  for await (const chunk of await models.generateContentStream(params)) {
    const candidate = chunk?.candidates?.[0];
    // Answer text only: thinking summaries are marked `thought` and are not part of the JSON.
    for (const part of candidate?.content?.parts ?? []) if (typeof part?.text === "string" && !part.thought) text += part.text;
    if (candidate?.finishReason) finishReason = candidate.finishReason;
    if (chunk?.usageMetadata) usage = chunk.usageMetadata;
    for (const g of candidate?.groundingMetadata?.groundingChunks ?? []) grounding.push(g);
  }
  return { text, candidates: [{ finishReason, groundingMetadata: grounding.length ? { groundingChunks: grounding } : undefined }], usageMetadata: usage };
}

/** One corrective turn: the original request, the model's answer, and the list of problems. Text, or null. */
async function askForCorrection(
  ai: GoogleGenAI,
  task: AITask,
  model: string,
  contents: string | Array<{ role: string; parts: unknown[] }>,
  previous: string,
  problems: string[],
  temperature: number | undefined,
  maxTokens: number
): Promise<string | null> {
  const userTurn = typeof contents === "string" ? { role: "user", parts: [{ text: contents }] } : contents[0];
  try {
    const response = await generate(ai, {
      model,
      contents: [userTurn, { role: "model", parts: [{ text: previous }] }, { role: "user", parts: [{ text: correctionPrompt(problems) }] }] as any,
      config: { responseMimeType: "application/json", temperature, maxOutputTokens: maxTokens },
    });
    const usage = response.usageMetadata;
    recordTokens(task, model, usage?.promptTokenCount ?? 0, (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0));
    if (response.candidates?.[0]?.finishReason === "MAX_TOKENS" || !response.text) return null;
    return response.text;
  } catch (err) {
    console.warn(`[AI Engine] ${task}: ${model} correction failed: ${errorText(err).slice(0, 160)}`);
    return null;
  }
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
      const response = await generate(ai, {
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

      const chunks = webSearch ? response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [] : [];
      const sources = chunks.flatMap((c) => (c.web?.uri ? [{ title: c.web.title || c.web.uri, url: c.web.uri }] : []));
      const first = interpret(response.text, schema, coerce, sources);
      if (first.ok) {
        recordAnswerRepairs(first.repairs);
        logServed(task, model, started, usage, maxTokens, first.repairs);
        return { data: first.data };
      }

      // Still unusable after repair: show the model its mistakes once and use its corrected answer.
      console.warn(`[AI Engine] ${task}: ${model} answer unusable (${first.detail}); asking it to correct ${first.problems.length} problem(s).`);
      const corrected = await askForCorrection(ai, task, model, contents, response.text, first.problems, temperature, maxTokens);
      const second = corrected === null ? null : interpret(corrected, schema, coerce, sources);
      if (second?.ok) {
        recordAnswerRepairs(second.repairs, true);
        logServed(task, model, started, usage, maxTokens, second.repairs, true);
        return { data: second.data };
      }
      fail(model, "bad-answer", task, second && !second.ok ? second.detail : first.detail);
      return { kind: "bad-answer" };
    } catch (err: any) {
      const kind = classifyGeminiError(err);
      // A dropped connection is worth another try; a missing sign-in is not.
      const dropped = kind === "network" && /fetch failed|terminated|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket|other side closed|UND_ERR/i.test(errorText(err));
      if ((isTransient(kind) || dropped) && attempt < MAX_ATTEMPTS) {
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
