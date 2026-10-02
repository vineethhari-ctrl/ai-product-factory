import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import type { AITask } from "./routing";

/**
 * AI usage control: who spent what, limits, a monthly budget and a response cache.
 *
 * - Every AI request carries the BA's name (X-User) and the project id (X-Project-Id).
 * - A "click" is one AI button press that reaches a provider. Cached answers are free and do not count.
 * - Limits, over a rolling 24 hours: each AI button N times per project and N times per user, plus a
 *   daily token allowance per user. A monthly budget caps the whole team.
 * - When a limit is reached the request is not refused: the free local engine answers, and the BA is
 *   told which limit was hit and when it resets.
 *
 * Storage is two JSON files under DATA_DIR (default ./data). Identity is self-declared in the browser,
 * which is enough for accountability inside a team, not for security.
 */

export const AI_BUTTONS: Record<AITask, string> = {
  "analyze-material": "Understand Business",
  "generate-definition": "Generate BRD",
  "generate-prototype-ui": "Build Prototype",
  "analyze-change": "Change Impact",
};

const num = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && process.env[name] !== undefined && process.env[name] !== "" ? v : fallback;
};

export function usageLimits() {
  return {
    projectButtonLimit: num("AI_PROJECT_BUTTON_LIMIT", 3),
    userButtonLimit: num("AI_USER_BUTTON_LIMIT", 3),
    userDailyTokens: num("AI_USER_DAILY_TOKENS", 300_000),
    monthlyBudgetUsd: num("AI_MONTHLY_BUDGET_USD", 50),
    cacheDays: num("AI_CACHE_DAYS", 30),
  };
}

/**
 * USD per million tokens, [input, output]. ESTIMATES: check your provider's current price list and
 * override with AI_PRICE_<MODEL> = "in,out" (model id upper-cased, non-alphanumerics as _).
 */
const DEFAULT_PRICES: Array<[RegExp, number, number]> = [
  [/gemini.*flash/i, 0.3, 2.5],
  [/gemini.*pro/i, 2, 12],
  // Anthropic first-party list prices: Haiku 4.5 $1/$5, Opus 5.5 $4/$20, Sonnet 5.5 $2/$10.
  [/claude.*haiku/i, 1, 5],
  [/claude-opus-5-5/i, 4, 20],
  [/claude.*opus/i, 5, 25],
  [/claude-sonnet-5/i, 2, 10],
  [/claude/i, 3, 15],
];

export function priceFor(model: string): [number, number] {
  const env = process.env[`AI_PRICE_${model.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`];
  if (env) {
    const [i, o] = env.split(",").map(Number);
    if (Number.isFinite(i) && Number.isFinite(o)) return [i, o];
  }
  const hit = DEFAULT_PRICES.find(([re]) => re.test(model));
  return hit ? [hit[1], hit[2]] : [3, 15];
}

const costOf = (model: string, input: number, output: number) => {
  const [pi, po] = priceFor(model);
  return (input * pi + output * po) / 1_000_000;
};

// ─── Storage ──────────────────────────────────────────────────────────────

export interface ClickRecord {
  at: number;
  user: string;
  project: string;
  task: AITask;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  models: string[];
}

interface UsageFile {
  clicks: ClickRecord[];
  cacheHits: Array<{ at: number; user: string; task: AITask }>;
}

const dataDir = () => path.resolve(process.env.DATA_DIR || "data");
const usagePath = () => path.join(dataDir(), "ai-usage.json");
const cacheDir = () => path.join(dataDir(), "ai-cache");
const KEEP_MS = 400 * 86_400_000;
const DAY_MS = 86_400_000;

let store: UsageFile | null = null;

function load(): UsageFile {
  if (store) return store;
  try {
    store = JSON.parse(readFileSync(usagePath(), "utf8")) as UsageFile;
    store.clicks ??= [];
    store.cacheHits ??= [];
  } catch {
    store = { clicks: [], cacheHits: [] };
  }
  return store;
}

function save() {
  const s = load();
  const cutoff = Date.now() - KEEP_MS;
  s.clicks = s.clicks.filter((c) => c.at >= cutoff);
  s.cacheHits = s.cacheHits.filter((c) => c.at >= cutoff);
  mkdirSync(dataDir(), { recursive: true });
  const tmp = `${usagePath()}.tmp`;
  writeFileSync(tmp, JSON.stringify(s));
  renameSync(tmp, usagePath()); // atomic replace, so a crash never leaves half a file
}

/** For tests: forget the in-memory copy so the next call re-reads DATA_DIR. */
export function resetUsageStoreForTests() {
  store = null;
}

// ─── Request context ──────────────────────────────────────────────────────

interface UsageContext {
  user: string;
  project: string;
  notices: string[];
  click?: ClickRecord;
}

const als = new AsyncLocalStorage<UsageContext>();

const clean = (v: unknown, fallback: string) => {
  const s = String(v ?? "").trim().slice(0, 120);
  return s || fallback;
};

/** The BA and project a request is made for, from the X-User and X-Project-Id headers. */
export function requestIdentity(req: Request): { user: string; project: string } {
  return { user: clean(req.header("x-user"), "anonymous").toLowerCase(), project: clean(req.header("x-project-id"), "unassigned") };
}

/** Express middleware: binds the BA and project to everything the request does. */
export function usageContext(req: Request, _res: Response, next: NextFunction) {
  als.run({ ...requestIdentity(req), notices: [] }, () => next());
}

/** Run `fn` with an explicit context (scripts and tests). */
export function runWithUsageContext<T>(user: string, project: string, fn: () => Promise<T>): Promise<T> {
  return als.run({ user: user.toLowerCase(), project, notices: [] }, fn);
}

/** Notices for the current request, e.g. "served from cache" or "limit reached". */
export function currentNotices(): string[] {
  return als.getStore()?.notices ?? [];
}

function note(message: string) {
  als.getStore()?.notices.push(message);
}

// ─── Allowance ────────────────────────────────────────────────────────────

const fmtTime = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";

function monthStart(now = Date.now()) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

export function monthCostUsd(now = Date.now()) {
  const start = monthStart(now);
  return load().clicks.filter((c) => c.at >= start).reduce((sum, c) => sum + c.costUsd, 0);
}

/** Why this AI call may not run now, or null when it may. */
export function blockedReason(task: AITask, user: string, project: string, now = Date.now()): string | null {
  const L = usageLimits();
  const button = AI_BUTTONS[task];
  const since = now - DAY_MS;
  const recent = load().clicks.filter((c) => c.at >= since);
  const resetAt = (records: ClickRecord[]) => fmtTime(Math.min(...records.map((r) => r.at)) + DAY_MS);

  if (L.monthlyBudgetUsd > 0 && monthCostUsd(now) >= L.monthlyBudgetUsd) {
    return `The team's monthly AI budget of $${L.monthlyBudgetUsd.toFixed(2)} is used up; AI resumes on the 1st.`;
  }
  const projectClicks = recent.filter((c) => c.project === project && c.task === task);
  if (L.projectButtonLimit > 0 && projectClicks.length >= L.projectButtonLimit) {
    return `"${button}" has been used ${projectClicks.length} of ${L.projectButtonLimit} times for this project in the last 24 hours; next AI use from ${resetAt(projectClicks)}.`;
  }
  const userClicks = recent.filter((c) => c.user === user && c.task === task);
  if (L.userButtonLimit > 0 && userClicks.length >= L.userButtonLimit) {
    return `You have used "${button}" ${userClicks.length} of ${L.userButtonLimit} times in the last 24 hours; next AI use from ${resetAt(userClicks)}.`;
  }
  const userAll = recent.filter((c) => c.user === user);
  const tokens = userAll.reduce((s, c) => s + c.inputTokens + c.outputTokens, 0);
  if (L.userDailyTokens > 0 && tokens >= L.userDailyTokens) {
    return `You have used ${tokens.toLocaleString("en-US")} of your ${L.userDailyTokens.toLocaleString("en-US")} AI tokens for the last 24 hours; more from ${resetAt(userAll)}.`;
  }
  return null;
}

/**
 * Called by the router before it calls a provider. Returns false when a limit applies; the caller then
 * lets the local engine answer. When allowed, a click is opened that provider calls add tokens to.
 */
export function beginAICall(task: AITask): boolean {
  const ctx = als.getStore();
  const user = ctx?.user ?? "anonymous";
  const project = ctx?.project ?? "unassigned";
  const reason = blockedReason(task, user, project);
  if (reason) {
    note(`AI limit reached, so this result was produced offline (free). ${reason}`);
    return false;
  }
  const click: ClickRecord = { at: Date.now(), user, project, task, inputTokens: 0, outputTokens: 0, costUsd: 0, models: [] };
  load().clicks.push(click);
  if (ctx) ctx.click = click;
  save();
  return true;
}

/** Called by each provider client after every response it is billed for, valid or not. */
export function recordTokens(task: AITask, model: string, inputTokens: number, outputTokens: number) {
  const ctx = als.getStore();
  let click = ctx?.click;
  if (!click) {
    // A provider call outside a metered request (scripts): still recorded so spend is never hidden.
    click = { at: Date.now(), user: ctx?.user ?? "system", project: ctx?.project ?? "unassigned", task, inputTokens: 0, outputTokens: 0, costUsd: 0, models: [] };
    load().clicks.push(click);
  }
  click.inputTokens += inputTokens;
  click.outputTokens += outputTokens;
  click.costUsd += costOf(model, inputTokens, outputTokens);
  if (!click.models.includes(model)) click.models.push(model);
  save();
}

/** Closes the click. A click that never reached a provider (no key, network down) is removed: it cost nothing. */
export function endAICall(task: AITask, succeeded: boolean) {
  const ctx = als.getStore();
  const click = ctx?.click;
  if (!click) return;
  ctx.click = undefined;
  if (click.inputTokens + click.outputTokens === 0) {
    const s = load();
    s.clicks = s.clicks.filter((c) => c !== click);
    save();
    return;
  }
  note(`${AI_BUTTONS[task]} used ${(click.inputTokens + click.outputTokens).toLocaleString("en-US")} AI tokens (about $${click.costUsd.toFixed(3)})${succeeded ? "" : "; the AI answer was unusable, so the offline result is shown"}.`);
}

// ─── Cache ────────────────────────────────────────────────────────────────

export function cacheKey(task: AITask, prompt: string) {
  return createHash("sha256").update(`${task}\n${prompt}`).digest("hex");
}

export function readCache(task: AITask, key: string): unknown | undefined {
  const file = path.join(cacheDir(), `${key}.json`);
  if (!existsSync(file)) return undefined;
  const maxAge = usageLimits().cacheDays * DAY_MS;
  try {
    if (Date.now() - statSync(file).mtimeMs > maxAge) {
      rmSync(file, { force: true });
      return undefined;
    }
    const { result } = JSON.parse(readFileSync(file, "utf8"));
    const ctx = als.getStore();
    load().cacheHits.push({ at: Date.now(), user: ctx?.user ?? "anonymous", task });
    save();
    note(`${AI_BUTTONS[task]}: same input as before, so the saved AI result was reused (free, not counted).`);
    return result;
  } catch {
    return undefined;
  }
}

export function writeCache(key: string, result: unknown) {
  try {
    mkdirSync(cacheDir(), { recursive: true });
    writeFileSync(path.join(cacheDir(), `${key}.json`), JSON.stringify({ at: Date.now(), result }));
    pruneCache();
  } catch (err) {
    console.warn("[AI Usage] could not write cache:", (err as Error).message);
  }
}

let lastPrune = 0;
function pruneCache() {
  if (Date.now() - lastPrune < 3_600_000) return;
  lastPrune = Date.now();
  const maxAge = usageLimits().cacheDays * DAY_MS;
  for (const f of readdirSync(cacheDir())) {
    const file = path.join(cacheDir(), f);
    if (Date.now() - statSync(file).mtimeMs > maxAge) rmSync(file, { force: true });
  }
}

// ─── Report ───────────────────────────────────────────────────────────────

export function usageReport(user: string, project: string, now = Date.now()) {
  const L = usageLimits();
  const s = load();
  const since = now - DAY_MS;
  const recent = s.clicks.filter((c) => c.at >= since);
  const mine = recent.filter((c) => c.user === user);
  const tokensUsed = mine.reduce((sum, c) => sum + c.inputTokens + c.outputTokens, 0);
  const resets = (records: ClickRecord[]) => (records.length ? new Date(Math.min(...records.map((r) => r.at)) + DAY_MS).toISOString() : null);
  const buttons = (Object.keys(AI_BUTTONS) as AITask[]).map((task) => {
    const u = mine.filter((c) => c.task === task);
    const p = recent.filter((c) => c.project === project && c.task === task);
    return {
      task,
      label: AI_BUTTONS[task],
      user: { used: u.length, limit: L.userButtonLimit, tokens: u.reduce((a, c) => a + c.inputTokens + c.outputTokens, 0), resetsAt: resets(u) },
      project: { used: p.length, limit: L.projectButtonLimit, resetsAt: resets(p) },
    };
  });
  const start = monthStart(now);
  const month = s.clicks.filter((c) => c.at >= start);
  const byUser = new Map<string, { user: string; clicks: number; tokens: number; costUsd: number }>();
  for (const c of month) {
    const row = byUser.get(c.user) ?? { user: c.user, clicks: 0, tokens: 0, costUsd: 0 };
    row.clicks++;
    row.tokens += c.inputTokens + c.outputTokens;
    row.costUsd += c.costUsd;
    byUser.set(c.user, row);
  }
  const byDay = new Map<string, { day: string; clicks: number; tokens: number; costUsd: number }>();
  for (const c of month) {
    const day = new Date(c.at).toISOString().slice(0, 10);
    const row = byDay.get(day) ?? { day, clicks: 0, tokens: 0, costUsd: 0 };
    row.clicks++;
    row.tokens += c.inputTokens + c.outputTokens;
    row.costUsd += c.costUsd;
    byDay.set(day, row);
  }
  const monthCost = month.reduce((a, c) => a + c.costUsd, 0);
  return {
    user,
    project,
    limits: L,
    me: {
      tokensUsed,
      tokensLeft: L.userDailyTokens > 0 ? Math.max(0, L.userDailyTokens - tokensUsed) : null,
      tokensResetAt: resets(mine),
      costUsd: mine.reduce((a, c) => a + c.costUsd, 0),
      cacheHits: s.cacheHits.filter((h) => h.at >= since && h.user === user).length,
    },
    buttons,
    team: {
      monthCostUsd: monthCost,
      budgetUsd: L.monthlyBudgetUsd,
      budgetLeftUsd: L.monthlyBudgetUsd > 0 ? Math.max(0, L.monthlyBudgetUsd - monthCost) : null,
      monthClicks: month.length,
      monthTokens: month.reduce((a, c) => a + c.inputTokens + c.outputTokens, 0),
      monthCacheHits: s.cacheHits.filter((h) => h.at >= start).length,
      byUser: [...byUser.values()].sort((a, b) => b.costUsd - a.costUsd),
      byDay: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
    },
    pricesAreEstimates: true,
  };
}
