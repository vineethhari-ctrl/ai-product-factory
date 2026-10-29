/**
 * Hash-chained ledger: SHA-256, chain verification, tampering, the server step that adds the ledger screen, and the real
 * screen driven in jsdom. Run: npm run check:chain. Needs jsdom (npm install --no-save jsdom --legacy-peer-deps), like check:ui.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
// @ts-ignore
import { JSDOM } from "jsdom";

const dir = mkdtempSync(path.join(tmpdir(), "apf-chain-"));
process.env.DATA_DIR = dir;
process.env.AI_CACHE_DAYS = "0";
for (const k of ["AI_PROJECT_BUTTON_LIMIT", "AI_USER_BUTTON_LIMIT", "AI_USER_DAILY_TOKENS", "AI_MONTHLY_BUDGET_USD"]) process.env[k] = "0";
delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.GOOGLE_GENAI_USE_VERTEXAI; delete process.env.AI_GEMINI_BACKEND;

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
const g = globalThis as any;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
for (const k of ["HTMLElement", "HTMLInputElement", "HTMLSelectElement", "HTMLTextAreaElement", "HTMLButtonElement", "Event", "MouseEvent", "Node", "getComputedStyle"]) g[k] = (dom.window as any)[k];
g.IS_REACT_ACT_ENVIRONMENT = true;

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); };
const quiet = async <T,>(fn: () => Promise<T>) => { const w = console.warn, l = console.log; console.warn = console.log = () => {}; try { return await fn(); } finally { console.warn = w; console.log = l; } };

async function main() {
  const { sha256Hex } = await import("../src/services/sha256");
  const pc = await import("../src/services/proofChain");

  // ── SHA-256 ────────────────────────────────────────────────────────────
  const samples = ["", "abc", "The quick brown fox jumps over the lazy dog", "é€😀 unicode", "a".repeat(1000), "x".repeat(55), "y".repeat(56), "z".repeat(64), "w".repeat(119), "v".repeat(120)];
  t("SHA-256 equals Node's own on empty, padding-boundary, long and unicode inputs", samples.every((s) => sha256Hex(s) === createHash("sha256").update(s).digest("hex")));
  t("the empty string has the well-known hash", sha256Hex("") === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");

  // ── The chain ──────────────────────────────────────────────────────────
  const rows = Array.from({ length: 6 }, (_, i) => ({ Seq: String(i + 1), Event: `Step ${i + 1}`, Amount: String(100 * (i + 1)) }));
  const sealed = pc.sealChain(rows);
  t("a sealed chain verifies: every block valid, no first broken block", pc.verifyChain(sealed).ok && pc.verifyChain(sealed).statuses.every((s) => s === "valid") && pc.verifyChain(sealed).firstBroken === null);
  t("each hash depends on the previous one: the same record with another history hashes differently", pc.sealChain([rows[0], rows[1]])[1].hash !== pc.sealChain([rows[2], rows[1]])[1].hash);
  t("the first block chains to the genesis", sealed[0].hash === pc.blockHash(pc.GENESIS, rows[0]) && pc.previousHash(sealed, 0) === pc.GENESIS && pc.previousHash(sealed, 3) === sealed[2].hash);
  const anchor = { hash: sealed.at(-1)!.hash, length: sealed.length };
  const tampered = pc.tamper(sealed, 2, "Amount", "999999");
  const vt = pc.verifyChain(tampered, anchor);
  t("editing block 3 breaks block 3 and every block after it, not the ones before", vt.statuses.join() === "valid,valid,broken,broken,broken,broken" && vt.firstBroken === 2 && !vt.ok, vt.statuses.join());
  t("the stored hashes were not touched by the edit", tampered.every((b, i) => b.hash === sealed[i].hash));
  const hidden = pc.rewriteHistory(tampered);
  const vh = pc.verifyChain(hidden, anchor);
  t("recomputing every hash makes the chain look consistent but the published anchor exposes it", vh.statuses.every((s) => s === "valid") && vh.firstBroken === null && !vh.anchorMatches && !vh.ok);
  const grown = pc.appendBlock(sealed, { Seq: "7", Event: "Step 7", Amount: "700" });
  const vg = pc.verifyChain(grown, anchor);
  t("a legitimately appended record keeps the chain and the anchor valid", grown.length === 7 && vg.ok && vg.anchorMatches && grown[6].hash === pc.blockHash(sealed[5].hash, grown[6].content));
  t("rewriting with the same content changes nothing; deterministic", pc.rewriteHistory(sealed).every((b, i) => b.hash === sealed[i].hash) && JSON.stringify(pc.sealChain(rows)) === JSON.stringify(pc.sealChain(rows)));
  t("the demo edit always changes the value (number moves, text is flagged)", pc.alteredValue("1,250.00") !== "1,250.00" && pc.alteredValue("Approved") === "Approved (edited)" && pc.alteredValue("0") !== "0");

  // ── When the BRD needs a ledger ────────────────────────────────────────
  const { analyzeBusinessMaterial, generateProductDefinition, generatePrototypeUI } = await import("../server/aiReasoningService");
  const { needsChain, chainEntity, withProofChain } = await import("../server/proofChain");
  const BRIEF_PLAIN = `Problems today: applicants keep calling to ask for status.\n\nAn applicant first submits a form, then the clerk checks the documents, then the manager approves, then the cashier releases the money.\n\nIt must send SMS updates.`;
  const BRIEF_CHAIN = `${BRIEF_PLAIN}\n\nRules:\nEvery step is stored in a tamper-evident, append-only history so nobody can change a past entry;\nA request cannot be approved without a complete document set.`;
  const mk = async (brief: string) => { const u = await quiet(() => analyzeBusinessMaterial([], "Request Desk", "Operations", brief)); return quiet(() => generateProductDefinition(u, "Request Desk", "Operations")); };
  const plain = await mk(BRIEF_PLAIN);
  const chained = await mk(BRIEF_CHAIN);
  t("a BRD with no tamper-evident or append-only records gets no ledger screen", !needsChain(plain) && !plain.screens.some((s) => s.ui?.chain || s.id.startsWith("scr-chain")), plain.screens.map((s) => s.id).join());
  t("a BRD that asks for tamper-evident, append-only records gets one ledger screen", needsChain(chained) && chained.screens.filter((s) => s.ui?.chain).length === 1);
  const led = chained.screens.find((s) => s.ui?.chain)!;
  t("the ledger screen has a sequence column, 6+ records, a menu entry and a module", led.ui!.table.columns[0] === "Seq" && led.ui!.table.rows.length >= 6 && chained.navigation.some((n) => n.screenId === led.id) && chained.modules.some((m) => m.screens.includes(led.id)));
  t("the ledger screen's rows are words and codes from the definition, not hashes", led.ui!.table.rows.every((r) => r.every((c) => !/^[0-9a-f]{40,}$/.test(c))) && led.ui!.table.rows.some((r) => r.some((c) => chained.dataEntities.some((e) => c.includes(e.name)))));
  t("idempotent: running the step again adds nothing", withProofChain(chained).screens.length === chained.screens.length && JSON.stringify(withProofChain(chained)) === JSON.stringify(chained));
  const replaced = { ...chained, screens: chained.screens.map((s) => (s.id === led.id ? { ...s, ui: { ...s.ui!, chain: undefined } } : s)) };
  const back = withProofChain(replaced);
  t("a later design that drops the ledger marker gets it put back on the same screen, not a second screen", back.screens.length === chained.screens.length && back.screens.find((s) => s.id === led.id)?.ui?.chain?.title === led.ui!.chain!.title);
  const aiMarked = { ...plain, businessRules: [{ ...plain.businessRules[0], id: "br-test", rule: "Entries are append-only." }, ...plain.businessRules.slice(1)], screens: plain.screens.map((s, i) => (i === 0 ? { ...s, ui: { ...s.ui!, chain: { title: "Mine" } } } : s)) };
  const boiler = { ...plain, businessRules: [{ ...plain.businessRules[0], id: "br-test", rule: "Every change is written to an append-only audit log." }, ...plain.businessRules.slice(1)] };
  t("a plain append-only audit log is boilerplate and does not create a ledger; a hash chain, tamper evidence or an append-only ledger does", !needsChain(boiler) && [["Records are hash-chained.", true], ["Entries are tamper-evident.", true], ["The ledger is append-only.", true], ["A Merkle root is published.", true], ["Every change is logged.", false]].every(([txt, want]) => needsChain({ ...plain, businessRules: [{ ...plain.businessRules[0], id: "br-test", rule: txt as string }, ...plain.businessRules.slice(1)] }) === want));
  const camel = withProofChain({ ...plain, dataEntities: plain.dataEntities.map((e, i) => (i === 0 ? { ...e, name: "BatteryPack" } : e)), businessRules: [{ ...plain.businessRules[0], id: "br-test", rule: "Records are hash-chained." }, ...plain.businessRules.slice(1)] }).screens.find((s) => s.ui?.chain);
  t("the ledger names the record in words (a run-together name is spaced)", !!camel && /Battery Pack/.test(camel.name + camel.ui!.table.rows.flat().join(" ")) || !!camel && !/[a-z][A-Z]/.test(camel.name), camel?.name);
  t("a ledger marked by the AI on its own screen is kept; no extra screen is added", withProofChain(aiMarked).screens.length === plain.screens.length);
  const withEntity = { ...plain, dataEntities: [...plain.dataEntities, { id: "e-led", name: "Ledger Entry", description: "x", fields: [{ name: "sequence_number", type: "number", required: true }, { name: "event_type", type: "string", required: true }, { name: "previous_entry_hash", type: "string", required: true }, { name: "current_entry_hash", type: "string", required: true }] } as any] };
  t("a record with a previous-hash field and its own hash field is recognised as a chain", chainEntity(withEntity)?.name === "Ledger Entry" && needsChain(withEntity) && !chainEntity(plain));
  const fromEntity = withProofChain(withEntity).screens.find((s) => s.ui?.chain);
  t("its ledger shows the record's own business fields, never its hash fields", !!fromEntity && fromEntity.ui!.table.columns.every((c) => !/hash/i.test(c)) && fromEntity.ui!.table.columns.some((c) => /event/i.test(c)), JSON.stringify(fromEntity?.ui?.table.columns));

  // Through Build Prototype (offline engine): exactly one ledger screen, and the prototype counts as designed only when every screen is.
  const proto = await quiet(() => generatePrototypeUI(chained));
  t("Build Prototype keeps exactly one ledger screen", proto.screens.filter((s) => s.ui?.chain).length === 1);

  // ── The prompt ─────────────────────────────────────────────────────────
  const { buildPrototypePrompt } = await import("../server/prototypePrompt");
  t("the design prompt asks for the ledger only when the BRD needs one, and forbids invented hashes", buildPrototypePrompt(chained, false).includes("HASH-CHAINED LEDGER") && !buildPrototypePrompt(plain, false).includes("HASH-CHAINED LEDGER") && /Do NOT write hash values/.test(buildPrototypePrompt(chained, false)));
  const { PrototypeUISchema } = await import("../server/aiSchemas");
  const okChain = PrototypeUISchema.safeParse({ theme: { primaryColor: "#112233", accentColor: "#223344", sidebarStyle: "dark", density: "comfortable" }, screens: [{ screenId: "s", inspiredBy: "x", layoutType: "table-detail", ui: { kpis: [], filters: [], table: { title: "t", columns: ["a", "b"], rows: [["1", "2"]] }, detailPanels: [], primaryActions: [], benchmarkNote: "n", entity: "", device: "desktop", chain: { title: "L", note: "n" } } }] });
  t("the design schema accepts a ledger marker", okChain.success, JSON.stringify((okChain as any).error?.issues?.[0]));

  // ── The real screen in jsdom ───────────────────────────────────────────
  const React = (await import("react")).default;
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const { ProofChain } = await import("../src/components/ProofChain");
  const container = document.getElementById("root")!;
  const root = createRoot(container);
  const columns = ["Seq", "Event", "Record", "Amount"];
  const trows = Array.from({ length: 5 }, (_, i) => [String(i + 1), `Event ${i + 1}`, `R-${1040 + i}`, `${(i + 1) * 100}.00`]);
  await act(async () => { root.render(React.createElement(ProofChain, { title: "Test ledger", columns, rows: trows })); });
  const click = async (el: Element | null | undefined) => { await act(async () => { el?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); }); };
  const btn = (label: string) => [...container.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes(label));
  const statuses = () => [...container.querySelectorAll("[data-block]")].map((b) => b.getAttribute("data-status"));
  t("the screen lists every block, none checked yet", statuses().length === 5 && statuses().every((s) => s === "unchecked"), statuses().join());
  await click(btn("Verify chain"));
  t("Verify chain: every block valid and a green verdict", statuses().every((s) => s === "valid") && /Verified/.test(container.querySelector("[role=status]")?.textContent ?? ""), container.textContent?.slice(0, 200));
  await click(container.querySelector("[data-block='2']"));
  await click(btn("Edit this record"));
  t("after an edit nothing is flagged until the user verifies", statuses().every((s) => s === "unchecked"));
  await click(btn("Verify chain"));
  t("Verify chain after editing block 2: block 1 valid, blocks 2 to 5 broken, a tampering verdict", statuses().join() === "valid,broken,broken,broken,broken" && /Tampering detected at block 2/.test(container.querySelector("[role=status]")?.textContent ?? ""), statuses().join());
  await click(btn("Recompute all hashes"));
  await click(btn("Verify chain"));
  t("hiding the edit by recomputing hashes: every block looks valid, but the anchor mismatch is reported", statuses().every((s) => s === "valid") && /rewritten/.test(container.querySelector("[role=status]")?.textContent ?? ""), container.querySelector("[role=status]")?.textContent ?? "");
  await click(btn("Reset"));
  await click(btn("Add record"));
  await click(btn("Verify chain"));
  t("Reset restores the sealed ledger; a record appended after sealing is a valid extension", statuses().length === 6 && statuses().every((s) => s === "valid") && /Verified/.test(container.querySelector("[role=status]")?.textContent ?? ""), statuses().join());
  await act(async () => root.unmount());

  // ── Neutrality ─────────────────────────────────────────────────────────
  const code = ["src/services/sha256.ts", "src/services/proofChain.ts", "src/components/ProofChain.tsx", "server/proofChain.ts"].map((f) => readFileSync(f, "utf8")).join("\n") + (await import("../server/prototypePrompt")).LEDGER_RULES;
  const banned = /\b(vehicle|battery|warranty|loan|bank|patient|hospital|insurance|dealer|invoice|shipment|freight|student|genset|passport|claim)\b/i;
  t("ledger code and prompt name no business domain", !banned.test(code), code.match(banned)?.[0]);
}

main()
  .catch((e) => { fail++; console.error(e); })
  .finally(() => {
    rmSync(dir, { recursive: true, force: true });
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  });
