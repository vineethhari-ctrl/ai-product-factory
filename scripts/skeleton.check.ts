/**
 * The BRD asks the model for each screen's skeleton only (no sample data); the server fills sample rows, KPI values, filter
 * chips and panels locally, keeping every name the model chose. Run: npm run check:skeleton
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "skel-"));
process.env.AI_CACHE_DAYS = "0";
for (const k of ["AI_PROJECT_BUTTON_LIMIT", "AI_USER_BUTTON_LIMIT", "AI_USER_DAILY_TOKENS", "AI_MONTHLY_BUDGET_USD"]) process.env[k] = "0";
delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.GOOGLE_GENAI_USE_VERTEXAI; delete process.env.AI_GEMINI_BACKEND;
delete process.env.GOOGLE_API_KEY; delete process.env.GOOGLE_CLOUD_PROJECT; delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); };

const BRIEF = `Journey: Request Logged → Triaged → Assigned → Resolved → Closed
Who does what: Clerks log requests, supervisors triage them, technicians resolve them, managers close them.
Rules: A request cannot be closed before it is resolved; urgent requests need a supervisor within 2 hours.`;

(async () => {
  const { analyzeBusinessMaterial, generateProductDefinition } = await import("../server/aiReasoningService");
  const { BusinessUnderstandingSchema, ProductDefinitionSchema } = await import("../server/aiSchemas");
  const { setProviderForTests } = await import("../server/llmRouter");
  const { completeScreenSkeleton } = await import("../server/blueprint");
  const quiet = async <T,>(f: () => Promise<T>): Promise<T> => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await f(); } finally { console.log = l; console.warn = w; } };

  // An offline BRD, then the same BRD the way a model now answers it: every screen a bare skeleton.
  const u0 = await quiet(() => analyzeBusinessMaterial([], "Request Desk", "Operations", BRIEF));
  const d0 = await quiet(() => generateProductDefinition(u0, "Request Desk", "Operations"));
  const { blueprintBrief: _b, ...uAnswer } = u0 as any;
  const { blueprintBrief: _c, ...dAnswer } = d0 as any;
  dAnswer.dataEntities = dAnswer.dataEntities.map((e: any) => ({ ...e, fields: e.fields.filter((f: any) => f.origin !== "SYSTEM" && f.source !== "system").map(({ source: _s, ...f }: any) => f) }));
  const MODEL_FILTERS = ["All", "Urgent", "Nonexistent chip"];
  dAnswer.screens = dAnswer.screens.map((s: any) => ({
    ...s,
    ui: {
      kpis: [{ label: "Requests Within SLA", value: "", trend: "flat", delta: "" }, { label: "Avg Resolution Time", value: "", trend: "up", delta: "" }, { label: "Open Requests", value: "", trend: "down", delta: "" }],
      filters: MODEL_FILTERS,
      table: { title: `${s.name} list`, columns: s.ui.table.columns, rows: [] },
      detailPanels: [],
      primaryActions: ["Model Action One", "Model Action Two"],
      ...(s.ui.entity ? { entity: s.ui.entity } : {}),
    },
  }));
  const evidence = Object.entries(d0.evidenceMapping ?? {}).map(([topic, sources]) => ({ topic, sources }));

  process.env.GEMINI_API_KEY = "g";
  const prompts: string[] = [];
  const restore = setProviderForTests("gemini", async (task, prompt) => {
    if (task === "generate-definition") prompts.push(prompt);
    return task === "analyze-material" ? BusinessUnderstandingSchema.parse({ ...uAnswer, inferredIndustry: "Operations" })
      : task === "generate-definition" ? ProductDefinitionSchema.parse({ ...dAnswer, evidenceMapping: evidence })
      : null;
  });
  const u = await quiet(() => analyzeBusinessMaterial([], "Request Desk", "Operations", BRIEF));
  const d = await quiet(() => generateProductDefinition(u, "Request Desk", "Operations"));
  const again = await quiet(() => generateProductDefinition(u, "Request Desk", "Operations"));
  restore();

  // ── the prompt asks for the skeleton only ──
  const prompt = prompts[0] ?? "";
  t("the BRD prompt asks for screen skeletons with no sample data", /SCREEN SKELETON RULES/.test(prompt) && /"rows" is an empty array/.test(prompt) && !/5 to 7 realistic sample rows/.test(prompt));
  t("the BRD's JSON example shows empty rows and empty KPI values", /"rows": \[\]/.test(prompt) && /"value": ""/.test(prompt) && !/SR-1041/.test(prompt));

  // ── what the server builds from the skeleton ──
  const screens = d.screens;
  t("every screen keeps the model's table title and columns", screens.every((s) => s.ui!.table.title.endsWith(" list") && dAnswer.screens.find((x: any) => x.id === s.id).ui.table.columns.join("|") === s.ui!.table.columns.join("|")), screens.map((s) => s.ui!.table.title).join(", "));
  t("every table gets 6 sample rows, each the width of its columns", screens.every((s) => s.ui!.table.rows.length === 6 && s.ui!.table.rows.every((r) => r.length === s.ui!.table.columns.length)));
  t("priority-like columns read as High / Medium / Low, not placeholders", screens.filter((s) => s.ui!.table.columns.some((c) => /priority/i.test(c))).every((s) => { const i = s.ui!.table.columns.findIndex((c) => /priority/i.test(c)); return s.ui!.table.rows.every((r) => /^(High|Medium|Low|Critical)$/.test(r[i])); }));
  t("no placeholder cells such as \"Status A\"", screens.every((s) => s.ui!.table.rows.flat().every((c) => !/^(Status|Priority|State|Stage) [A-Z]$/.test(c))));
  t("no empty or broken cells", screens.every((s) => s.ui!.table.rows.flat().every((c) => c && c.trim() && !/undefined|NaN|null/.test(c))));
  const withStatus = screens.filter((s) => s.ui!.table.columns.some((c) => /status|state|stage/i.test(c)));
  const states = new Set(d.dataEntities.flatMap((e) => e.lifecycle?.states ?? []).map((x) => x.toLowerCase()));
  t("a status column shows the record's own lifecycle values", withStatus.length > 0 && withStatus.every((s) => { const i = s.ui!.table.columns.findIndex((c) => /status|state|stage/i.test(c)); return s.ui!.table.rows.every((r) => states.has(r[i].toLowerCase()) || states.has(r[i].toUpperCase().replace(/ /g, "_").toLowerCase())); }), JSON.stringify(withStatus[0]?.ui!.table.rows.map((r) => r)));
  t("KPI names are the model's; values fit what they measure", screens.every((s) => s.ui!.kpis[0].label === "Requests Within SLA" && /%$/.test(s.ui!.kpis[0].value) && /days|h$/.test(s.ui!.kpis[1].value) && /^\d+$/.test(s.ui!.kpis[2].value)), JSON.stringify(screens[0].ui!.kpis));
  t("deltas follow the trend the model gave", screens.every((s) => /^\+/.test(s.ui!.kpis[1].delta) && /^-/.test(s.ui!.kpis[2].delta) && /no change/i.test(s.ui!.kpis[0].delta)));
  t("filter chips really filter the rows (a chip that matches nothing is dropped)", screens.every((s) => !s.ui!.filters.includes("Nonexistent chip") && s.ui!.filters[0] === "All" && s.ui!.filters.slice(1).every((f) => s.ui!.table.rows.some((r) => r.some((c) => c.toLowerCase().includes(f.toLowerCase()))))));
  t("detail panels are filled with values", screens.every((s) => s.ui!.detailPanels.length >= 2 && s.ui!.detailPanels.every((p) => p.items.some((it) => it.value))));
  t("the model's actions and record binding are kept (document screens start with \"New <document>\" by design)", screens.filter((s) => s.layoutType !== "transaction").every((s) => s.ui!.primaryActions.join() === "Model Action One,Model Action Two") && screens.filter((s) => dAnswer.screens.find((x: any) => x.id === s.id).ui.entity).every((s) => s.ui!.entity === dAnswer.screens.find((x: any) => x.id === s.id).ui.entity));
  t("screens are still marked as the AI's first draft (Build Prototype redesigns them)", screens.every((s) => s.ui!.origin === "AI" && !s.ui!.designed));
  t("deterministic: the same skeleton gives the same rows and values", JSON.stringify(again.screens.map((s) => [s.ui!.table.rows, s.ui!.kpis])) === JSON.stringify(screens.map((s) => [s.ui!.table.rows, s.ui!.kpis])));
  t("business documents are still built on transaction screens", d.screens.filter((s) => s.layoutType === "transaction").every((s) => !!s.ui!.document));

  // ── direct cases ──
  const ent = d.dataEntities.find((e) => e.lifecycle)!;
  const screen = { id: "scr-x", name: "Queue", layoutType: "split-view" as const };
  const full = { kpis: [{ label: "Open", value: "12", trend: "up" as const, delta: "+1" }], filters: ["All", "Mine"], table: { title: "T", columns: ["A", "B"], rows: [["a1", "Mine"], ["a2", "b2"]] }, detailPanels: [{ title: "P", items: [{ label: "x", value: "y" }] }], primaryActions: ["Go"] };
  const kept = completeScreenSkeleton(screen, full, ent, "Request", "seed");
  t("a model that did write sample data keeps it unchanged", JSON.stringify(kept.table) === JSON.stringify(full.table) && kept.kpis[0].value === "12" && kept.detailPanels[0].items[0].value === "y");
  const empty = completeScreenSkeleton(screen, { kpis: [], filters: [], table: { title: "", columns: [], rows: [] }, detailPanels: [], primaryActions: [] }, ent, "Request", "seed");
  t("an entirely empty skeleton still becomes a full screen", empty.table.columns.length >= 3 && empty.table.rows.length >= 5 && empty.kpis.length >= 3 && empty.primaryActions.length >= 2);
  const noEntity = completeScreenSkeleton(screen, { kpis: [], filters: [], table: { title: "Things", columns: ["Reference", "Owner", "Due Date", "Amount", "Status"], rows: [] }, detailPanels: [], primaryActions: ["Go"] }, undefined, "Request", "seed");
  t("columns without a matching record still get sensible values from their names", noEntity.table.rows.every((r) => /-\d+/.test(r[0]) && /\d{4}-\d{2}-\d{2}/.test(r[2]) && /\d/.test(r[3])), JSON.stringify(noEntity.table.rows[0]));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
