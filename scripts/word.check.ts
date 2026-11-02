/**
 * Word documents: the .docx writer (valid package, text, tables, orientation, escaping) and the "all documents" Word pack.
 * Needs jsdom (npm install --no-save jsdom --legacy-peer-deps). Run: npm run check:word
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
// jsdom is a temporary dev tool without bundled types.
// @ts-ignore
import { JSDOM } from "jsdom";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "word-"));
process.env.AI_CACHE_DAYS = "0";
for (const k of ["AI_PROJECT_BUTTON_LIMIT", "AI_USER_BUTTON_LIMIT", "AI_USER_DAILY_TOKENS", "AI_MONTHLY_BUDGET_USD"]) process.env[k] = "0";
delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.GOOGLE_GENAI_USE_VERTEXAI; delete process.env.AI_GEMINI_BACKEND;
delete process.env.GOOGLE_API_KEY; delete process.env.GOOGLE_CLOUD_PROJECT; delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

let pass = 0, fail = 0, skip = 0;
const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); };
const quiet = async <T,>(f: () => Promise<T>): Promise<T> => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await f(); } finally { console.log = l; console.warn = w; } };
const same = (a: Uint8Array, b: Uint8Array) => Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;

const BRIEF = `Problems today: purchase requests are tracked in spreadsheets and approvals go over email.
A requester first raises a purchase requisition, then the buyer creates the purchase order, then the manager approves it, then the storekeeper posts the goods receipt, then accounts payable posts the vendor invoice.
Orders above 5 lakh need the finance head approval. No invoice is paid without a goods receipt.
It must talk to the supplier portal, the bank payment file exchange and the e-invoicing portal.`;

(async () => {
  const { renderDocx } = await import("../src/services/docx");
  const { readDocx } = await import("./docxToHtml");
  type Section = import("../src/services/docRender").Section;
  const now = new Date("2026-11-02T10:00:00Z");

  // ── the writer ────────────────────────────────────────────────────────
  const rows = (n: number) => Array.from({ length: n }, (_, i) => [`R${i + 1}`, `Row ${i + 1} text`, i % 2 ? "yes" : "no"]);
  const sections: Section[] = [
    { id: "a", title: "First", blocks: [{ kind: "p", text: "Plain paragraph." }, { kind: "p", text: "Bold paragraph.", bold: true }, { kind: "ul", items: ["one", "two", "three"] }] },
    { id: "b", title: "Narrow tables", blocks: [
      { kind: "table", head: ["#", "Question", "Your answer"], rows: [["Q1", "What is the limit?", ""], ["Q2", "Who approves?", ""]], tall: true },
      { kind: "table", head: ["Name", "Keep / Change / Remove"], rows: [["Module", ""]], note: "A note under the table." },
      { kind: "table", head: ["", ""], rows: [["Product", "Desk"], ["Version", "v1"]] },
      { kind: "table", head: ["Role", "Days"], rows: [["A", "1"], ["B", "2"]], foot: ["Total", "3"] },
    ] },
    { id: "c", title: "Wide table", blocks: [{ kind: "table", head: ["A", "B", "C", "D", "E", "F", "G"], rows: [["1", "2", "3", "4", "5", "6", "7"]] }] },
    { id: "d", title: "Back to portrait", blocks: [{ kind: "p", text: "Done." }] },
  ];
  const bytes = await renderDocx("Title & <Co>", ["Intro line one.", "Intro line two."], sections, { now, author: "Acme" });
  const d = await readDocx(bytes);
  const zip = await JSZip.loadAsync(bytes);
  const need = ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/numbering.xml", "word/footer1.xml", "word/_rels/document.xml.rels", "docProps/core.xml", "docProps/app.xml"];
  t("a real .docx package: every required part is present", need.every((n) => d.names.includes(n)), d.names.join(","));
  let wellFormed = true;
  for (const n of d.names.filter((x) => /\.(xml|rels)$/.test(x))) { try { new JSDOM(await zip.file(n)!.async("string"), { contentType: "text/xml" }); } catch { wellFormed = false; } }
  t("every XML part is well formed", wellFormed);
  const rels = new JSDOM(await zip.file("word/_rels/document.xml.rels")!.async("string"), { contentType: "text/xml" }).window.document;
  t("every relationship points at a part that exists", (Array.from(rels.getElementsByTagName("Relationship")) as Element[]).every((r) => zip.file(`word/${r.getAttribute("Target")}`)));
  const types = await zip.file("[Content_Types].xml")!.async("string");
  t("every part has a content type", ["document", "styles", "numbering", "footer"].every((k) => types.includes(`/word/${k === "document" ? "document" : k === "footer" ? "footer1" : k}.xml`)) && types.includes("/docProps/core.xml"));
  t("the file starts like a zip (PK) and is small", bytes[0] === 0x50 && bytes[1] === 0x4b && bytes.length < 20000, String(bytes.length));
  t("the title, author and date are in the file properties", d.title === "Title & <Co>" && d.core.getElementsByTagName("dc:creator")[0]?.textContent === "Acme" && d.core.getElementsByTagName("dcterms:created")[0]?.textContent === "2026-11-02T10:00:00Z");

  const doc = new JSDOM(d.html).window.document;
  t("title, intro and numbered headings in order", doc.querySelector("h1")?.textContent === "Title & <Co>" && (Array.from(doc.querySelectorAll("h2")) as Element[]).map((h) => h.textContent).join("|") === "1. First|2. Narrow tables|3. Wide table|4. Back to portrait" && (doc.body.textContent ?? "").includes("Intro line two."));
  t("bold paragraph is bold, plain is not; bullets are real list items", doc.querySelectorAll("p b").length === 1 && doc.querySelectorAll("li").length === 3 && d.xml.getElementsByTagName("w:numPr").length === 3);
  const tbls = Array.from(d.xml.getElementsByTagName("w:tbl"));
  t("five tables, none directly after another (Word would merge them)", tbls.length === 5 && tbls.every((tb) => { const next = tb.nextElementSibling; return !!next && next.localName === "p"; }), tbls.map((tb) => tb.nextElementSibling?.localName).join(","));
  t("every row has as many cells as the header, and every cell holds a paragraph (Word requires one)", tbls.every((tb) => { const cols = tb.getElementsByTagName("w:gridCol").length; return Array.from(tb.getElementsByTagName("w:tr")).every((tr) => { const tcs = Array.from(tr.childNodes).filter((n) => (n as Element).localName === "tc") as Element[]; return tcs.length === cols && tcs.every((tc) => Array.from(tc.childNodes).some((n) => (n as Element).localName === "p")); }); }));
  t("the header row repeats on every page and is shaded", tbls[0].getElementsByTagName("w:tblHeader").length === 1 && tbls[0].innerHTML.includes('w:fill="EEF2FF"'));
  t("tall rows give room to write in; ordinary tables do not", tbls[0].getElementsByTagName("w:trHeight").length === 2 && tbls[1].getElementsByTagName("w:trHeight").length === 0);
  t("a label/value table (empty header) has no header row", tbls[2].getElementsByTagName("w:tblHeader").length === 0 && tbls[2].getElementsByTagName("w:tr").length === 2);
  t("a footer row is bold", Array.from(tbls[3].getElementsByTagName("w:tr")).pop()!.getElementsByTagName("w:b").length >= 2);
  t("a note under a table is italic", d.xml.getElementsByTagName("w:i").length === 1 && (doc.body.textContent ?? "").includes("A note under the table."));
  const widths = (tb: Element) => Array.from(tb.getElementsByTagName("w:gridCol")).map((g) => Number(g.getAttribute("w:w")));
  t("column widths add up to the page (portrait 9638, landscape 14570)", widths(tbls[0]).reduce((a, b) => a + b, 0) === 9638 && widths(tbls[3]).reduce((a, b) => a + b, 0) === 9638 && widths(tbls[3 - 0]).every((w) => w > 0) && widths(tbls[3]).length === 2);
  const wide = widths(tbls.find((tb) => tb.getElementsByTagName("w:gridCol").length === 7)!);
  t("a wide table is in a landscape part of the document", d.landscapeSections === 1 && d.portraitSections === 2 && wide.reduce((a, b) => a + b, 0) === 14570);
  t("the last thing in the body is the final section's page setup", (d.xml.getElementsByTagName("w:body")[0].lastElementChild as Element).localName === "sectPr");
  t("labels are never squeezed below their longest word (no 'Remov e')", Math.min(...widths(tbls[1])) >= 6 * 105 + 240 && widths(tbls[0])[2] >= "answer".length * 105 + 240);
  t("the footer has the page number field", (await zip.file("word/footer1.xml")!.async("string")).includes("PAGE"));

  // hostile and awkward text
  const nasty = "<script>alert(1)</script> & \"quoted\" 'single' \u0001\u0008 emoji 😀 lone\uD800 end\nsecond line";
  const nd = await readDocx(await renderDocx(nasty, [nasty], [{ id: "n", title: nasty, blocks: [{ kind: "p", text: nasty }, { kind: "ul", items: [nasty] }, { kind: "table", head: [nasty], rows: [[nasty]] }] }], { now }));
  const nt = new JSDOM(nd.html).window.document.body.textContent ?? "";
  t("hostile text is carried as text (no element, no control characters, no broken pairs)", nd.xml.getElementsByTagName("script").length === 0 && nt.includes("<script>alert(1)</script> & \"quoted\" 'single'") && !/[\u0001\u0008]/.test(nt) && nt.includes("😀") && !nt.includes("\uD800"), nt.slice(0, 120));
  t("a line break inside a text becomes a Word line break", nd.xml.getElementsByTagName("w:br").length >= 5);
  const empty = await readDocx(await renderDocx("Empty", [], [], { now }));
  t("a document with no sections is still a valid document", empty.names.includes("word/document.xml") && empty.portraitSections === 1);
  const big = await readDocx(await renderDocx("Big", [], [{ id: "x", title: "Rows", blocks: [{ kind: "table", head: ["#", "Text", "Y"], rows: rows(600) }] }], { now }));
  t("a 600-row table is written whole", big.xml.getElementsByTagName("w:tr").length === 601);
  t("deterministic: same input, same bytes; another date, other bytes", same(bytes, await renderDocx("Title & <Co>", ["Intro line one.", "Intro line two."], sections, { now, author: "Acme" })) && !same(bytes, await renderDocx("Title & <Co>", ["Intro line one.", "Intro line two."], sections, { now: new Date("2026-11-03T10:00:00Z"), author: "Acme" })));

  // ── the Word pack ─────────────────────────────────────────────────────
  const { analyzeBusinessMaterial, generateProductDefinition } = await import("../server/aiReasoningService");
  const W = await import("../server/wordPack");
  const { buildDemoPack } = await import("../server/demoPack");
  const { testSuiteSections, engineeringSections } = await import("../src/services/techDoc");
  const { currentTestSuite } = await import("../src/services/testSuite");
  const { buildEngineeringPlan } = await import("../server/engineeringPlan");
  const { buildScopeFromDefinition } = await import("../src/services/scope");

  const u = await quiet(() => analyzeBusinessMaterial([], "Purchase Desk", "Finance", BRIEF));
  const def: any = await quiet(() => generateProductDefinition(u, "Purchase Desk", "Finance"));
  const pack = await quiet(() => W.buildWordPack(def, { now }));
  const pz = await JSZip.loadAsync(pack.buffer);
  const expected = ["1-Business-Requirements-Document.docx", "2-Solution-Approach-Note.docx", "3-Review-Sheet.docx", "4-Test-Suite.docx", "5-Engineering-Plan.docx", "6-Proposal.docx", "README.txt"];
  t("the Word pack holds the six documents and a README, flat", JSON.stringify(Object.keys(pz.files).sort()) === JSON.stringify([...expected].sort()), Object.keys(pz.files).join(","));
  t("named after the product and the day, safe characters only", pack.fileName === "Purchase-Desk_all-documents-Word_2026-11-02.zip" && /^[A-Za-z0-9_.-]+$/.test(pack.fileName));
  const R: Record<string, Awaited<ReturnType<typeof readDocx>>> = {};
  for (const n of expected.filter((x) => x.endsWith(".docx"))) R[n] = await readDocx(await pz.file(n)!.async("uint8array"));
  const text = (n: string) => new JSDOM(R[n].html).window.document.body.textContent ?? "";
  t("all six are real Word documents titled for the product", Object.values(R).every((r) => r.names.includes("word/document.xml") && r.title.includes("Purchase Desk")));
  const readme = await pz.file("README.txt")!.async("string");
  t("the README says it is internal because it holds costs, and lists every file", /INTERNAL: THIS FOLDER CONTAINS COSTS/.test(readme) && expected.filter((x) => x.endsWith(".docx")).every((f) => readme.includes(f)) && /BU demo pack/.test(readme));
  const brd = text("1-Business-Requirements-Document.docx");
  t("the BRD names every role, module, screen, rule and record", [...def.personas.map((x: any) => x.name), ...def.modules.map((x: any) => x.name), ...def.screens.map((x: any) => x.name), ...def.businessRules.map((x: any) => x.code), ...def.dataEntities.map((x: any) => x.name)].every((n) => brd.includes(n)));
  const ts = text("4-Test-Suite.docx"), suite = currentTestSuite(def);
  t("the test suite has every use case, scenario and test case, with the test data", suite.useCases.every((x) => ts.includes(x.id) && ts.includes(x.title)) && suite.scenarios.every((x) => ts.includes(x.id)) && suite.testCases.every((x) => ts.includes(x.id) && ts.includes(x.expectedResult.slice(0, 40))) && suite.testCases.every((x) => ts.replace(/\s+/g, "").includes(x.testPayload.replace(/\s+/g, ""))) && /Gherkin/.test(ts));
  t("the test cases' steps are numbered, in order", suite.testCases.slice(0, 3).every((x) => ts.includes(`1. ${x.executionSteps[0].replace(/^\s*\d+[.)]\s*/, "").slice(0, 30)}`)));
  t("the scenario matrix is on landscape pages", R["4-Test-Suite.docx"].landscapeSections >= 1);
  const ep = text("5-Engineering-Plan.docx"), plan = buildEngineeringPlan(def);
  t("the engineering plan has the architecture, every service, every API endpoint and the risks", ep.includes(plan.architectureOverview.slice(0, 50)) && plan.services.every((x) => ep.includes(x.name)) && (plan.apiContracts ?? []).every((a) => ep.includes(a.endpoint)) && plan.risks.every((r) => ep.includes(r.risk.slice(0, 30))));
  const pr = text("6-Proposal.docx");
  t("the proposal has the fee in rupees, the team and the RASIC", /₹/.test(pr) && /Responsibility matrix \(RASIC\)/.test(pr) && /Team and cost/.test(pr) && R["6-Proposal.docx"].landscapeSections >= 1);
  t("it is marked DRAFT until the BU-approved scope is confirmed", /DRAFT/.test(pr) && /DRAFT/.test(readme));
  const confirmed = { ...def, scopeBaseline: { ...buildScopeFromDefinition(def), confirmed: true, approvedBy: "BA", approvedOn: "2026-11-01" } };
  const cp = await quiet(() => W.buildWordPack(confirmed, { now }));
  const cText = new JSDOM((await readDocx(await (await JSZip.loadAsync(cp.buffer)).file("6-Proposal.docx")!.async("uint8array"))).html).window.document.body.textContent ?? "";
  t("once confirmed, the proposal is no longer a draft", !/DRAFT/.test(cText) || !/not yet confirmed/.test(cText));
  t("no AI wording leaks: nothing says an allowance percentage", !/\b15\s?%/.test(pr) && !/contingency/i.test(pr));

  // the team's own plan and an AI suite are used when present
  const teamPlan = { ...plan, architectureOverview: "TEAM-ARCHITECTURE-MARKER" };
  const withPlan = await quiet(() => W.buildWordPack(def, { now, pkg: { plan: teamPlan } as any }));
  const wpz = await JSZip.loadAsync(withPlan.buffer);
  t("the plan from the Engineering Package step is used when there is one", new JSDOM((await readDocx(await wpz.file("5-Engineering-Plan.docx")!.async("uint8array"))).html).window.document.body.textContent!.includes("TEAM-ARCHITECTURE-MARKER") && /from the Engineering Package step/.test(await wpz.file("README.txt")!.async("string")));
  t("the README says when the plan was derived by rules", /derived from the BRD by rules; open the Engineering Package step/.test(readme));

  // the BU pack stays free of costs while the team's pack has them
  const bu = await quiet(() => buildDemoPack(def, { now }));
  const buz = await JSZip.loadAsync(bu.buffer);
  const buText = (await Promise.all(Object.keys(buz.files).filter((n) => n.endsWith(".docx")).map(async (n) => new JSDOM((await readDocx(await buz.file(n)!.async("uint8array"))).html).window.document.body.textContent))).join("\n");
  t("the BU demo pack is Word (.docx) too, and still has no costs, while the team's pack does", Object.keys(buz.files).filter((n) => n.endsWith(".docx")).length === 3 && !/₹|\bINR\b|person-?days?|RASIC/i.test(buText) && /₹/.test(pr));
  t("the BU pack carries no test suite or engineering plan", !Object.keys(buz.files).some((n) => /Test-Suite|Engineering/.test(n)));

  // package implementation: the fit-gap travels into the Word BRD and proposal
  const pu = await quiet(() => analyzeBusinessMaterial([], "Purchase Desk", "Finance", BRIEF, { kind: "package", platform: "Northwind Suite 9" }));
  const pdef: any = await quiet(() => generateProductDefinition(pu, "Purchase Desk", "Finance"));
  const pp = await quiet(() => W.buildWordPack(pdef, { now }));
  const ppz = await JSZip.loadAsync(pp.buffer);
  const pbrd = new JSDOM((await readDocx(await ppz.file("1-Business-Requirements-Document.docx")!.async("uint8array"))).html).window.document.body.textContent!;
  const ppr = new JSDOM((await readDocx(await ppz.file("6-Proposal.docx")!.async("uint8array"))).html).window.document.body.textContent!;
  t("package mode: the Word BRD has the fit-gap for the platform the BA typed", /How Northwind Suite 9 meets the requirements \(fit-gap\)/.test(pbrd) && /FG-01/.test(pbrd) && !/fit-gap/i.test(brd));
  t("package mode: the proposal says the platform is implemented and the team is the package team", /implement Northwind Suite 9/.test(ppr) && /Functional Consultant/.test(ppr));
  t("package mode: the README names the platform", /implementation of Northwind Suite 9/.test(await ppz.file("README.txt")!.async("string")));

  // technical sections are plain: same width in every row; no money
  const allSections = [...testSuiteSections(def, suite), ...engineeringSections(def, plan)];
  t("technical sections: every table row is as wide as its header", allSections.every((s) => s.blocks.every((b) => b.kind !== "table" || b.rows.every((r) => r.length === b.head.length))));
  t("technical sections carry no money or effort", !/₹|\bINR\b|person-?days?/i.test(JSON.stringify(allSections)));
  t("an empty plan or suite still gives a valid document", (await readDocx(await renderDocx("x", [], engineeringSections(def, { origin: "OFFLINE", architectureOverview: "A", services: [], events: [], nonFunctional: [], security: [], integrationContracts: [], backlog: [], deployment: [], risks: [], testStrategy: [] }), { now }))).names.includes("word/document.xml"));

  // a real word processor opens them (only where one is installed)
  let soffice = "";
  try { soffice = execFileSync("which", ["soffice"], { encoding: "utf8" }).trim(); } catch { /* none */ }
  if (soffice) {
    const dir = path.join(process.env.DATA_DIR!, "lo");
    mkdirSync(dir, { recursive: true });
    const files: string[] = [];
    for (const [zname, z] of [["c", pz], ["p", ppz], ["b", buz]] as const) {
      for (const n of Object.keys(z.files).filter((x) => x.endsWith(".docx"))) { const f = path.join(dir, `${zname}-${n}`); writeFileSync(f, await z.file(n)!.async("nodebuffer")); files.push(f); }
    }
    try {
      execFileSync(soffice, ["--headless", "--convert-to", "pdf", "--outdir", path.join(dir, "out"), ...files], { stdio: "ignore", timeout: 240000, env: { ...process.env, HOME: dir } });
      const made = files.filter((f) => existsSync(path.join(dir, "out", path.basename(f).replace(/\.docx$/, ".pdf"))));
      t(`LibreOffice opened and converted all ${files.length} Word files`, made.length === files.length, `${made.length}/${files.length}`);
      t("the converted files have content (not blank pages)", made.every((f) => readFileSync(path.join(dir, "out", path.basename(f).replace(/\.docx$/, ".pdf"))).length > 8000));
    } catch (e) { t("LibreOffice opened the Word files", false, String((e as Error).message).slice(0, 100)); }
  } else { skip++; console.log("SKIP  no word processor installed here to open the files in"); }

  console.log(`\n${pass} passed, ${fail} failed${skip ? `, ${skip} skipped` : ""}`);
  process.exit(fail ? 1 : 0);
})();
