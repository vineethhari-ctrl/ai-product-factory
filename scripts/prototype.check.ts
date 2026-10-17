// Build Prototype: the AI designs every screen from the BU's process, optionally following a reference
// screen; AI designs are marked and reused, offline designs never block the AI; the prompt is domain-neutral.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "apf-prototype-"));
process.env.DATA_DIR = dir;
process.env.AI_MONTHLY_BUDGET_USD = "0";
process.env.AI_PROJECT_BUTTON_LIMIT = "0";
process.env.AI_USER_BUTTON_LIMIT = "0";
delete process.env.GEMINI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

const { analyzeBusinessMaterial, generateProductDefinition, generatePrototypeUI } = await import("../server/aiReasoningService");
const { setProviderForTests, AIUnavailableError } = await import("../server/llmRouter");
const { buildPrototypePrompt, buildResearchPrompt } = await import("../server/prototypePrompt");
const { parseReferenceImage, MAX_REFERENCE_BYTES } = await import("../server/referenceImage");
const { PrototypeUISchema, DesignResearchSchema } = await import("../server/aiSchemas");
const { runWithUsageContext } = await import("../server/usage");

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); };
const quiet = async <T>(fn: () => Promise<T>) => { const w = console.warn, l = console.log; console.warn = console.log = () => {}; try { return await fn(); } finally { console.warn = w; console.log = l; } };

try {
  // Offline pipeline for a brief with "who does what" clauses
  const u = await quiet(() => analyzeBusinessMaterial([], "Workshop Service Hub", "PV/EV",
    "advisors check in vehicles, supervisors assign repair bays, and customers approve extra repair costs on their phone"));
  const def = await quiet(() => generateProductDefinition(u, "Workshop Service Hub", "PV/EV", "v1.0"));
  const offline = await quiet(() => generatePrototypeUI(def));
  t("offline: every screen has a design", offline.screens.length > 0 && offline.screens.every((s) => !!s.ui));
  t("offline designs are not marked as AI", offline.screens.every((s) => s.ui?.origin !== "AI"));
  t("offline: sample titles use the BU's record, no filler companies", offline.screens.every((s) => !JSON.stringify(s.ui).includes("standard intake")));
  t("offline: overview has a trend chart and BU-worded actions", !!offline.screens[0].ui?.chart && /Review Stalled Vehicles/.test(offline.screens[0].ui!.primaryActions[0]), offline.screens[0].ui?.primaryActions[0]);
  t("offline: a stage done by an outside party is a phone screen", offline.screens.some((s) => s.ui?.device === "phone" && /Approve Extra Repair Cost/.test(s.name)), offline.screens.map((s) => `${s.name}:${s.ui?.device}`).join(", "));
  t("offline: record screens show the record's history", offline.screens.filter((s) => s.layoutType === "profile-360").every((s) => (s.ui?.timeline?.length ?? 0) > 0));
  t("offline: overview module named after the BU's record", offline.modules.some((m) => m.name === "Vehicles Overview"), offline.modules.map((m) => m.name).join(", "));

  // Prompt
  const prompt = buildPrototypePrompt(offline, false);
  const stages = offline.blueprintBrief?.stages ?? [];
  t("prompt carries the BU's process stages in order", stages.length >= 3 && stages.every((s) => prompt.includes(s)), stages.join(" -> "));
  t("prompt says who does each stage", (offline.blueprintBrief?.stageOwners ?? []).filter(Boolean).every((o) => prompt.includes(`done by ${o}`)));
  t("prompt lists every screen id", offline.screens.every((s) => prompt.includes(`id="${s.id}"`)));
  const lifecycle = offline.dataEntities.find((e) => e.lifecycle?.states.length);
  t("prompt gives the record's status values", !!lifecycle && prompt.includes(lifecycle.lifecycle!.states.join(" -> ")));
  t("prompt hides system fields", !/\browVersion\b|\bcreatedBy\b/.test(prompt));
  t("no reference section without an image", !prompt.includes("REFERENCE SCREEN"));
  const withRef = buildPrototypePrompt(offline, true);
  t("reference section: copy the look, never the data", withRef.includes("REFERENCE SCREEN") && /not copy its words, names, numbers or data/i.test(withRef));
  t("prompt is stable (cacheable)", buildPrototypePrompt(offline, false) === prompt);

  // AI path with a stand-in provider
  process.env.GEMINI_API_KEY = "g";
  const [first, second] = offline.screens;
  const formEntity = offline.dataEntities[0].name;
  let seen: { prompt: string; images?: unknown[] } | null = null;
  const answer = {
    theme: { primaryColor: "#0F766E", accentColor: "not-a-colour", sidebarStyle: "light", density: "compact" },
    screens: [
      {
        screenId: first.id, inspiredBy: "Stage pipeline overview", layoutType: "dashboard",
        ui: {
          entity: "", benchmarkNote: "Shows where every record waits.",
          kpis: [{ label: "Waiting at check-in", value: "7", trend: "up", delta: "+2 vs yesterday" }],
          filters: ["All", "Waiting"], table: { title: "Today", columns: ["Ref", "Owner", "Status"], rows: [["R-1", "Ana"], ["R-2", "Ben", "Open", "extra"]] },
          detailPanels: [], primaryActions: ["Assign bay"], device: "desktop",
          chart: { title: "Waiting per stage", kind: "bar", labels: ["A", "B", "C"], values: [4, -2, 9, 99] },
          board: { columns: [{ title: "Waiting", cards: [{ title: "R-1", subtitle: "Ana", tag: "High" }] }, { title: "Done", cards: [] }] },
          timeline: [{ when: "Today 09:40", who: "Ana", what: "checked in R-1" }],
        },
      },
      {
        screenId: second.id, inspiredBy: "Guided intake", layoutType: "form-wizard",
        ui: {
          entity: formEntity, benchmarkNote: "Captures the first stage.",
          kpis: [], filters: [], table: { title: "Drafts", columns: ["Ref", "Status"], rows: [["R-3", "Draft"]] }, detailPanels: [], primaryActions: ["Start"], device: "phone",
        },
      },
      { screenId: "scr-unknown", inspiredBy: "x", layoutType: "dashboard", ui: { entity: "Nope", benchmarkNote: "", kpis: [], filters: [], table: { title: "", columns: [], rows: [] }, detailPanels: [], primaryActions: [], device: "desktop" } },
    ],
  };
  t("stand-in answer matches the schema", PrototypeUISchema.safeParse(answer).success, JSON.stringify(PrototypeUISchema.safeParse(answer).error?.issues?.[0]));
  const brief = {
    comparableApps: [{ name: "Example Desk", category: "Service desk", whatToBorrow: ["Board of work by stage"] }],
    designDirection: "Calm teal palette (#0F766E) with a light sidebar.",
    screenPatterns: [{ screenId: first.id, pattern: "Stage board", why: "Work moves by stage" }, { screenId: "scr-nope", pattern: "x", why: "y" }],
    sources: [{ title: "Example", url: "https://example.com/desk" }, { title: "Bad", url: "javascript:alert(1)" }],
  };
  t("stand-in research matches the schema", DesignResearchSchema.safeParse(brief).success);
  const calls: Array<{ task: string; prompt: string; images?: unknown[]; webSearch?: boolean }> = [];
  const restore = setProviderForTests("gemini", async (task, p, _schema, _coerce, options) => {
    calls.push({ task, prompt: p, images: options?.images, webSearch: options?.webSearch });
    if (task === "research-prototype") return DesignResearchSchema.parse(brief);
    seen = { prompt: p, images: options?.images };
    return PrototypeUISchema.parse(answer);
  });
  const image = { mimeType: "image/png" as const, data: "iVBORw0KGgo=" };
  const ai = await runWithUsageContext("ba", "P1", () => quiet(() => generatePrototypeUI(offline, image)));
  restore();
  const s1 = ai.screens.find((s) => s.id === first.id)!;
  const s2 = ai.screens.find((s) => s.id === second.id)!;
  t("AI screens are marked AI", s1.ui?.origin === "AI" && s2.ui?.origin === "AI");
  t("AI layout is applied", s2.layoutType === "form-wizard");
  t("AI table rows are forced to the column count", s1.ui!.table.rows.every((r) => r.length === 3));
  t("form screen keeps a known entity", s2.ui?.entity === formEntity);
  t("note names the generic pattern", s1.ui!.benchmarkNote!.startsWith("AI design: Stage pipeline overview."));
  t("screens the AI skipped keep an offline design", ai.screens.filter((s) => s.id !== first.id && s.id !== second.id).every((s) => !!s.ui && s.ui.origin !== "AI"));
  t("unknown screen ids are ignored", ai.screens.length === offline.screens.length);
  t("reference image reaches the provider", (seen as any)?.images?.[0]?.data === image.data && (seen as any).prompt.includes("REFERENCE SCREEN"));
  t("with a reference screen, no web research is done", !calls.some((c) => c.task === "research-prototype") && !ai.designResearch);
  t("AI theme kept; a bad accent colour falls back to the primary", ai.uiTheme?.primaryColor === "#0F766E" && ai.uiTheme.accentColor === "#0F766E" && ai.uiTheme.sidebarStyle === "light");
  t("AI chart trimmed to matching labels, no negative values", s1.ui?.chart?.values.join() === "4,0,9" && s1.ui.chart.labels.length === 3, JSON.stringify(s1.ui?.chart));
  t("AI board and timeline kept", s1.ui?.board?.columns.length === 2 && s1.ui?.timeline?.[0]?.who === "Ana");
  t("AI phone screen kept", s2.ui?.device === "phone" && s1.ui?.device === undefined);

  // No reference screen: research on the web first, then design from the brief
  calls.length = 0;
  const restore2 = setProviderForTests("gemini", async (task, p, _schema, _coerce, options) => {
    calls.push({ task, prompt: p, webSearch: options?.webSearch });
    return task === "research-prototype" ? DesignResearchSchema.parse(brief) : PrototypeUISchema.parse(answer);
  });
  const researched = await runWithUsageContext("ba", "P2", () => quiet(() => generatePrototypeUI(offline)));
  restore2();
  t("research runs first, with web search", calls[0]?.task === "research-prototype" && calls[0].webSearch === true && calls[1]?.task === "generate-prototype-ui", calls.map((c) => c.task).join());
  t("design prompt carries the research brief", calls[1]?.prompt.includes("RESEARCH DONE BEFORE THIS DESIGN") && calls[1].prompt.includes("Example Desk") && calls[1].prompt.includes("Stage board"));
  t("research is kept on the definition for the BA", researched.designResearch?.comparableApps[0]?.name === "Example Desk" && researched.designResearch.screenPatterns.length === 1);
  t("only web links are kept as sources", researched.designResearch?.sources.length === 1 && researched.designResearch.sources[0].url.startsWith("https://"));
  t("research prompt names every screen and asks for real products only", offline.screens.every((s) => buildResearchPrompt(offline).includes(`id="${s.id}"`)) && /Name only products you actually found/.test(buildResearchPrompt(offline)));

  // Research fails: the AI still designs, from the definition alone (a new input, so no saved answer applies)
  calls.length = 0;
  const restore3 = setProviderForTests("gemini", async (task) => (task === "research-prototype" ? null : PrototypeUISchema.parse(answer)));
  const noResearch = await runWithUsageContext("ba", "P3", () => quiet(() => generatePrototypeUI({ ...offline, objective: `${offline.objective} (research fails)` })));
  restore3();
  t("research failed: the AI design still runs", noResearch.screens.some((s) => s.ui?.origin === "AI") && !noResearch.designResearch);

  // Every provider fails while a key is set (a new input, so no saved answer applies): an error, not an offline prototype passed off as the result
  const restore4 = setProviderForTests("gemini", async () => null);
  let thrown: unknown = null;
  try { await runWithUsageContext("ba", "P4", () => quiet(() => generatePrototypeUI({ ...offline, objective: `${offline.objective} (AI down)` }))); } catch (e) { thrown = e; }
  restore4();
  t("AI down with a key set: Build Prototype reports it instead of going offline", thrown instanceof AIUnavailableError);

  // A model labels a field with a format outside the list: the definition is still accepted
  process.env.GEMINI_API_KEY = "g";
  const { ProductDefinitionSchema } = await import("../server/aiSchemas");
  const withLabels = JSON.parse(JSON.stringify(def));
  // Shape the offline sample like a model answer: only BU/INFERRED origins, no empty table cells
  for (const e of withLabels.dataEntities) for (const f of e.fields) if (f.origin !== "BU" && f.origin !== "INFERRED") f.origin = "INFERRED";
  for (const sc of withLabels.screens) if (sc.ui?.table) sc.ui.table.rows = sc.ui.table.rows.map((r: unknown[]) => r.map((c) => c ?? "-"));
  withLabels.dataEntities[0].fields[0].format = "string";
  withLabels.dataEntities[0].fields[1].format = "made-up-label";
  withLabels.dataEntities[0].fields[1].sensitivity = "top-secret";
  t("control: the strict schema rejects an unknown format", !ProductDefinitionSchema.safeParse(withLabels).success);
  let accepted: Awaited<ReturnType<typeof generateProductDefinition>> | null = null;
  let rejected: unknown = null;
  const restore5 = setProviderForTests("gemini", async (_task, _p, schema, coerce) => {
    const r = schema.safeParse(coerce ? coerce(JSON.parse(JSON.stringify(withLabels))) : withLabels);
    return r.success ? r.data : null;
  });
  try { accepted = await runWithUsageContext("ba", "P5", () => quiet(() => generateProductDefinition({ ...u, extractedAt: "label-test" } as typeof u, "Label Test Product", "PV/EV", "v1.0"))); } catch (e) { rejected = e; }
  restore5();
  t("an unknown field format no longer rejects the whole definition", accepted !== null && rejected === null, String(rejected));
  delete process.env.GEMINI_API_KEY;

  // Reference image input
  t("data URL accepted", (parseReferenceImage("data:image/jpeg;base64,/9j/4AAQ") as any)?.mimeType === "image/jpeg");
  t("nothing sent -> no reference", parseReferenceImage(undefined) === null && parseReferenceImage("") === null);
  t("non-image rejected", "error" in (parseReferenceImage("data:application/pdf;base64,JVBERi0=") as object));
  t("damaged base64 rejected", "error" in (parseReferenceImage("data:image/png;base64,@@@") as object));
  t("over 4 MB rejected", "error" in (parseReferenceImage({ mimeType: "image/png", data: "A".repeat(Math.ceil((MAX_REFERENCE_BYTES * 4) / 3) + 8) }) as object));

  // Domain neutrality: no company, product or industry named in the prompt code
  const code = ["server/prototypePrompt.ts", "server/referenceImage.ts", "src/components/UIBlocks.tsx", "src/components/AppShell.tsx"].map((f) => readFileSync(f, "utf8")).join("\n");
  const banned = /\b(salesforce|servicenow|workday|sap|jira|hubspot|zendesk|stripe|shopify|uber|notion|figma|genset|vehicle|patient|hospital|bank|loan|insurance|warranty|dealer|invoice|shipment|freight|student|retail|healthcare|logistics)\b/i;
  t("prototype prompt is domain-neutral and names no company", !banned.test(code), code.match(banned)?.[0]);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
