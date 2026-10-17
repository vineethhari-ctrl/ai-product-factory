/**
 * Business documents ('transaction' screens): the arithmetic, the cleaning of AI-written documents, the offline
 * document built from a record, the pipeline (every prototype has document screens; the AI may add screens for
 * documents that had none) and the real screen driven in jsdom: New, required fields, line items and totals,
 * workflow actions, rejecting with a reason, converting into the next document, read-only users.
 * Run: npm run check:transactions. Needs jsdom (npm install --no-save jsdom --legacy-peer-deps), like check:ui.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
// jsdom is a temporary dev tool without bundled types.
// @ts-ignore
import { JSDOM } from "jsdom";

const dir = mkdtempSync(path.join(tmpdir(), "apf-docs-"));
process.env.DATA_DIR = dir;
for (const k of ["AI_PROJECT_BUTTON_LIMIT", "AI_USER_BUTTON_LIMIT", "AI_USER_DAILY_TOKENS", "AI_MONTHLY_BUDGET_USD"]) process.env[k] = "0";
for (const k of Object.keys(process.env)) if (/^AI_(ORDER|CLAUDE_MODEL|GEMINI_MODEL|GEMINI_FALLBACK)_/.test(k)) delete process.env[k];
delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.GOOGLE_GENAI_USE_VERTEXAI; delete process.env.AI_GEMINI_BACKEND;

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
const g = globalThis as any;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
for (const k of ["HTMLElement", "HTMLInputElement", "HTMLSelectElement", "HTMLTextAreaElement", "Event", "MouseEvent", "Node", "getComputedStyle"]) g[k] = (dom.window as any)[k];
g.IS_REACT_ACT_ENVIRONMENT = true;

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); };
const quiet = async <T,>(fn: () => Promise<T>) => { const w = console.warn, l = console.log; console.warn = console.log = () => {}; try { return await fn(); } finally { console.warn = w; console.log = l; } };

async function main() {
  type Doc = import("../src/types").TransactionDocument;
  const math = await import("../src/services/documentMath");
  const { cleanDocument, documentFromEntity } = await import("../server/documents");
  const { analyzeBusinessMaterial, generateProductDefinition, generatePrototypeUI } = await import("../server/aiReasoningService");
  const { setProviderForTests } = await import("../server/llmRouter");
  const { PrototypeUISchema } = await import("../server/aiSchemas");
  const { runWithUsageContext } = await import("../server/usage");
  const { DOCUMENT_RULES, buildPrototypePrompt } = await import("../server/prototypePrompt");

  // ── Arithmetic and workflow ─────────────────────────────────────────────
  const doc: Doc = {
    name: "Agreement", numberPrefix: "AG-",
    sections: [
      { title: "Who it is for", fields: [
        { label: "Party", kind: "lookup", required: true, options: ["Alpha Co", "Beta Co"] },
        { label: "Number", kind: "text", readOnly: true },
        { label: "Valid until", kind: "date" },
      ] },
      { title: "Terms", fields: [{ label: "Payment terms", kind: "select", options: ["30 days", "60 days"], required: true }, { label: "Notes", kind: "long-text" }] },
    ],
    lines: {
      title: "Items",
      columns: [{ label: "Item", kind: "select", options: ["Unit X", "Unit Y"] }, { label: "Qty", kind: "number" }, { label: "Unit price", kind: "money" }, { label: "Disc %", kind: "percent" }, { label: "Amount", kind: "money" }],
      rows: [["Unit X", "2", "1,000", "10", ""]],
      quantityColumn: "Qty", priceColumn: "Unit price", discountColumn: "Disc %", amountColumn: "Amount",
    },
    totals: { currency: "EUR", taxLabel: "VAT", taxPercent: 10 },
    states: ["Draft", "Sent for approval", "Approved", "Rejected"],
    actions: [
      { label: "Send for approval", from: ["Draft"], to: "Sent for approval" },
      { label: "Approve", from: ["Sent for approval"], to: "Approved", role: "Manager", creates: "Follow-up" },
      { label: "Reject", from: ["Sent for approval"], to: "Rejected", needsReason: true },
    ],
    related: { from: "Enquiry", next: ["Follow-up"] },
  };
  t("numbers as people write them", math.parseNumber("1,20,000.50") === 120000.5 && math.parseNumber("€1,250") === 1250 && math.parseNumber("15%") === 15 && Number.isNaN(math.parseNumber("n/a")));
  t("line amount = quantity x price less discount", math.lineAmount(doc, ["Unit X", "2", "1,000", "10", ""]) === 1800);
  const tot = math.documentTotals(doc, [["Unit X", "2", "1,000", "10", ""], ["Unit Y", "1", "200", "", ""]]);
  t("totals: subtotal, tax on it, total", tot.subtotal === 2000 && tot.tax === 200 && tot.total === 2200, JSON.stringify(tot));
  t("money shown in the document's currency", /2[,.]?200/.test(math.formatMoney(2200, "EUR")) && /€|EUR/.test(math.formatMoney(2200, "EUR")));
  t("actions offered per status", math.actionsFor(doc, "Draft").map((a) => a.label).join() === "Send for approval" && math.actionsFor(doc, "Sent for approval").length === 2 && math.actionsFor(doc, "Approved").length === 0);
  t("required header fields are listed until filled", math.missingRequired(doc, {}).join() === "Party,Payment terms" && math.missingRequired(doc, { Party: "Alpha Co", "Payment terms": "30 days" }).length === 0);

  // ── Cleaning an AI-written document ─────────────────────────────────────
  const messy = cleanDocument({
    name: "  Request  ", numberPrefix: "r q",
    sections: [{ title: "", fields: [{ label: "Party", kind: "dropdown" as any, options: ["One"] }, { label: "Party", kind: "text" }, { label: "Body", kind: "textarea" as any }, { label: "", kind: "text" }] }],
    lines: { title: "Lines", columns: [{ label: "What", kind: "text" }, { label: "Qty", kind: "number" }, { label: "Price", kind: "money" }], rows: [["a", "1"], ["b", "2", "3", "extra"]], quantityColumn: "qty", priceColumn: "Price", amountColumn: "Missing" },
    totals: { currency: "eur", taxPercent: 250 },
    states: ["Open", "open", "Done"],
    actions: [{ label: "Close", from: ["OPEN"], to: "done" }, { label: "Nowhere", from: [], to: "Lost" }],
  } as any);
  t("cleaned: name, prefix, sections", messy?.name === "Request" && messy.numberPrefix === "RQ-" && messy.sections[0].title === "Details");
  t("cleaned: unknown kinds mapped, a select with one option becomes a lookup, duplicates and blank labels dropped",
    messy?.sections[0].fields.map((f) => `${f.label}:${f.kind}`).join() === "Party:lookup,Body:long-text", JSON.stringify(messy?.sections[0].fields));
  t("cleaned: an amount column is added for quantity x price, every line has one cell per column",
    messy?.lines?.amountColumn === "Amount" && messy.lines.quantityColumn === "Qty" && messy.lines.rows.every((r) => r.length === 4), JSON.stringify(messy?.lines));
  t("cleaned: currency upper-cased, an impossible tax rate dropped", messy?.totals?.currency === "EUR" && !messy.totals.taxPercent);
  t("cleaned: statuses without duplicates, actions only between real statuses (matched case-insensitively)",
    messy?.states.join() === "Open,Done" && messy.actions.length === 1 && messy.actions[0].from[0] === "Open" && messy.actions[0].to === "Done", JSON.stringify(messy?.actions));
  const bare = cleanDocument({ name: "Form", numberPrefix: "", sections: [{ title: "A", fields: [{ label: "X", kind: "text" }] }], states: ["New", "Checked", "Closed"], actions: [] } as any);
  t("cleaned: a document without actions can still move forward step by step", bare?.actions.map((a) => `${a.from[0]}>${a.to}`).join() === "New>Checked,Checked>Closed");
  t("cleaned: nothing to render -> no document", cleanDocument({ name: "X", sections: [{ title: "A", fields: [] }] } as any) === undefined && cleanDocument({ name: "", sections: [] } as any) === undefined);

  // ── Offline: the document built from a record ──────────────────────────
  const brief = "a person registers each booking, a coordinator confirms the booking, and a manager approves the booking. Bookings list items such as seats, meals, transfers";
  const u = await quiet(() => analyzeBusinessMaterial([], "Booking Desk", "Events", brief));
  const def = await quiet(() => generateProductDefinition(u, "Booking Desk", "Events"));
  const proto = await quiet(() => generatePrototypeUI(def));
  const docScreens = proto.screens.filter((s) => s.layoutType === "transaction" && s.ui?.document);
  t("offline: every prototype has at least one document screen", docScreens.length >= 1, proto.screens.map((s) => s.layoutType).join());
  const offDoc = docScreens[0]?.ui?.document;
  t("offline: the screen's first action is New + the document", !!offDoc && docScreens[0].ui!.primaryActions[0] === `New ${offDoc.name}`, docScreens[0]?.ui?.primaryActions.join());
  t("offline: header fields are business fields, no ids, audit stamps or status", !!offDoc && offDoc.sections.flatMap((s) => s.fields).every((f) => !/^(id|created|updated|row version|status)/i.test(f.label)), offDoc?.sections.flatMap((s) => s.fields.map((f) => f.label)).join());
  t("offline: statuses come from the record's lifecycle and every status but the last can move on", !!offDoc && offDoc.states.length >= 3 && offDoc.states.slice(0, -1).some((s) => math.actionsFor(offDoc, s).length > 0));
  const ent = def.dataEntities.find((e) => e.lifecycle)!;
  const withParts = documentFromEntity(ent, ent.name, { stages: [], parties: [], subject: ent.name, parts: { name: "item", types: ["Seat", "Meal"] } } as any);
  t("offline: child records named in the brief become line items", withParts.lines?.columns[0].options?.join() === "Seat,Meal" && withParts.lines.quantityColumn === "Quantity");

  // ── AI path: documents from the design, and a screen added for a document that had none ──
  process.env.GEMINI_API_KEY = "g";
  const target = proto.screens.find((s) => s.layoutType !== "transaction")!;
  const answer = {
    theme: { primaryColor: "#1D4ED8", accentColor: "#F59E0B", sidebarStyle: "dark", density: "comfortable" },
    screens: [
      { screenId: target.id, inspiredBy: "Document list with editor", layoutType: "transaction",
        ui: { entity: "", benchmarkNote: "Users create and send documents here.", kpis: [], filters: ["All"], table: { title: "Agreements", columns: ["Number", "Party", "Total", "Status"], rows: [["AG-1001", "Alpha Co", "2,200", "Draft"]] }, detailPanels: [], primaryActions: ["New Agreement"], device: "desktop", document: doc } },
      { screenId: "scr-doc-follow-up", name: "Follow-ups", module: "Documents", purpose: "Create and work follow-ups", inspiredBy: "Document list", layoutType: "transaction",
        ui: { entity: "", benchmarkNote: "Next document in the chain.", kpis: [], filters: [], table: { title: "Follow-ups", columns: ["Number", "Status"], rows: [["FU-1", "Open"]] }, detailPanels: [], primaryActions: ["New Follow-up"], device: "desktop",
          document: { name: "Follow-up", numberPrefix: "FU", sections: [{ title: "Details", fields: [{ label: "Subject", kind: "text", required: true }] }], states: ["Open", "Done"], actions: [{ label: "Complete", from: ["Open"], to: "Done" }] } } },
      { screenId: "scr-doc-ignored", inspiredBy: "x", layoutType: "dashboard", ui: { entity: "", benchmarkNote: "", kpis: [], filters: [], table: { title: "", columns: [], rows: [] }, detailPanels: [], primaryActions: [], device: "desktop" } },
    ],
  };
  t("stand-in design matches the schema", PrototypeUISchema.safeParse(answer).success, JSON.stringify(PrototypeUISchema.safeParse(answer).error?.issues?.[0]));
  let prompt = "";
  const restore = setProviderForTests("gemini", async (task, p) => (task === "research-prototype" ? null : ((prompt = p), PrototypeUISchema.parse(answer))));
  const ai = await runWithUsageContext("ba", "D1", () => quiet(() => generatePrototypeUI({ ...def, objective: `${def.objective} (documents)` })));
  restore();
  delete process.env.GEMINI_API_KEY;
  t("design prompt puts business documents at the core", prompt.includes("BUSINESS DOCUMENTS ARE THE CORE") && prompt.includes('"transaction"'));
  const redesigned = ai.screens.find((s) => s.id === target.id);
  t("AI: the screen becomes a document screen with the cleaned document", redesigned?.layoutType === "transaction" && redesigned.ui?.document?.name === "Agreement" && redesigned.ui.document.numberPrefix === "AG-");
  const added = ai.screens.find((s) => s.name === "Follow-ups");
  t("AI: a screen is added for a document that had none, with menu entry and module", !!added && added.layoutType === "transaction" && ai.navigation.some((n) => n.screenId === added.id) && ai.modules.some((m) => m.screens.includes(added.id)), added?.id);
  t("AI: an unknown screen that is not a document is ignored", !ai.screens.some((s) => s.id === "scr-doc-ignored"));

  // ── Domain neutrality ──────────────────────────────────────────────────
  const code = ["server/documents.ts", "src/services/documentMath.ts", "src/components/TransactionScreen.tsx"].map((f) => readFileSync(f, "utf8")).join("\n") + DOCUMENT_RULES + buildPrototypePrompt({ ...def, screens: [], personas: [], userJourneys: [], dataEntities: [], businessRules: [], blueprintBrief: undefined }, false);
  const banned = /\b(quote|quotation|invoice|purchase order|sales order|lead|opportunit(y|ies)|customer|patient|vehicle|loan|insurance|warranty|dealer|shipment|freight|student|genset)\b/i;
  t("document code and rules name no business domain", !banned.test(code), code.match(banned)?.[0]);

  // ── The real screen in jsdom ───────────────────────────────────────────
  const React = (await import("react")).default;
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const { TransactionScreen } = await import("../src/components/TransactionScreen");
  const container = document.getElementById("root")!;
  const root = createRoot(container);
  const ui = {
    kpis: [], filters: [], detailPanels: [], primaryActions: ["New Agreement"],
    table: { title: "Agreements", columns: ["Number", "Party", "Total", "Status"], rows: [["AG-1001", "Alpha Co", "2,200", "Draft"], ["AG-1002", "Beta Co", "980", "Sent for approval"]] },
    document: doc,
  };
  const text = () => container.textContent ?? "";
  const buttons = () => [...container.querySelectorAll("button")] as HTMLButtonElement[];
  const button = (label: string | RegExp) => buttons().find((b) => (typeof label === "string" ? b.textContent?.trim() === label : label.test(b.textContent ?? "")));
  const click = async (el: Element | undefined) => { await act(async () => { el?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); }); };
  const setValue = async (el: Element | null | undefined, value: string) => {
    if (!el) return;
    const proto = el.tagName === "SELECT" ? dom.window.HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
      el.dispatchEvent(new dom.window.Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    });
  };
  const fieldInput = (label: string) => [...container.querySelectorAll("label")].find((l) => l.querySelector("span")?.textContent?.replace("*", "").trim() === label)?.querySelector("input,select,textarea") as HTMLInputElement | undefined;
  const lineCells = () => [...container.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("input,select")] as HTMLInputElement[]);

  await act(async () => { root.render(React.createElement(TransactionScreen, { ui, readOnly: false, userName: "Tester" })); });
  t("ui: the list shows the documents and a New button", text().includes("AG-1001") && text().includes("AG-1002") && !!button(/New Agreement/));
  await click(button(/New Agreement/));
  t("ui: New opens a blank document with the next number in the first status", text().includes("Agreement AG-1003") && text().includes("Draft"), text().slice(0, 120));
  await click(button("Send for approval"));
  t("ui: sending without required fields is refused and the fields are marked", text().includes("Fill in Party") && text().includes("Required") && !text().includes("Agreement AG-1003Sent"));
  await setValue(fieldInput("Party"), "Alpha Co");
  await setValue(fieldInput("Payment terms"), "30 days");
  const [first] = lineCells();
  await setValue(first[0], "Unit X");
  await setValue(first[1], "2");
  await setValue(first[2], "1000");
  await setValue(first[3], "10");
  t("ui: the line amount and the totals are calculated as you type", /1[,.]?800\.00/.test(text()) && /1[,.]?980\.00/.test(text()), text().match(/Subtotal.{0,80}/)?.[0]);
  await click(button(/Add line/));
  t("ui: Add line adds a row", lineCells().length === 2);
  await click(button("Send for approval"));
  t("ui: the workflow action moves the document to the next status and records it", text().includes("Sent for approval") && text().includes("Send for approval") && text().includes("Tester"));
  t("ui: once sent, the header is locked", !!fieldInput("Party")?.disabled);
  await click(button("Approve"));
  t("ui: converting creates the next document in the chain", /Follow-up FO-\d+/.test(text()) && text().includes("Approved"), text().match(/Follow-up.{0,20}/)?.[0]);
  await click(button(/All Agreement documents/));
  t("ui: back in the list the new document is there with its status and total", text().includes("AG-1003") && /1[,.]?980/.test(text()));
  const rowOf = (num: string) => [...container.querySelectorAll("tbody tr")].find((tr) => tr.textContent?.includes(num));
  await click(rowOf("AG-1002"));
  await click(button("Reject"));
  t("ui: rejecting asks for a reason first", text().includes("Reason for") && !!button("Confirm")?.disabled);
  await setValue(container.querySelector("input[autofocus], .bg-rose-50\\/40 input") as HTMLInputElement, "Price too high");
  await click(button("Confirm"));
  t("ui: with a reason the document is rejected and the reason kept in its history", text().includes("Rejected") && text().includes("Price too high"));

  await act(async () => { root.render(React.createElement(TransactionScreen, { key: "ro", ui, readOnly: true })); });
  t("ui: a view-only user cannot create documents", !!button(/New Agreement/)?.disabled);
  await act(async () => root.unmount());
}

main()
  .catch((e) => { fail++; console.error(e); })
  .finally(() => {
    rmSync(dir, { recursive: true, force: true });
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  });
