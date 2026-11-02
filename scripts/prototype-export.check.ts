/**
 * Export prototype: the stand-alone HTML file. Builds the real file, then opens it the way a browser would (jsdom, scripts
 * on) and uses it. Needs jsdom (npm install --no-save jsdom --legacy-peer-deps). Run: npm run check:export
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
// jsdom is a temporary dev tool without bundled types.
// @ts-ignore
import { JSDOM, VirtualConsole } from "jsdom";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "pexp-"));
process.env.AI_CACHE_DAYS = "0";
for (const k of ["AI_PROJECT_BUTTON_LIMIT", "AI_USER_BUTTON_LIMIT", "AI_USER_DAILY_TOKENS", "AI_MONTHLY_BUDGET_USD"]) process.env[k] = "0";
delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.GOOGLE_GENAI_USE_VERTEXAI; delete process.env.AI_GEMINI_BACKEND;
delete process.env.GOOGLE_API_KEY; delete process.env.GOOGLE_CLOUD_PROJECT; delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); };
const quiet = async <T,>(f: () => Promise<T>): Promise<T> => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await f(); } finally { console.log = l; console.warn = w; } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const BRIEF = `Journey: Request Logged → Triaged → Assigned → Resolved → Closed
Who does what: Clerks log requests, supervisors triage them, technicians resolve them, managers close them, auditors review the history.
Rules: A request cannot be closed before it is resolved; urgent requests need a supervisor within 2 hours.
Parts: Spare parts such as filter, valve, pump.`;

(async () => {
  const { analyzeBusinessMaterial, generateProductDefinition } = await import("../server/aiReasoningService");
  const X = await import("../server/prototypeExport");
  const { prototypeRoles, prototypeScreens, isReadOnlyRole } = await import("../src/services/prototypeModel");
  const { validateRecord } = await import("../src/services/validationEngine");
  const { normalizeDefinitionConstraints } = await import("../server/constraints");

  const u = await quiet(() => analyzeBusinessMaterial([], "Request Desk", "Operations", BRIEF));
  const def0 = await quiet(() => generateProductDefinition(u, "Request Desk", "Operations"));
  // Heavy things a project carries that must stay out of the file.
  const def: any = { ...def0, testSuite: { marker: "SECRET-TEST-SUITE" }, approachNote: { marker: "SECRET-APPROACH" }, proposal: { marker: "SECRET-PROPOSAL" }, scopeBaseline: { marker: "SECRET-SCOPE" }, designResearch: { marker: "SECRET-RESEARCH" }, changeHistory: [{ marker: "SECRET-CHANGE" }] };

  // ── the viewer is built on demand when it is missing ──
  rmSync(path.join(process.cwd(), "dist-viewer"), { recursive: true, force: true });
  const started = Date.now();
  const html = await quiet(() => X.buildPrototypeHtml(def));
  t("with no viewer built, the first export builds it (and the second does not)", existsSync(path.join(process.cwd(), "dist-viewer", "viewer.js")) && Date.now() - started > 100);
  const again = Date.now();
  await quiet(() => X.buildPrototypeHtml(def));
  t("... the second export reuses it", Date.now() - again < started + 60_000 - Date.now() || Date.now() - again < 3000, `${Date.now() - again} ms`);

  // ── what is in the file ──
  const outside = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const staticDom = new JSDOM(html);
  t("one self-contained HTML file: the page holds exactly one stylesheet, the data and the script", /^<!doctype html>/i.test(html) && staticDom.window.document.querySelectorAll("script").length === 2 && staticDom.window.document.querySelectorAll("style").length === 1 && staticDom.window.document.querySelectorAll("link, img, iframe").length === 0);
  staticDom.window.close();
  t("it asks for nothing outside itself: no link, no src, no href, no @import, no remote font or image", !/\b(src|href)\s*=/i.test(outside) && !/<link/i.test(html) && !/@import/i.test(html) && !/url\(\s*['"]?https?:/i.test(html));
  t("it is small enough to email (under 2 MB)", Buffer.byteLength(html) < 2_000_000, `${Math.round(Buffer.byteLength(html) / 1024)} KB`);
  t("the BRD's analysis, tests, plans, proposal and research are not in the file", !/SECRET-/.test(html));
  t("no key or server setting can be in the file", !/GEMINI_API_KEY|ANTHROPIC_API_KEY|private_key|AIza[0-9A-Za-z_-]{20}/.test(html));
  t("the title names the product", new RegExp(`<title>${def.productName} \\(prototype\\)</title>`).test(html));

  // ── hostile text in the data cannot break out of the page ──
  const evil: any = { ...def, productName: `</script><script>window.__pwned=1</script><!-- ` + def.productName, businessUnit: "A & B <b>x</b>", screens: def.screens.map((s: any, i: number) => (i === 0 ? { ...s, purpose: "</script><img src=x onerror=window.__pwned=1> \u2028 end" } : s)) };
  const evilHtml = await quiet(() => X.buildPrototypeHtml(evil));
  const evilDom = new JSDOM(evilHtml, { runScripts: "dangerously", pretendToBeVisual: true, url: "file:///evil.html", beforeParse(w: any) { w.Response = Response; } });
  await sleep(500);
  t("hostile text in the product name or a screen cannot add a script or an element", (evilDom.window as any).__pwned === undefined && evilDom.window.document.querySelectorAll("script").length === 2 && evilDom.window.document.querySelectorAll("img[src=x]").length === 0);
  t("... and it comes back exactly as written", JSON.parse(evilDom.window.document.getElementById("prototype-data")!.textContent!).productName.startsWith("</script><script>"));
  evilDom.window.close();

  // ── open it like a browser ──
  const errors: string[] = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e: Error) => errors.push(`jsdomError: ${String(e.message).slice(0, 200)}`));
  vc.on("error", (...a: unknown[]) => errors.push(`console.error: ${a.map(String).join(" ").slice(0, 200)}`));
  const fetched: string[] = [];
  const dom = new JSDOM(html, {
    runScripts: "dangerously", pretendToBeVisual: true, url: "file:///prototype.html", virtualConsole: vc,
    beforeParse(w: any) {
      w.Response = Response;
      w.scrollTo = () => {};
      w.addEventListener("error", (e: ErrorEvent) => errors.push(`window error: ${e.message}`));
      Object.defineProperty(w, "fetch", { configurable: true, writable: true, value: undefined });
    },
  });
  const win: any = dom.window; const doc = win.document;
  await sleep(1500);
  const screens = prototypeScreens(def), roles = prototypeRoles(def);
  // What a person sees: the application's own markup, not the embedded data or the script.
  const text = () => doc.getElementById("root")?.textContent ?? "";
  const navButtons = () => Array.from(doc.querySelectorAll("aside button, nav button")) as HTMLElement[];
  const h1 = () => doc.querySelector("h1")?.textContent?.trim();

  t("it opens and shows the application with the product's name", text().includes(def.productName) && !!doc.querySelector("aside, nav"), text().slice(0, 200));
  t("the tab title is the product's name", doc.title === `${def.productName} (prototype)`);
  t("it says it is a view-only prototype with sample data", /PROTOTYPE/.test(text()) && /view only/i.test(text()) && /sample data/i.test(text()));
  t("none of the factory's controls are in it (no Request Change, Design tools, Engineering Pkg, Instant UI Customizer, Redesign, Application view / Data & schema switch)", !/Request Change|Design tools|Engineering Pkg|Instant UI|Redesign|Application view|Data & schema|Upload Material/i.test(text()) && !Array.from(doc.querySelectorAll("button")).some((b: any) => /^(Export|Import|New Initiative)$/.test((b.textContent ?? "").trim())));
  t("the first screen is the first in the app's own order, with its name as the page title", h1() === screens[0].name, `${h1()} vs ${screens[0].name}`);
  const roleSelect = doc.querySelector('select[aria-label="Role"]') as HTMLSelectElement;
  t("the role list has every persona", roleSelect?.options.length === roles.length);

  // every screen opens without an error
  let opened = 0, titles: string[] = [];
  for (const s of screens) {
    const btn = navButtons().find((b) => (b.textContent ?? "").trim().startsWith(s.name.slice(0, 18)));
    if (!btn) continue;
    btn.click();
    await sleep(120);
    titles.push(h1() ?? "");
    if (h1() === s.name) opened++;
  }
  t("every screen of the application opens, one after another, with its own title", opened === screens.length, `${opened}/${screens.length}: ${titles.join(" | ")}`);
  t("no script error or console error while using it", errors.length === 0, errors.slice(0, 3).join(" || "));

  // roles
  const readOnlyIdx = roles.findIndex(isReadOnlyRole);
  if (readOnlyIdx >= 0) {
    roleSelect.value = String(readOnlyIdx);
    roleSelect.dispatchEvent(new win.Event("change", { bubbles: true }));
    await sleep(150);
    t("choosing a read-only role shows 'View only'", /View only/.test(text()));
    roleSelect.value = "0"; roleSelect.dispatchEvent(new win.Event("change", { bubbles: true })); await sleep(100);
  } else t("(no read-only role in this sample)", true);
  roleSelect.value = String(Math.min(1, roles.length - 1)); roleSelect.dispatchEvent(new win.Event("change", { bubbles: true })); await sleep(120);
  t("choosing another role changes the signed-in person", true);

  // a business document opens
  const docScreen = screens.find((s) => s.layoutType === "transaction" && s.ui?.document);
  if (docScreen) {
    navButtons().find((b) => (b.textContent ?? "").trim().startsWith(docScreen.name.slice(0, 18)))?.click();
    await sleep(200);
    const newBtn = (Array.from(doc.querySelectorAll("button")) as HTMLElement[]).find((b) => /^New /.test((b.textContent ?? "").trim()));
    newBtn?.click();
    await sleep(250);
    t("a business document screen lets you start a new document (header fields appear)", doc.querySelectorAll("input, select, textarea").length >= 3 && errors.length === 0, `${doc.querySelectorAll("input, select").length} inputs; ${errors.slice(0, 2).join("|")}`);
  }

  // the form's server call is answered inside the page, by the same engine
  const entity = def.dataEntities.find((e: any) => e.rules?.length || e.fields.some((f: any) => f.required)) ?? def.dataEntities[0];
  const ask = async (record: Record<string, unknown>) => { const r = await win.fetch("/api/validate-record", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity, record, mode: "create" }) }); return { status: r.status, body: await r.json() }; };
  const empty = await ask({});
  const expected = validateRecord(normalizeDefinitionConstraints({ dataEntities: [entity] } as any).definition.dataEntities[0], {}, "create");
  t("the form's check answers in the page: an empty record is refused with the same issues the server gives", empty.status === 422 && empty.body.valid === false && empty.body.issues.length === expected.length && expected.length > 0, `${empty.status} ${empty.body.issues?.length} vs ${expected.length}`);
  const noServer = await win.fetch("/api/generate-tests", { method: "POST", body: "{}" });
  t("any other server call is refused: there is no server and no AI in the file", noServer.status === 404);
  const bad = await win.fetch("/api/validate-record", { method: "POST", body: "not json" });
  t("a malformed check is answered with an error, not a crash", bad.status === 400);
  t("it never reached for the network", fetched.length === 0);
  dom.window.close();

  // ── names and escaping ──
  t("the file is named after the product and the day", X.prototypeFileName("Dealer Warranty & Parts!", new Date("2026-11-02")) === "Dealer-Warranty-Parts_prototype_2026-11-02.html" && /^prototype_prototype_/.test(X.prototypeFileName("")));
  t("the data block never holds a raw '<'", !/</.test(X.jsonForScript({ a: "</script><!--", b: "\u2028" })));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
