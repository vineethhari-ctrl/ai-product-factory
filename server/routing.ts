/**
 * Model Routing Architecture Matrix - single source of truth.
 *
 * Each task has its own provider order: the provider best suited to the task goes first, the
 * other is the failover, then the local deterministic engine. A provider without a key is
 * skipped. Per task, the order and the models can be overridden in .env without code changes:
 *   AI_ORDER_<TASK>=claude,gemini        e.g. AI_ORDER_GENERATE_DEFINITION=gemini,claude
 *   AI_CLAUDE_MODEL_<TASK>=<model id>    e.g. AI_CLAUDE_MODEL_GENERATE_DEFINITION=claude-opus-5-5
 *   AI_GEMINI_MODEL_<TASK>=<model id>
 *   AI_GEMINI_FALLBACK_<TASK>=<model id>[,<model id>] or "none"
 * (<TASK> is the task name upper-cased with "-" as "_".)
 *
 * The matrix as specified named models that no longer exist for this setup, so
 * the applied IDs differ. Spec value -> applied value:
 *   gemini-1.5-pro    -> gemini-3.1-pro-preview   (1.5 and 2.5 return 404)
 *   gemini-1.5-flash  -> gemini-3.6-flash
 *   claude-3-5-sonnet -> claude-sonnet-5-5        (retired 2025-10-28)
 *   claude-3-haiku    -> claude-haiku-4-5         (retired 2026-04-19)
 * Max-token ceilings for the two heavy routes are also raised; see MAX_TOKENS notes.
 */

export type AITask = "analyze-material" | "generate-definition" | "analyze-change" | "generate-prototype-ui" | "research-prototype";

export type RouteClass = "benchmark-analytics" | "ui-prototyping" | "fast-general" | "design-research";

export type Provider = "gemini" | "claude";

/** Which matrix rule each backend task belongs to. */
export const TASK_ROUTE: Record<AITask, RouteClass> = {
  "analyze-material": "benchmark-analytics", // OEM benchmark inference & KPI analytics
  "generate-definition": "ui-prototyping", // screens + UI blueprints (interactive UI prototyping)
  "analyze-change": "fast-general", // fast general text & standard route intent
  "generate-prototype-ui": "ui-prototyping", // advanced thinking prototype generation
  "research-prototype": "design-research", // web research on comparable apps before Build Prototype designs
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
  "design-research": {
    // Not in the original matrix. A short JSON brief (comparable apps, patterns, visual direction) written
    // after searching the web; Gemini 3.x counts thinking in the ceiling, hence the headroom.
    gemini: { model: GEMINI_PRO, temperature: 0.4, maxTokens: 16_384 },
    claude: { model: CLAUDE_SONNET, maxTokens: 16_000, effort: "medium" },
    spec: { geminiModel: GEMINI_PRO, claudeModel: CLAUDE_SONNET, temperature: 0.4, maxTokens: 16_384 },
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

/**
 * Which provider each task asks first. Chosen per task for quality per dollar:
 * - analyze-material: Gemini reads large, mixed material (notes, slides, screenshots) well.
 * - generate-definition: the output BAs judge the product on; Claude's long structured reasoning.
 * - generate-prototype-ui: Claude's schema-enforced output means fewer unusable (still billed) answers.
 * - analyze-change: small and frequent; the cheapest model that still guarantees valid output (Haiku).
 * - research-prototype: web research before Build Prototype designs; Gemini searches Google natively.
 */
export const TASK_PROVIDER_ORDER: Record<AITask, Provider[]> = {
  "analyze-material": ["gemini", "claude"],
  "generate-definition": ["claude", "gemini"],
  "generate-prototype-ui": ["claude", "gemini"],
  "analyze-change": ["claude", "gemini"],
  // Google Search grounding is native to Gemini and costs less per search than Claude's web search tool.
  "research-prototype": ["gemini", "claude"],
};

const envKey = (prefix: string, task: AITask) => `${prefix}_${task.toUpperCase().replace(/-/g, "_")}`;

/** Provider order for a task: AI_ORDER_<TASK> if valid, else the default above. */
export function providerOrder(task: AITask): Provider[] {
  const raw = process.env[envKey("AI_ORDER", task)];
  if (raw) {
    const order = [...new Set(raw.split(",").map((p) => p.trim().toLowerCase()))].filter((p): p is Provider => p === "gemini" || p === "claude");
    if (order.length > 0) return order;
    console.warn(`[AI Engine] ${envKey("AI_ORDER", task)}="${raw}" names no known provider; using the default order.`);
  }
  return TASK_PROVIDER_ORDER[task];
}

/** Gemini model, temperature and ceiling for a task, with AI_GEMINI_MODEL_<TASK> applied. */
export function geminiRoute(task: AITask): GeminiRoute {
  const base = routeFor(task).gemini;
  const model = process.env[envKey("AI_GEMINI_MODEL", task)]?.trim();
  return model ? { ...base, model } : base;
}

/**
 * Second Gemini model per route, tried when the first is busy (503), out of quota, not available to
 * the key, or gives an unusable answer. Pro falls back to Flash (faster, rarely overloaded at the
 * same time); Flash falls back to Pro.
 */
const GEMINI_FALLBACK: Record<RouteClass, string[]> = {
  "benchmark-analytics": [GEMINI_FLASH],
  "ui-prototyping": [GEMINI_FLASH],
  "fast-general": [GEMINI_PRO],
  "design-research": [GEMINI_FLASH],
};

/** Gemini models to try for a task, in order: the routed model, then AI_GEMINI_FALLBACK_<TASK> or the default. */
export function geminiModels(task: AITask): string[] {
  const raw = process.env[envKey("AI_GEMINI_FALLBACK", task)]?.trim();
  const fallbacks = raw === undefined || raw === ""
    ? GEMINI_FALLBACK[TASK_ROUTE[task]]
    : /^none$/i.test(raw) ? [] : raw.split(",").map((m) => m.trim()).filter(Boolean);
  return [...new Set([geminiRoute(task).model, ...fallbacks])];
}

const KEY_ENV: Record<Provider, string> = { gemini: "GEMINI_API_KEY", claude: "ANTHROPIC_API_KEY" };

/** Values copied from .env.example and never replaced; treated as no key, so no call is wasted on them. */
const PLACEHOLDER_KEY = /^(MY_[A-Z_]*|your[-_ ].*|<.*>|x+|changeme|placeholder)$/i;

/** The provider's API key, or "" when it is missing or still the .env.example placeholder. */
export function providerKey(provider: Provider): string {
  const value = (process.env[KEY_ENV[provider]] || "").trim().replace(/^["']|["']$/g, "");
  return PLACEHOLDER_KEY.test(value) ? "" : value;
}

export const hasProviderKey = (provider: Provider) => providerKey(provider) !== "";

/** Haiku 4.5's output ceiling. */
const HAIKU_MAX_OUTPUT = 64_000;

/**
 * Claude model and parameters for a task, with AI_CLAUDE_MODEL_<TASK> applied. Parameters follow
 * the model family, not the route, so swapping models can never send one a parameter it rejects:
 * Haiku 4.5 takes temperature but not effort; Sonnet 5.5 / Opus 5.5 / Fable take effort but no temperature.
 */
export function claudeRoute(task: AITask): ClaudeRoute {
  const base = routeFor(task).claude;
  const model = process.env[envKey("AI_CLAUDE_MODEL", task)]?.trim() || base.model;
  if (/haiku/i.test(model)) {
    return { model, maxTokens: Math.min(base.maxTokens, HAIKU_MAX_OUTPUT), ...(base.temperature !== undefined ? { temperature: base.temperature } : {}) };
  }
  return { model, maxTokens: base.maxTokens, ...(base.effort ? { effort: base.effort } : {}) };
}

/** One line per task for the start-up log: which models run, in order, and which are skipped for lack of a key. */
export function describeRouting(): string[] {
  const keys: Record<Provider, boolean> = { gemini: hasProviderKey("gemini"), claude: hasProviderKey("claude") };
  return (Object.keys(TASK_ROUTE) as AITask[]).map((task) => {
    const steps = providerOrder(task).flatMap((p) => {
      const models = p === "gemini" ? geminiModels(task) : [claudeRoute(task).model];
      return models.map((model) => (keys[p] ? model : `(${model}: no key)`));
    });
    return `${task}: ${[...steps, "offline engine"].join(" -> ")}`;
  });
}
