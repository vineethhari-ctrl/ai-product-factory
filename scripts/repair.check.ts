// Answer repair: an AI answer with small mistakes is fixed and used; an unusable one gets one corrective try.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";

const dir = mkdtempSync(path.join(tmpdir(), "apf-repair-"));
process.env.DATA_DIR = dir;
process.env.AI_MONTHLY_BUDGET_USD = "0";
for (const k of ["AI_PROJECT_BUTTON_LIMIT", "AI_USER_BUTTON_LIMIT", "AI_USER_DAILY_TOKENS"]) process.env[k] = "0"; // the test makes more calls than one BA is allowed a day
for (const k of Object.keys(process.env)) if (/^AI_(ORDER|CLAUDE_MODEL|GEMINI_MODEL|GEMINI_FALLBACK)_/.test(k)) delete process.env[k];
delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY;

const { parseJsonLoose, repairToSchema } = await import("../server/answerRepair");
const { ProductDefinitionSchema, BusinessUnderstandingSchema } = await import("../server/aiSchemas");
const { analyzeBusinessMaterial, generateProductDefinition } = await import("../server/aiReasoningService");
const { callLLMJSON, AIUnavailableError } = await import("../server/llmRouter");
const { setGeminiClientForTests } = await import("../server/geminiClient");
const { runWithUsageContext, currentAICalls } = await import("../server/usage");

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); };
const quiet = async <T>(fn: () => Promise<T>) => { const w = console.warn, l = console.log; console.warn = console.log = () => {}; try { return await fn(); } finally { console.warn = w; console.log = l; } };

try {
  // Loose JSON reading
  t("code fences and prose around the JSON are ignored", (parseJsonLoose('Here it is:\n```json\n{"a":1}\n```\nDone.') as any)?.a === 1);
  t("trailing commas are tolerated", (parseJsonLoose('{"a":[1,2,],}') as any)?.a?.length === 2);
  t("text that is not JSON is reported as such", parseJsonLoose("I cannot help with that.") === undefined);

  // Small mistakes on a small schema
  const S = z.object({
    kind: z.enum(["IN_PROGRESS", "DONE", "ON_HOLD"]),
    count: z.number(),
    flag: z.boolean(),
    note: z.string().optional(),
    level: z.enum(["low", "high"]).optional(),
    tags: z.array(z.string()),
    rows: z.array(z.array(z.string())),
    items: z.array(z.object({ name: z.string(), size: z.number() })),
  });
  const messy = { kind: "in progress", count: "12", flag: "yes", note: 5, level: "extreme", tags: "single", rows: [["a", null, 3]], items: [{ name: "ok", size: 1 }, { name: "bad" }, { size: "2", name: "fine" }] };
  const r = repairToSchema(S, messy);
  t("a messy answer is repaired into a valid one", r.success, JSON.stringify(!r.success && r.issues.slice(0, 3)));
  if (r.success) {
    t("label matched to the closest allowed one", r.data.kind === "IN_PROGRESS");
    t("text numbers and yes/no converted", r.data.count === 12 && r.data.flag === true && r.data.note === "5");
    t("an unknown optional label is left out", r.data.level === undefined);
    t("a single value where a list is expected becomes a list", JSON.stringify(r.data.tags) === '["single"]');
    t("table cells keep their position (null -> empty, number -> text)", JSON.stringify(r.data.rows) === '[["a","","3"]]', JSON.stringify(r.data.rows));
    t("an item missing a required number gets a neutral value, the others are kept", r.data.items.length === 3 && r.data.items[2].size === 2, JSON.stringify(r.data.items));
    t("every fix is listed", r.repairs.length >= 7, r.repairs.join(" | "));
  }
  t("the original answer is not modified", messy.kind === "in progress" && messy.rows[0][1] === null);
  t("a valid answer passes untouched", (() => { const ok = repairToSchema(S, { kind: "DONE", count: 1, flag: false, tags: [], rows: [], items: [] }); return ok.success && ok.repairs.length === 0; })());
  t("an answer of the wrong shape altogether is not 'repaired'", !repairToSchema(S, "nonsense").success && !repairToSchema(S, [1, 2]).success);

  // Real schemas: a BRD with the kinds of slips seen from real models
  const u = await quiet(() => analyzeBusinessMaterial([], "Field Inspection Tracker", "Operations", "inspectors record findings, supervisors review reports, and managers approve corrective actions"));
  const def = JSON.parse(JSON.stringify(await quiet(() => generateProductDefinition(u, "Field Inspection Tracker", "Operations", "v1.0"))));
  const screens = def.screens.length, entities = def.dataEntities.length;
  def.dataEntities[0].fields[1].format = "made-up-format";
  def.dataEntities[0].fields[2].required = "true";
  def.screens[0].layoutType = "Dashboard";
  def.screens[1].ui.table.rows[0][0] = null;
  def.openQuestions[0].urgency = "very urgent";
  const fixed = repairToSchema(ProductDefinitionSchema, def);
  t("BRD with slips (unknown format, text boolean, label case, empty cell, unknown urgency) is repaired", fixed.success, JSON.stringify(!fixed.success && fixed.issues.slice(0, 3)));
  if (fixed.success) {
    t("BRD repair keeps every screen and record", fixed.data.screens.length === screens && fixed.data.dataEntities.length === entities);
    t("BRD repair keeps the label's meaning", fixed.data.screens[0].layoutType === "dashboard");
  }
  const bu = JSON.parse(JSON.stringify(u));
  bu.personas[0].status = "Confirmed";
  bu.clarifications = [{ audience: "Business", type: "HIGH: MISSING LOGIC", question: "Who approves?", impactIfIgnored: "x" }];
  const fixedBu = repairToSchema(BusinessUnderstandingSchema, bu);
  t("Understanding with an unknown audience and label case is repaired", fixedBu.success && fixedBu.data.personas[0].status === "CONFIRMED", JSON.stringify(fixedBu.success ? fixedBu.data.personas[0] : fixedBu.issues.slice(0, 2)) + " " + fixedBu.repairs.join(" | "));

  // Gemini client with a stand-in SDK
  process.env.GEMINI_API_KEY = "g";
  const realTimeout = globalThis.setTimeout;
  (globalThis as any).setTimeout = (fn: () => void) => realTimeout(fn, 0);
  const small = z.object({ title: z.string(), status: z.enum(["OPEN", "CLOSED"]) });
  let calls: Array<{ model: string; turns: number }> = [];
  const fake = (answers: string[]) => ({
    models: {
      generateContent: async ({ model, contents }: { model: string; contents: unknown }) => {
        calls.push({ model, turns: Array.isArray(contents) ? contents.length : 1 });
        const text = answers[Math.min(calls.length - 1, answers.length - 1)];
        return { text, candidates: [{ finishReason: "STOP" }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } };
      },
    },
  });
  const run = (project: string, prompt: string) => runWithUsageContext("tester", project, () => quiet(async () => {
    let r: unknown = null, err: unknown = null;
    try { r = await callLLMJSON("analyze-change", prompt, small); } catch (e) { err = e; }
    return { r: r as z.infer<typeof small> | null, err, s: currentAICalls().at(-1) };
  }));

  let restore = setGeminiClientForTests(fake(['{"title": "A", "status": "closed"}']));
  const repaired = await run("R1", "prompt one");
  restore();
  t("Gemini: a small slip is repaired in place, no second call", repaired.r?.status === "CLOSED" && calls.length === 1, JSON.stringify(calls));
  t("Gemini: the status lists the fix", repaired.s?.outcome === "ai" && (repaired.s.repairs?.length ?? 0) === 1 && !repaired.s.corrected, JSON.stringify(repaired.s));

  calls = [];
  restore = setGeminiClientForTests(fake(["Sorry, here is a summary instead of JSON.", '{"title": "B", "status": "OPEN"}']));
  const corrected = await run("R2", "prompt two");
  restore();
  t("Gemini: an unusable answer gets one corrective try with the errors, and its answer is used", corrected.r?.title === "B" && calls.length === 2 && calls[1].turns === 3, JSON.stringify(calls));
  t("Gemini: the status says it was corrected", corrected.s?.corrected === true, JSON.stringify(corrected.s));

  calls = [];
  restore = setGeminiClientForTests(fake(["not json", "still not json"]));
  const failed = await run("R3", "prompt three");
  restore();
  t("Gemini: unusable twice on each model -> the AI-unavailable error, nothing invented", failed.r === null && failed.err instanceof AIUnavailableError, String(failed.err));
  t("Gemini: one correction per model, no endless retrying", calls.length === 4, JSON.stringify(calls));

  // A long answer arrives as a stream (so the HTTP client never waits silently for minutes)
  const streaming = (pieces: string[], extra: Record<string, unknown> = {}) => ({
    models: {
      generateContentStream: async () => (async function* () {
        yield { candidates: [{ content: { parts: [{ text: "thinking about it", thought: true }] } }] };
        for (const piece of pieces) yield { candidates: [{ content: { parts: [{ text: piece }] } }] };
        yield { candidates: [{ finishReason: "STOP", content: { parts: [] } }], usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 9 }, ...extra };
      })(),
    },
  });
  restore = setGeminiClientForTests(streaming(['{"title": "Str', 'eam", "status"', ': "OPEN"}']));
  const streamed = await run("S1", "prompt stream");
  restore();
  t("Gemini: a streamed answer is put back together (thinking text left out)", streamed.r?.title === "Stream" && streamed.r.status === "OPEN", JSON.stringify(streamed.r));
  t("Gemini: a streamed answer reports its tokens", streamed.s?.outcome === "ai");

  let drops = 0;
  const droppy = {
    models: {
      generateContentStream: async () => {
        if (drops++ < 1) throw Object.assign(new TypeError("fetch failed"), { cause: new Error("socket hang up") });
        return (async function* () { yield { candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"title": "Back", "status": "CLOSED"}' }] } }] }; })();
      },
    },
  };
  restore = setGeminiClientForTests(droppy);
  const reconnected = await run("S2", "prompt dropped");
  restore();
  t("Gemini: a dropped connection is retried and then answers", reconnected.r?.title === "Back" && drops === 2, `${drops} ${JSON.stringify(reconnected.r)}`);

  let noSignIn = 0;
  restore = setGeminiClientForTests({ models: { generateContentStream: async () => { noSignIn++; throw new Error("Could not load the default credentials."); } } });
  const unauthenticated = await run("S3", "prompt no sign-in");
  restore();
  t("Gemini: a missing Google sign-in is not retried as if it were a dropped connection", unauthenticated.err instanceof AIUnavailableError && noSignIn === 2, String(noSignIn));
  (globalThis as any).setTimeout = realTimeout;
  delete process.env.GEMINI_API_KEY;
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
