import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { AITask, claudeRoute, providerKey } from "./routing";
import { type ProviderFailure, recordAnswerRepairs, recordProviderFailure, recordServedModel, recordTokens } from "./usage";
import { describeIssues, parseJsonLoose, repairToSchema } from "./answerRepair";
import type { AIImage } from "./llmRouter";

export type { AITask };

/**
 * Claude provider. One model per task, chosen by the Model Routing
 * Architecture Matrix (routing.ts `claudeRoute`, which also picks the
 * parameters the model accepts).
 *
 *  1. The SDK retries 408/409/429/5xx (including 529 overloaded) and network
 *     errors with backoff (`maxRetries`).
 *  2. A refusal, a cut-off response (`max_tokens`) or schema-invalid output
 *     ends the attempt.
 *  3. On any failure `null` is returned and the router tries the next
 *     provider, then the deterministic local engine.
 */

let cachedClient: Anthropic | null = null;
let cachedKey = "";
let warnedMissingKey = false;

function getClient(): Anthropic | null {
  const apiKey = providerKey("claude");
  if (cachedClient && cachedKey === apiKey) return cachedClient;
  if (!apiKey) {
    if (!warnedMissingKey) {
      console.error("[AI Engine] ANTHROPIC_API_KEY is not set (or is still the .env.example placeholder) - skipping Claude.");
      warnedMissingKey = true;
    }
    return null;
  }
  cachedClient = new Anthropic({ apiKey, maxRetries: 3, timeout: 10 * 60 * 1000 });
  cachedKey = apiKey;
  return cachedClient;
}

const KIND_MESSAGE: Record<ProviderFailure["kind"], string> = {
  busy: "is overloaded right now",
  quota: "hit its rate limit or credit limit for this key",
  "unavailable-model": "is not available for this key",
  key: "rejected the API key",
  "cut-off": "ran out of room and its answer was cut off",
  "bad-answer": "answered, but not in the format the app needs",
  refused: "declined to answer",
  network: "could not be reached",
};

function fail(task: AITask, model: string, kind: ProviderFailure["kind"], detail: string) {
  console.warn(`[AI Engine] ${task}: ${model} failed (${kind}): ${detail.replace(/\s+/g, " ").slice(0, 200)}`);
  recordProviderFailure({ provider: "claude", model, kind, message: `Claude ${model} ${KIND_MESSAGE[kind]}` });
}

function classify(err: unknown): ProviderFailure["kind"] {
  if (!(err instanceof Anthropic.APIError)) return "network";
  const status = err.status ?? 0;
  if (status === 401 || status === 403) return "key";
  if (status === 404) return "unavailable-model";
  if (status === 429 || /credit balance|billing/i.test(err.message)) return "quota";
  if (status >= 500) return "busy";
  if (status === 400) return "bad-answer";
  return "network";
}

/**
 * Run a task on its Claude model and return output validated against `schema`,
 * or null if the call failed.
 */
export async function callClaudeJSON<S extends z.ZodType>(
  task: AITask,
  prompt: string,
  schema: S,
  images?: AIImage[],
  webSearch = false
): Promise<z.infer<S> | null> {
  const client = getClient();
  if (!client) return null;
  if (webSearch) return callClaudeWithSearch(client, task, prompt, schema);

  const route = claudeRoute(task);
  const started = Date.now();
  try {
    const stream = client.messages.stream({
      model: route.model,
      max_tokens: route.maxTokens,
      // effort and temperature are only sent where the model accepts them (see routing.ts).
      ...(route.temperature !== undefined ? { temperature: route.temperature } : {}),
      output_config: {
        ...(route.effort ? { effort: route.effort } : {}),
        format: zodOutputFormat(schema),
      },
      messages: [{
        role: "user",
        content: images?.length
          ? [...images.map((img) => ({ type: "image" as const, source: { type: "base64" as const, media_type: img.mimeType, data: img.data } })), { type: "text" as const, text: prompt }]
          : prompt,
      }],
    });
    const message = await stream.finalMessage();
    // Billed whether or not the answer is usable.
    recordTokens(task, route.model, message.usage.input_tokens, message.usage.output_tokens);

    if (message.stop_reason === "refusal") {
      fail(task, route.model, "refused", `declined (${message.stop_details?.category ?? "unspecified"})`);
      return null;
    }
    if (message.stop_reason === "max_tokens") {
      fail(task, route.model, "cut-off", `hit its ${route.maxTokens}-token output ceiling; raise maxTokens in routing.ts`);
      return null;
    }
    if (message.parsed_output == null) {
      // Rare with an enforced format: try to repair the text answer before giving up.
      const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      const raw = parseJsonLoose(text);
      const repaired = raw === undefined ? null : repairToSchema(schema, raw);
      if (!repaired?.success) {
        fail(task, route.model, "bad-answer", repaired ? `schema validation (${describeIssues(repaired.issues, raw, 1)[0]})` : "output did not match the schema");
        return null;
      }
      recordAnswerRepairs(repaired.repairs);
      recordServedModel(route.model);
      console.log(`[AI Engine] ${task}: ${route.model} ok after ${repaired.repairs.length} small fix(es) in ${Date.now() - started}ms.`);
      return repaired.data as z.infer<S>;
    }

    recordAnswerRepairs([]);
    recordServedModel(route.model);
    console.log(`[AI Engine] ${task}: ${route.model} ok in ${Date.now() - started}ms (${message.usage.input_tokens} in / ${message.usage.output_tokens} out of ${route.maxTokens}).`);
    return message.parsed_output as z.infer<S>;
  } catch (err) {
    const detail = err instanceof Anthropic.APIError ? `${err.status ?? "network"} ${err.message}` : String((err as Error)?.message ?? err);
    fail(task, route.model, classify(err), detail);
    return null;
  }
}

/** Most turns a searching call may be resumed after the server pauses it (long searches). */
const MAX_SEARCH_TURNS = 4;

/**
 * Research call: Claude searches the web (server-side web search tool), then answers with JSON in text.
 * Structured outputs are not used here because search results carry citations, which cannot be combined
 * with an enforced output format. The answer is validated against `schema`; pages read become `sources`.
 */
async function callClaudeWithSearch<S extends z.ZodType>(
  client: Anthropic,
  task: AITask,
  prompt: string,
  schema: S
): Promise<z.infer<S> | null> {
  const route = claudeRoute(task);
  const started = Date.now();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  const sources: Array<{ title: string; url: string }> = [];
  try {
    let message: Anthropic.Message | null = null;
    for (let turn = 0; turn < MAX_SEARCH_TURNS; turn++) {
      const stream = client.messages.stream({
        model: route.model,
        max_tokens: route.maxTokens,
        ...(route.temperature !== undefined ? { temperature: route.temperature } : {}),
        ...(route.effort ? { output_config: { effort: route.effort } } : {}),
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
        messages,
      });
      message = await stream.finalMessage();
      recordTokens(task, route.model, message.usage.input_tokens, message.usage.output_tokens);
      for (const block of message.content) {
        if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
          for (const r of block.content) if (r.url && !sources.some((s) => s.url === r.url)) sources.push({ title: r.title || r.url, url: r.url });
        }
      }
      if (message.stop_reason !== "pause_turn") break;
      // The server paused a long search: send the turn back so it continues where it stopped.
      messages.push({ role: "assistant", content: message.content });
    }
    if (!message) return null;

    if (message.stop_reason === "refusal") {
      fail(task, route.model, "refused", `declined (${message.stop_details?.category ?? "unspecified"})`);
      return null;
    }
    if (message.stop_reason === "max_tokens") {
      fail(task, route.model, "cut-off", `hit its ${route.maxTokens}-token output ceiling; raise maxTokens in routing.ts`);
      return null;
    }
    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const raw = parseJsonLoose(text);
    if (raw === undefined) {
      fail(task, route.model, "bad-answer", "the answer was not valid JSON");
      return null;
    }
    if (raw && typeof raw === "object" && sources.length && !Array.isArray((raw as { sources?: unknown }).sources)) {
      (raw as { sources?: unknown }).sources = sources.slice(0, 12);
    }
    const parsed = repairToSchema(schema, raw);
    if (!parsed.success) {
      fail(task, route.model, "bad-answer", `schema validation (${describeIssues(parsed.issues, raw, 1)[0]})`);
      return null;
    }
    recordAnswerRepairs(parsed.repairs);
    recordServedModel(route.model);
    console.log(`[AI Engine] ${task}: ${route.model} with web search ok in ${Date.now() - started}ms (${sources.length} pages read).`);
    return parsed.data as z.infer<S>;
  } catch (err) {
    const detail = err instanceof Anthropic.APIError ? `${err.status ?? "network"} ${err.message}` : String((err as Error)?.message ?? err);
    fail(task, route.model, classify(err), detail);
    return null;
  }
}
