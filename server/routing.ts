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

export type AITask = "analyze-material" | "generate-definition" | "analyze-change" | "generate-prototype-ui" | "research-prototype" | "generate-test-suite" | "generate-engineering" | "generate-approach-note";

export type RouteClass = "benchmark-analytics" | "ui-prototyping" | "fast-general" | "design-research" | "specification";

export type Provider = "gemini" | "claude";

/** Which matrix rule each backend task belongs to. */
export const TASK_ROUTE: Record<AITask, RouteClass> = {
  "analyze-material": "benchmark-analytics", // OEM benchmark inference & KPI analytics
  "generate-definition": "ui-prototyping", // screens + UI blueprints (interactive UI prototyping)
  "analyze-change": "fast-general", // fast general text & standard route intent
  "generate-prototype-ui": "ui-prototyping", // advanced thinking prototype generation
  "research-prototype": "design-research", // web research on comparable apps before Build Prototype designs
  "generate-test-suite": "specification", // use cases, scenarios, test cases and a Gherkin feature, traced to the BRD
  "generate-engineering": "specification", // architecture, API contracts, NFRs, security, backlog, risks
  "generate-approach-note": "specification", // the leadership note: problems, solution, options, phases, risks, decisions
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

const GEMINI_ARGON = "gemini-4-argon";
const GEMINI_PRO = "gemini-3.1-pro-preview";
const GEMINI_FLASH = "gemini-3.6-flash";
const CLAUDE_SONNET = "claude-sonnet-5-5";
const CLAUDE_HAIKU = "claude-haiku-4-5";

export const ROUTING_MATRIX: Record<RouteClass, RouteRule> = {
  "benchmark-analytics": {
    // MAX_TOKENS: spec 4,096. The analysis JSON (about 50 items with descriptions and evidence) is
    // estimated to need more than that, so it is raised. Estimate, not measured: see CLAUDE.md.
    // Measured with Argon (live check, Oct 2026): 10-11k tokens used; headroom raised to 24,576.
    gemini: { model: GEMINI_ARGON, temperature: 0.2, maxTokens: 24_576 },
    claude: { model: CLAUDE_SONNET, maxTokens: 16_384, effort: "medium" },
    spec: { geminiModel: "gemini-1.5-pro", claudeModel: "claude-3-5-sonnet", temperature: 0.2, maxTokens: 4096 },
  },
  "ui-prototyping": {
    // MAX_TOKENS: spec 8,192. A full definition with per-screen UI blueprints is estimated at
    // roughly 10k-25k tokens, so 8,192 would cut the JSON off. Raised.
    // Measured with Argon (live check, Oct 2026): the BRD used 31,290 and in another run hit the 32,768 ceiling (Pro
    // wrote the same BRD in 15-17k); the prototype used 9-15k. A bigger ceiling costs nothing unless it is used.
    gemini: { model: GEMINI_ARGON, temperature: 0.4, maxTokens: 65_536 },
    claude: { model: CLAUDE_SONNET, maxTokens: 32_768, effort: "high" },
    spec: { geminiModel: "gemini-1.5-pro", claudeModel: "claude-3-5-sonnet", temperature: 0.4, maxTokens: 8192 },
  },
  "specification": {
    // Not in the original matrix. Long structured documents derived from a finished BRD: low temperature for
    // consistency, a high ceiling because a thinking model counts its reasoning in the output.
    gemini: { model: GEMINI_ARGON, temperature: 0.3, maxTokens: 65_536 },
    claude: { model: CLAUDE_SONNET, maxTokens: 32_768, effort: "high" },
    spec: { geminiModel: GEMINI_PRO, claudeModel: CLAUDE_SONNET, temperature: 0.3, maxTokens: 32_768 },
  },
  "design-research": {
    // Not in the original matrix. A short JSON brief (comparable apps, patterns, visual direction) written
    // after searching the web; Gemini 3.x counts thinking in the ceiling, hence the headroom.
    gemini: { model: GEMINI_ARGON, temperature: 0.4, maxTokens: 16_384 },
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
  // Long structured documents from a finished BRD; Gemini first (one Vertex setup runs everything), Claude as backup.
  "generate-test-suite": ["gemini", "claude"],
  "generate-engineering": ["gemini", "claude"],
  "generate-approach-note": ["gemini", "claude"],
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

/** The Gemini model tried when `model` fails: Argon -> Pro, Pro -> Flash, Flash -> Pro, anything else -> Flash. */
const nextGeminiModel = (model: string) => (model === GEMINI_ARGON || model === GEMINI_FLASH ? GEMINI_PRO : GEMINI_FLASH);

/**
 * Gemini models to try for a task, in order: the routed model, then AI_GEMINI_FALLBACK_<TASK>, else the next one
 * in the chain above, so a busy or unavailable model never leaves the task with a single try, even when
 * AI_GEMINI_MODEL_<TASK> already points at the usual fallback.
 */
export function geminiModels(task: AITask): string[] {
  const primary = geminiRoute(task).model;
  const raw = process.env[envKey("AI_GEMINI_FALLBACK", task)]?.trim();
  const fallbacks = raw === undefined || raw === ""
    ? [nextGeminiModel(primary)]
    : /^none$/i.test(raw) ? [] : raw.split(",").map((m) => m.trim()).filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
}

const KEY_ENV: Record<Provider, string> = { gemini: "GEMINI_API_KEY", claude: "ANTHROPIC_API_KEY" };

/** Values copied from .env.example and never replaced; treated as no key, so no call is wasted on them. */
const PLACEHOLDER_KEY = /^(MY_[A-Z_]*|your[-_ ].*|<.*>|x+|changeme|placeholder)$/i;

const clean = (v: string | undefined) => (v || "").trim().replace(/^["']|["']$/g, "");
const usable = (v: string) => (PLACEHOLDER_KEY.test(v) ? "" : v);

/**
 * Which Gemini service the app calls: the regular Gemini API (key from AI Studio or a Google Cloud project) or
 * Vertex AI. Google's own variable GOOGLE_GENAI_USE_VERTEXAI picks Vertex; AI_GEMINI_BACKEND=api|vertex overrides
 * it, so a Google setting on the PC cannot silently switch the app.
 */
export type GeminiBackend = "api" | "vertex";
export function geminiBackend(): GeminiBackend {
  const override = clean(process.env.AI_GEMINI_BACKEND).toLowerCase();
  if (override === "api" || override === "vertex") return override;
  return /^(1|true|yes)$/i.test(clean(process.env.GOOGLE_GENAI_USE_VERTEXAI)) ? "vertex" : "api";
}

/** How the Gemini client signs in: a key, or (Vertex only) a Google Cloud project with the PC's sign-in. */
export interface GeminiAuth {
  backend: GeminiBackend;
  apiKey?: string;
  project?: string;
  location?: string;
}

/** Gemini sign-in details for the current settings, or null when nothing usable is set. */
export function geminiAuth(): GeminiAuth | null {
  if (geminiBackend() === "api") {
    const apiKey = usable(clean(process.env.GEMINI_API_KEY));
    return apiKey ? { backend: "api", apiKey } : null;
  }
  // Vertex: an API key (GOOGLE_API_KEY only: a regular Gemini key from AI Studio is not valid on Vertex), else
  // project + location with the Google sign-in already on the machine (gcloud auth application-default login).
  const apiKey = usable(clean(process.env.GOOGLE_API_KEY));
  if (apiKey) return { backend: "vertex", apiKey };
  const project = usable(clean(process.env.GOOGLE_CLOUD_PROJECT));
  if (project) return { backend: "vertex", project, location: clean(process.env.GOOGLE_CLOUD_LOCATION) || "global" };
  return null;
}

/** The provider's API key, or "" when it is missing or still the .env.example placeholder. */
export function providerKey(provider: Provider): string {
  if (provider === "gemini") return geminiAuth()?.apiKey ?? "";
  return usable(clean(process.env[KEY_ENV[provider]]));
}

/** True when the provider can be called: a key, or for Gemini on Vertex a project to sign in to. */
export const hasProviderKey = (provider: Provider) => (provider === "gemini" ? geminiAuth() !== null : providerKey(provider) !== "");

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
