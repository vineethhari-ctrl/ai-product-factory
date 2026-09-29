import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { AITask, ClaudeRoute, TASK_ROUTE, ROUTING_MATRIX } from "./routing";

export type { AITask };

/**
 * Claude provider (failover, used when Gemini is unavailable). One model per
 * task, chosen by the Model Routing Architecture Matrix (routing.ts).
 *
 *  1. The SDK retries 408/409/429/5xx (including 529 overloaded) and network
 *     errors with backoff (`maxRetries`).
 *  2. A refusal, a cut-off response (`max_tokens`) or schema-invalid output
 *     ends the attempt.
 *  3. On any failure `null` is returned and the caller falls back to the
 *     deterministic local engine.
 */

/** Task -> Claude model, output ceiling and (where supported) temperature/effort. Edit the matrix in routing.ts. */
export const MODEL_ROUTES: Record<AITask, ClaudeRoute> = Object.fromEntries(
  (Object.keys(TASK_ROUTE) as AITask[]).map((task) => [task, ROUTING_MATRIX[TASK_ROUTE[task]].claude])
) as Record<AITask, ClaudeRoute>;

let cachedClient: Anthropic | null = null;
let warnedMissingKey = false;

function getClient(): Anthropic | null {
  if (cachedClient) return cachedClient;
  const apiKey = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!apiKey) {
    if (!warnedMissingKey) {
      console.error("[AI Engine] ANTHROPIC_API_KEY is not set - skipping Claude.");
      warnedMissingKey = true;
    }
    return null;
  }
  cachedClient = new Anthropic({ apiKey, maxRetries: 3, timeout: 10 * 60 * 1000 });
  return cachedClient;
}

/**
 * Run a task on its Claude model and return output validated against `schema`,
 * or null if the call failed.
 */
export async function callClaudeJSON<S extends z.ZodType>(
  task: AITask,
  prompt: string,
  schema: S
): Promise<z.infer<S> | null> {
  const client = getClient();
  if (!client) return null;

  const route = MODEL_ROUTES[task];
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
      messages: [{ role: "user", content: prompt }],
    });
    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      console.warn(`[AI Engine] ${task}: ${route.model} declined (${message.stop_details?.category ?? "unspecified"}).`);
      return null;
    }
    if (message.stop_reason === "max_tokens") {
      console.warn(`[AI Engine] ${task}: ${route.model} hit its ${route.maxTokens}-token output ceiling and the JSON is cut off; raise maxTokens in routing.ts.`);
      return null;
    }
    if (message.parsed_output == null) {
      console.warn(`[AI Engine] ${task}: ${route.model} returned output that did not match the schema.`);
      return null;
    }

    console.log(`[AI Engine] ${task}: ${route.model} ok in ${Date.now() - started}ms (${message.usage.input_tokens} in / ${message.usage.output_tokens} out of ${route.maxTokens}).`);
    return message.parsed_output as z.infer<S>;
  } catch (err) {
    const detail = err instanceof Anthropic.APIError ? `${err.status ?? "network"} ${err.message}` : String((err as Error)?.message ?? err);
    console.warn(`[AI Engine] ${task}: ${route.model} failed: ${detail.replace(/\s+/g, " ").slice(0, 200)}`);
    return null;
  }
}
