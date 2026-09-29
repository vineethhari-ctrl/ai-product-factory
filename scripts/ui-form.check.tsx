/**
 * Drives the real EntityForm in jsdom: typing, blur errors, conditional fields,
 * step gating, submit and double-submit. Run: npx tsx scripts/ui-form.check.tsx
 * Needs jsdom (npm install --no-save jsdom --legacy-peer-deps); it is not a project dependency.
 */
// jsdom is a temporary dev tool without bundled types.
// @ts-ignore
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
const g = globalThis as any;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
for (const k of ["HTMLElement", "HTMLInputElement", "HTMLSelectElement", "HTMLTextAreaElement", "Event", "MouseEvent", "Node", "getComputedStyle"]) g[k] = (dom.window as any)[k];
g.IS_REACT_ACT_ENVIRONMENT = true;

async function main() {
  const React = (await import("react")).default;
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const { EntityForm } = await import("../src/components/EntityForm");
  const { validateRecordHandler } = await import("../server/recordRoute");
  type E = import("../src/types").DataEntityDefinition;

  let pass = 0, fail = 0;
  const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); };

  const entity: E = {
    id: "e", name: "Slot Reservation", description: "", relationships: [], confidence: "INFERRED", evidence: [],
    fields: [
      { name: "mode", type: "enum(ONSITE, REMOTE)", required: true },
      { name: "address", type: "string", required: false, constraints: { maxLength: 120 } },
      { name: "startAt", type: "datetime", required: true },
      { name: "endAt", type: "datetime", required: true },
      { name: "notes", type: "text", required: false, constraints: { format: "free-text", maxLength: 50 }, origin: "INFERRED" },
      { name: "contactEmail", type: "email", required: true },
      { name: "backupPhone", type: "phone", required: false },
      { name: "email2", type: "email", required: false },
    ],
    rules: [
      { id: "r1", kind: "conditional", when: { field: "mode", op: "eq", value: "ONSITE" }, effect: "required", target: "address", message: "Address is required for onsite." },
      { id: "r2", kind: "conditional", when: { field: "mode", op: "eq", value: "REMOTE" }, effect: "forbidden", target: "address", message: "No address for remote." },
      { id: "r3", kind: "compare", left: "startAt", op: "lt", right: "endAt", message: "End must be after start." },
    ],
  };

  const container = document.getElementById("root")!;
  const root = createRoot(container);
  let fetchCalls = 0;
  g.fetch = async (_url: string, init: { body: string }) => {
    fetchCalls++;
    let status = 200, payload: any;
    const res: any = { status(c: number) { status = c; return res; }, json(p: unknown) { payload = p; return res; } };
    validateRecordHandler({ body: JSON.parse(init.body) } as any, res);
    await new Promise((r) => setTimeout(r, 20));
    return { ok: status >= 200 && status < 300, status, json: async () => payload };
  };

  const $ = (sel: string) => container.querySelector(sel) as any;
  const $$ = (sel: string) => Array.from(container.querySelectorAll(sel)) as any[];
  const setNative = (el: any, value: string) => {
    const proto = el instanceof dom.window.HTMLSelectElement ? dom.window.HTMLSelectElement.prototype : el instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  };
  const type = async (el: any, value: string) => act(async () => { setNative(el, value); el.dispatchEvent(new dom.window.Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  const blur = async (el: any) => act(async () => { el.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true })); el.dispatchEvent(new dom.window.FocusEvent("blur")); });
  const click = async (el: any) => act(async () => { el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true })); });
  const text = () => container.textContent ?? "";
  const btn = (label: RegExp) => $$("button").find((b) => label.test(b.textContent ?? ""));
  const field = (label: RegExp) => { const l = $$("label").find((x) => label.test(x.textContent ?? "")); return l ? container.querySelector(`#${l.getAttribute("for")}`) as any : null; };

  await act(async () => { root.render(React.createElement(EntityForm, { entity, readOnly: false, submitLabel: "Reserve" })); });

  // Step 1
  t("renders a stepper for 8 fields (2 steps)", $$("ol li").length === 2);
  t("required fields carry a marker", $$("label").filter((l) => l.textContent?.includes("*")).length >= 3);
  t("inferred field is badged", text().includes("inferred"));
  t("select rendered for enum", field(/^Mode/)?.tagName === "SELECT");
  t("datetime-local input for datetime", field(/^Start at/)?.type === "datetime-local");
  t("Next disabled while step 1 has issues", btn(/Next/)?.disabled === true);
  t("no error shown before interaction", !text().includes("is required."));

  await blur(field(/^Mode/));
  t("blur shows a required error", text().includes("mode is required."), text().slice(0, 200));

  await type(field(/^Mode/), "ONSITE");
  t("conditional: address becomes required", /Address\s*\*/.test(field(/^Address/)?.closest("div")?.textContent ?? "") || (field(/^Address/) !== null && $$("label").find((l) => /^Address/.test(l.textContent ?? ""))!.textContent!.includes("*")));
  await type(field(/^Mode/), "REMOTE");
  t("conditional: address is hidden when forbidden", field(/^Address/) === null);

  await type(field(/^Start at/), "2026-10-01T09:00");
  await type(field(/^End at/), "2026-10-01T08:00");
  await blur(field(/^End at/));
  t("Next still disabled: end before start (compare rule)", btn(/Next/)?.disabled === true);
  await type(field(/^End at/), "2026-10-01T10:00");
  t("Next enabled once step 1 is valid", btn(/Next/)?.disabled === false);

  await click(btn(/Next/));
  t("moved to step 2", field(/^Contact email/) !== null && field(/^Mode/) === null);
  t("submit disabled while a required field is empty", btn(/Reserve/)?.disabled === true);

  await type(field(/^Contact email/), "not-an-email");
  await blur(field(/^Contact email/));
  t("bad email shows an error under the field", text().includes("valid email address"), text().slice(-300));
  t("error is wired for accessibility", field(/^Contact email/)?.getAttribute("aria-invalid") === "true" && !!field(/^Contact email/)?.getAttribute("aria-describedby"));
  await type(field(/^Contact email/), "a@b.co");
  t("error clears when the value is fixed", !text().includes("valid email address"));
  t("submit enabled when the record is valid", btn(/Reserve/)?.disabled === false);

  // Submit twice quickly: only one request
  await act(async () => {
    const b = btn(/Reserve/);
    b.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    b.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
  t("double submit sends one request", fetchCalls === 1, String(fetchCalls));
  t("server verdict is shown (same rules)", text().includes("Passed client and server validation"), text().slice(-300));

  // Read-only role
  await act(async () => { root.render(React.createElement(EntityForm, { entity, readOnly: true })); });
  t("read-only: inputs disabled", $$("input, select, textarea").every((el) => el.disabled));

  // ScreenCanvas wiring: a form-wizard screen renders the validated form for its entity
  const { ScreenCanvas } = await import("../src/components/ScreenCanvas");
  const ui = { kpis: [], filters: ["All"], table: { title: "Recent", columns: ["ID", "Status"], rows: [["R-1", "Active"]] }, detailPanels: [], primaryActions: ["Reserve"], entity: "slot reservation" };
  const screen = (over: object = {}) => ({ id: "s", name: "New reservation", module: "Booking", layoutType: "form-wizard" as const, components: [], purpose: "p", confidence: "CONFIRMED" as const, evidence: [], ui: { ...ui, ...over } });
  await act(async () => { root.render(React.createElement(ScreenCanvas, { screen: screen(), readOnly: false, entities: [entity] })); });
  t("canvas: form-wizard renders EntityForm via ui.entity (punctuation-insensitive name match)", field(/^Mode/)?.tagName === "SELECT" && text().includes("Recent"));
  await act(async () => { root.render(React.createElement(ScreenCanvas, { screen: screen({ entity: undefined }), readOnly: false, entities: [entity] })); });
  t("canvas: no ui.entity and no name match falls back without crashing", field(/^Mode/) === null && text().length > 0);
  await act(async () => { root.render(React.createElement(ScreenCanvas, { screen: { ...screen({ entity: undefined }), name: "Slot Reservation intake" }, readOnly: false, entities: [entity] })); });
  t("canvas: falls back to matching the entity name in the screen text", field(/^Mode/)?.tagName === "SELECT");
  await act(async () => { root.render(React.createElement(ScreenCanvas, { screen: screen(), readOnly: false })); });
  t("canvas: no entities supplied keeps the static wizard", field(/^Mode/) === null);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main();
