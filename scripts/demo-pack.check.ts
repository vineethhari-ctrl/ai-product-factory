/**
 * BU demo pack: the zip for the business. Builds the real pack, unzips it and reads every file.
 * Needs jsdom (npm install --no-save jsdom --legacy-peer-deps). Run: npm run check:pack
 */
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
// jsdom is a temporary dev tool without bundled types.
// @ts-ignore
import { JSDOM } from "jsdom";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "pack-"));
process.env.AI_CACHE_DAYS = "0";
for (const k of ["AI_PROJECT_BUTTON_LIMIT", "AI_USER_BUTTON_LIMIT", "AI_USER_DAILY_TOKENS", "AI_MONTHLY_BUDGET_USD"]) process.env[k] = "0";
delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.GOOGLE_GENAI_USE_VERTEXAI; delete process.env.AI_GEMINI_BACKEND;
delete process.env.GOOGLE_API_KEY; delete process.env.GOOGLE_CLOUD_PROJECT; delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); };
const quiet = async <T,>(f: () => Promise<T>): Promise<T> => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await f(); } finally { console.log = l; console.warn = w; } };
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

const BRIEF = `Goal: Cut the time it takes to resolve a service request.
Journey: Request Logged → Triaged → Assigned → Resolved → Closed
Who does what: Clerks log requests, supervisors triage them, technicians resolve them, managers close them, auditors review the history.
Pain points: Requests get lost between teams; nobody owns a late request.
Rules: A request cannot be closed before it is resolved; urgent requests need a supervisor within 2 hours.
KPIs: Resolution time; first-time fix rate.
Integrations: Identity service; SMS gateway.
Parts: Spare parts such as filter, valve, pump.`;

(async () => {
  const { analyzeBusinessMaterial, generateProductDefinition } = await import("../server/aiReasoningService");
  const P = await import("../server/demoPack");
  const { buildPrototypeHtml } = await import("../server/prototypeExport");
  const { brdSections, reviewSections, approachSections, basisOf } = await import("../src/services/brdDoc");
  const { forAudience } = await import("../src/services/questionAudience");
  const { currentApproachNote } = await import("../src/services/approachNote");

  const u = await quiet(() => analyzeBusinessMaterial([], "Request Desk", "Operations", BRIEF));
  const base = await quiet(() => generateProductDefinition(u, "Request Desk", "Operations"));
  // Things the team keeps must never reach the business.
  const def: any = {
    ...base,
    testSuite: { marker: "SECRET-TEST-SUITE" }, proposal: { vendorName: "Acme Digital", narrative: { marker: "SECRET-PROPOSAL" }, rateCard: { marker: "SECRET-RATES" } },
    scopeBaseline: { marker: "SECRET-SCOPE" }, designResearch: { marker: "SECRET-RESEARCH" },
    openQuestions: [...base.openQuestions, { id: "oq-tech-x", question: "Which message broker and database engine will carry the audit events?", urgency: "important", status: "open", audience: "TECH" }, { id: "oq-bu-x", question: "Who signs off a request that is closed on a holiday?", urgency: "blocking", status: "open", audience: "BU" }],
    assumptions: [...(base.assumptions ?? []), { id: "as-x", statement: "Requests are logged during office hours only.", riskLevel: "medium", status: "pending-validation" }],
  };
  const now = new Date("2026-11-02T10:00:00Z");
  const pack = await quiet(() => P.buildDemoPack(def, { now }));

  // ── the zip ──
  const zip = await JSZip.loadAsync(pack.buffer);
  const names = Object.keys(zip.files).sort();
  t("the pack holds exactly the five files, in a flat folder", JSON.stringify(names) === JSON.stringify([...P.DEMO_PACK_FILES].sort()), names.join(", "));
  t("the file is named after the product and the day", pack.fileName === "Request-Desk_BU-demo-pack_2026-11-02.zip" && pack.files.length === 5);
  const text = async (n: string) => zip.file(n)!.async("string");
  const readme = await text("README.txt"), proto = await text("1-Prototype.html");
  const docs = { brd: await text("2-Business-Requirements-Document.doc"), note: await text("3-Solution-Approach-Note.doc"), review: await text("4-Review-Sheet.doc") };
  const parse = (h: string) => new JSDOM(h).window.document;
  const D = { brd: parse(docs.brd), note: parse(docs.note), review: parse(docs.review) };
  const visible = (d: Document) => d.body.textContent ?? "";
  t("it is small enough to email (under 2 MB zipped)", pack.buffer.length < 2_000_000, `${Math.round(pack.buffer.length / 1024)} KB`);
  const again = await quiet(() => P.buildDemoPack(def, { now }));
  const zip2 = await JSZip.loadAsync(again.buffer);
  const same = await Promise.all(names.map(async (n) => sha(await zip.file(n)!.async("string")) === sha(await zip2.file(n)!.async("string"))));
  t("the same input gives the same pack, file by file", same.every(Boolean));
  t("the prototype in the pack is the stand-alone prototype file", sha(proto) === sha(await quiet(() => buildPrototypeHtml(def))) && /<script id="prototype-data"/.test(proto));

  // ── README ──
  t("the README names every file and says how to open the prototype", ["1-Prototype.html", "2-Business-Requirements-Document.doc", "3-Solution-Approach-Note.doc", "4-Review-Sheet.doc"].every((f) => readme.includes(f)) && /Double-click/.test(readme) && /no internet/i.test(readme));
  t("the README says what the business should do, in order, and what is not in the pack", /HOW TO REVIEW/.test(readme) && /Must be answered before sign-off/.test(readme) && /Costs, effort and schedule are not part of this pack/.test(readme));
  t("the README carries the product, business unit, version, date and who prepared it", readme.includes("Request Desk") && readme.includes("Operations") && readme.includes(def.version) && readme.includes("2 November 2026") && readme.includes("Acme Digital"));

  // ── the BRD ──
  const brdText = visible(D.brd);
  t("the BRD is a Word-openable document titled for the product", /^<html xmlns:o=/.test(docs.brd) && D.brd.title === "Business Requirements Document: Request Desk" && D.brd.querySelector("h1")?.textContent === D.brd.title);
  t("it has the date, the status and the version", brdText.includes("2 November 2026") && brdText.includes("Draft for business review") && brdText.includes(def.version));
  t("it names every role, module, screen, journey and connection", [...def.personas.map((x: any) => x.name), ...def.modules.map((x: any) => x.name), ...def.screens.map((x: any) => x.name), ...def.userJourneys.map((x: any) => x.name), ...def.integrations.map((x: any) => x.system)].every((n) => brdText.includes(n)));
  t("it lists every business rule with its code", def.businessRules.every((r: any) => brdText.includes(r.code) && brdText.includes(r.rule.slice(0, 40))));
  t("it lists every record, and the business fields of each (never the system fields)", def.dataEntities.every((e: any) => brdText.includes(e.name)) && !/rowVersion|createdBy|updatedAt/.test(brdText));
  t("it shows the stages of the process with who does each", /Request Logged/.test(brdText) && /Triaged/.test(brdText) && D.brd.querySelectorAll("table").length >= 8);
  t("it describes each business document: statuses in order and what people can do", def.screens.filter((s: any) => s.layoutType === "transaction" && s.ui?.document).every((s: any) => brdText.includes(s.ui.document.name)) && /Statuses, in order/.test(brdText));
  const inferred = def.personas.concat(def.modules, def.screens, def.businessRules, def.integrations).filter((x: any) => x.confidence !== "CONFIRMED").length;
  t("what the AI proposed is marked so it is not mistaken for a decision, and the count is right", brdText.includes("Proposed: please confirm") && brdText.includes("Stated by the business") && brdText.includes(`Items proposed for you to confirm${inferred}`), `${inferred}`);
  t("only the business's own questions are listed (technical ones stay with the team)", brdText.includes("Who signs off a request that is closed on a holiday?") && !brdText.includes("message broker"));
  t("it ends with a sign-off table with room to sign", /Sign-off/.test(brdText) && D.brd.querySelector("table.tall") !== null);

  // ── the review sheet ──
  const rv = visible(D.review);
  const buOpen = forAudience(def.openQuestions, "BU", (q: any) => q.question).filter((q: any) => q.status === "open");
  const rows = (d: Document, i: number) => Array.from(d.querySelectorAll("table")[i]?.querySelectorAll("tbody tr") ?? []).map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => td.textContent ?? ""));
  const qRows = rows(D.review, 0);
  t("every open business question is on the sheet, numbered, with an empty box for the answer", qRows.length === buOpen.length && qRows.every((r, i) => r[0] === `Q${i + 1}` && r[r.length - 1] === "") && buOpen.every((q: any) => rv.includes(q.question)));
  const isBlocking = (r: string[]) => /Must be answered before sign-off/.test(r[2] ?? "");
  const firstOther = qRows.findIndex((r) => !isBlocking(r));
  t("the questions that block sign-off come first, all of them, before the rest", qRows.some(isBlocking) && (firstOther === -1 || qRows.slice(firstOther).every((r) => !isBlocking(r))) && qRows.filter(isBlocking).some((r) => r[1] === "Who signs off a request that is closed on a holiday?"), JSON.stringify(qRows.map((r) => r[2])));
  t("technical questions are not on the sheet", !rv.includes("message broker"));
  t("the answer columns have room to write in", D.review.querySelectorAll("table.tall").length >= 3);
  const aRows = rows(D.review, 1);
  t("assumptions that need confirming are listed with an empty box", aRows.some((r) => r[1].includes("Requests are logged during office hours only.") && r[r.length - 1] === "") && aRows.every((r) => r[r.length - 1] === ""));
  const iRows = rows(D.review, 2);
  t("every proposed item is listed with an empty Keep / Change / Remove box", iRows.length === inferred && iRows.every((r) => r[r.length - 1] === "") && ["Module", "Screen", "Rule", "Connection", "Role"].some((k) => iRows.some((r) => r[0] === k)), `${iRows.length} vs ${inferred}`);
  t("it explains how to answer, in plain words", /Keep, Change or Remove/.test(rv) && /start with the questions marked/.test(rv));

  // ── the approach note ──
  const nt = visible(D.note);
  const note = currentApproachNote(def);
  t("the approach note has the summary, the problems, the solution, the phases and the risks", nt.includes(note.executiveSummary.slice(0, 60)) && note.asIsProblemStatement.every((x: string) => nt.includes(x.slice(0, 40))) && note.phasedExecutionStrategy.every((x: any) => nt.includes(x.phase)) && note.keyRisksAndMitigations.every((x: any) => nt.includes(x.risk.slice(0, 40))));
  t("only the decisions that belong to the business are in it", !nt.includes("message broker"));

  // ── nothing the team keeps reaches the business ──
  const dataBlock = JSON.parse(parse(proto).getElementById("prototype-data")!.textContent!);
  const everything = [readme, brdText, nt, rv, JSON.stringify(dataBlock)].join("\n");
  t("no test suite, proposal, scope, research or rate card in the pack", !/SECRET-/.test(everything + docs.brd + docs.note + docs.review));
  t("nothing about price, effort, days, rates or schedule", !/person-?(days?|months?)|day rate|rate card|contingency|allowance|statement of work|\bSOW\b|milestone payment|₹|\bINR\b|\bUSD\b|\bquote\b/i.test(everything.replace(/Costs, effort and schedule are not part of this pack\./, "")));
  t("no key, no server setting, no private text", !/GEMINI_API_KEY|ANTHROPIC_API_KEY|private_key|AIza[0-9A-Za-z_-]{20}/.test(everything + proto.slice(0, 200)));

  // ── hostile text ──
  const evil: any = { ...def, productName: "Desk </script><b>bold</b> & Co", businessUnit: "Ops <i>unit</i>", modules: def.modules.map((m: any, i: number) => (i === 0 ? { ...m, name: "<img src=x onerror=alert(1)>", description: "a | b\nc" } : m)) };
  const ep = await quiet(() => P.buildDemoPack(evil, { now }));
  const ez = await JSZip.loadAsync(ep.buffer);
  const ed = parse(await ez.file("2-Business-Requirements-Document.doc")!.async("string"));
  t("hostile text in names cannot add an element to a Word document; it reads as written", ed.querySelectorAll("img, b").length === 0 && (ed.body.textContent ?? "").includes("<img src=x onerror=alert(1)>") && ed.title.includes("</script><b>bold</b> & Co"));
  t("the file name is safe: only letters, digits and hyphens before the date", /^[A-Za-z0-9-]+_BU-demo-pack_2026-11-02\.zip$/.test(ep.fileName), ep.fileName);

  // ── edge cases ──
  const calm: any = { ...def, isApproved: true, openQuestions: [], assumptions: [], personas: def.personas.map((x: any) => ({ ...x, confidence: "CONFIRMED" })), modules: def.modules.map((x: any) => ({ ...x, confidence: "CONFIRMED" })), screens: def.screens.map((x: any) => ({ ...x, confidence: "CONFIRMED" })), businessRules: def.businessRules.map((x: any) => ({ ...x, confidence: "CONFIRMED" })), integrations: def.integrations.map((x: any) => ({ ...x, confidence: "CONFIRMED" })), userJourneys: def.userJourneys.map((x: any) => ({ ...x, confidence: "CONFIRMED" })) };
  const calmReview = reviewSections(calm).map((s) => JSON.stringify(s)).join(" ");
  t("with nothing to ask, the sheet says so instead of showing empty tables", /no open questions/.test(calmReview) && /no assumptions waiting/.test(calmReview) && /Everything in the document was stated by the business/.test(calmReview));
  t("an approved BRD says Approved", JSON.stringify(brdSections(calm)).includes('"Approved"'));
  t("the words for how sure we are", basisOf("CONFIRMED") === "Stated by the business" && basisOf("INFERRED") === "Proposed: please confirm" && basisOf("AMBIGUOUS").startsWith("Unclear") && basisOf(undefined) === "Proposed: please confirm");
  const noVendor = await quiet(() => P.buildDemoPack({ ...def, proposal: undefined }, { now }));
  t("without a vendor name the pack still builds and the README carries no 'by' line (nothing is invented)", !/Prepared on 2 November 2026 by/.test(await (await JSZip.loadAsync(noVendor.buffer)).file("README.txt")!.async("string")));
  t("sections are plain: every table has a header and rows of the same width", [...brdSections(def), ...reviewSections(def), ...approachSections(def, note)].every((s) => s.blocks.every((b) => b.kind !== "table" || b.rows.every((r) => r.length === b.head.length))));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
