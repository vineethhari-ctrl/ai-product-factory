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
const { setProviderForTests } = await import("../server/llmRouter");
const { buildPrototypePrompt } = await import("../server/prototypePrompt");
const { parseReferenceImage, MAX_REFERENCE_BYTES } = await import("../server/referenceImage");
const { PrototypeUISchema } = await import("../server/aiSchemas");
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
    screens: [
      {
        screenId: first.id, inspiredBy: "Stage pipeline overview", layoutType: "dashboard",
        ui: {
          entity: "", benchmarkNote: "Shows where every record waits.",
          kpis: [{ label: "Waiting at check-in", value: "7", trend: "up", delta: "+2 vs yesterday" }],
          filters: ["All", "Waiting"], table: { title: "Today", columns: ["Ref", "Owner", "Status"], rows: [["R-1", "Ana"], ["R-2", "Ben", "Open", "extra"]] },
          detailPanels: [], primaryActions: ["Assign bay"],
        },
      },
      {
        screenId: second.id, inspiredBy: "Guided intake", layoutType: "form-wizard",
        ui: {
          entity: formEntity, benchmarkNote: "Captures the first stage.",
          kpis: [], filters: [], table: { title: "Drafts", columns: ["Ref", "Status"], rows: [["R-3", "Draft"]] }, detailPanels: [], primaryActions: ["Start"],
        },
      },
      { screenId: "scr-unknown", inspiredBy: "x", layoutType: "dashboard", ui: { entity: "Nope", benchmarkNote: "", kpis: [], filters: [], table: { title: "", columns: [], rows: [] }, detailPanels: [], primaryActions: [] } },
    ],
  };
  t("stand-in answer matches the schema", PrototypeUISchema.safeParse(answer).success, JSON.stringify(PrototypeUISchema.safeParse(answer).error?.issues?.[0]));
  const restore = setProviderForTests("gemini", async (_task, p, _schema, _coerce, options) => { seen = { prompt: p, images: options?.images }; return PrototypeUISchema.parse(answer); });
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
  delete process.env.GEMINI_API_KEY;

  // Reference image input
  t("data URL accepted", (parseReferenceImage("data:image/jpeg;base64,/9j/4AAQ") as any)?.mimeType === "image/jpeg");
  t("nothing sent -> no reference", parseReferenceImage(undefined) === null && parseReferenceImage("") === null);
  t("non-image rejected", "error" in (parseReferenceImage("data:application/pdf;base64,JVBERi0=") as object));
  t("damaged base64 rejected", "error" in (parseReferenceImage("data:image/png;base64,@@@") as object));
  t("over 4 MB rejected", "error" in (parseReferenceImage({ mimeType: "image/png", data: "A".repeat(Math.ceil((MAX_REFERENCE_BYTES * 4) / 3) + 8) }) as object));

  // Domain neutrality: no company, product or industry named in the prompt code
  const code = ["server/prototypePrompt.ts", "server/referenceImage.ts"].map((f) => readFileSync(f, "utf8")).join("\n");
  const banned = /\b(salesforce|servicenow|workday|sap|jira|hubspot|zendesk|stripe|shopify|uber|notion|figma|genset|vehicle|patient|hospital|bank|loan|insurance|warranty|dealer|invoice|shipment|freight|student|retail|healthcare|logistics)\b/i;
  t("prototype prompt is domain-neutral and names no company", !banned.test(code), code.match(banned)?.[0]);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
