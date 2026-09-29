/**
 * Model Routing Architecture Matrix - single source of truth.
 *
 * Provider order for every task: Gemini (primary) -> Claude (failover) -> local
 * deterministic engine. `geminiClient.ts` exports GEMINI_MODELS and
 * `claudeClient.ts` exports MODEL_ROUTES; both are derived from this file.
 *
 * The matrix as specified named models that no longer exist for this setup, so
 * the applied IDs differ. Spec value -> applied value:
 *   gemini-1.5-pro    -> gemini-3.1-pro-preview   (1.5 and 2.5 return 404)
 *   gemini-1.5-flash  -> gemini-3.6-flash
 *   claude-3-5-sonnet -> claude-sonnet-5-5        (retired 2025-10-28)
 *   claude-3-haiku    -> claude-haiku-4-5         (retired 2026-04-19)
 * Max-token ceilings for the two heavy routes are also raised; see MAX_TOKENS notes.
 */

export type AITask = "analyze-material" | "generate-definition" | "analyze-change" | "generate-prototype-ui";

export type RouteClass = "benchmark-analytics" | "ui-prototyping" | "fast-general";

/** Which matrix rule each backend task belongs to. */
export const TASK_ROUTE: Record<AITask, RouteClass> = {
  "analyze-material": "benchmark-analytics", // OEM benchmark inference & KPI analytics
  "generate-definition": "ui-prototyping", // screens + UI blueprints (interactive UI prototyping)
  "analyze-change": "fast-general", // fast general text & standard route intent
  "generate-prototype-ui": "ui-prototyping", // advanced thinking prototype generation
};

export interface GeminiRoute {
  model: string;
  temperature: number;
  /** Output ceiling (includes thinking tokens on Gemini 3.x). */
  maxTokens: number;
}

export interface ClaudeRoute {
  model: string;
  maxTokens: number;
  /**
   * Only set where the model accepts it. Claude Sonnet 5.5 / Opus 5.5 reject any
   * temperature (400), so the matrix temperature cannot be applied to them.
   */
  temperature?: number;
  /** Thinking depth. Not accepted by Claude Haiku 4.5, so omitted there. */
  effort?: "low" | "medium" | "high";
}

export interface RouteRule {
  gemini: GeminiRoute;
  claude: ClaudeRoute;
  /** Values the matrix specified, kept for reference and documentation. */
  spec: { geminiModel: string; claudeModel: string; temperature: number; maxTokens: number };
}

const GEMINI_PRO = "gemini-3.1-pro-preview";
const GEMINI_FLASH = "gemini-3.6-flash";
const CLAUDE_SONNET = "claude-sonnet-5-5";
const CLAUDE_HAIKU = "claude-haiku-4-5";

export const ROUTING_MATRIX: Record<RouteClass, RouteRule> = {
  "benchmark-analytics": {
    // MAX_TOKENS: spec 4,096. The analysis JSON (about 50 items with descriptions and evidence) is
    // estimated to need more than that, so it is raised. Estimate, not measured: see CLAUDE.md.
    gemini: { model: GEMINI_PRO, temperature: 0.2, maxTokens: 16_384 },
    claude: { model: CLAUDE_SONNET, maxTokens: 16_384, effort: "medium" },
    spec: { geminiModel: "gemini-1.5-pro", claudeModel: "claude-3-5-sonnet", temperature: 0.2, maxTokens: 4096 },
  },
  "ui-prototyping": {
    // MAX_TOKENS: spec 8,192. A full definition with per-screen UI blueprints is estimated at
    // roughly 10k-25k tokens, so 8,192 would cut the JSON off. Raised.
    gemini: { model: GEMINI_PRO, temperature: 0.4, maxTokens: 32_768 },
    claude: { model: CLAUDE_SONNET, maxTokens: 32_768, effort: "high" },
    spec: { geminiModel: "gemini-1.5-pro", claudeModel: "claude-3-5-sonnet", temperature: 0.4, maxTokens: 8192 },
  },
  "fast-general": {
    // Spec limits applied as written.
    gemini: { model: GEMINI_FLASH, temperature: 0.5, maxTokens: 2048 },
    claude: { model: CLAUDE_HAIKU, maxTokens: 2048, temperature: 0.5 },
    spec: { geminiModel: "gemini-1.5-flash", claudeModel: "claude-3-haiku", temperature: 0.5, maxTokens: 2048 },
  },
};

export function routeFor(task: AITask): RouteRule {
  return ROUTING_MATRIX[TASK_ROUTE[task]];
}
