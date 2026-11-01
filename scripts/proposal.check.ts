/**
 * Part 2: approved scope, effort, cost, RASIC. Run: npm run check:proposal
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "prop-"));
process.env.AI_CACHE_DAYS = "0";
for (const k of ["AI_PROJECT_BUTTON_LIMIT", "AI_USER_BUTTON_LIMIT", "AI_USER_DAILY_TOKENS", "AI_MONTHLY_BUDGET_USD"]) process.env[k] = "0";
delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.GOOGLE_GENAI_USE_VERTEXAI; delete process.env.AI_GEMINI_BACKEND;

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); };

const BRIEF = `Goal: Cut warranty claim settlement time.
Journey: Claim Raised → Dealer Verified → Technical Review → Approved → Part Returned → Inspected → Settled
Who does what: Dealer advisors raise claims, warranty engineers review them, quality inspectors check parts, finance settles payments.
Rules: A claim must carry a valid VIN; a claim above 1000 needs engineer approval; a part must be returned within 30 days; a claim cannot be settled until the part is inspected.
KPIs: Settlement time; first-time approval rate.
Integrations: Dealer management system; vehicle master; finance ERP.`;

(async () => {
  const { analyzeBusinessMaterial, generateProductDefinition } = await import("../server/aiReasoningService");
  const S = await import("../src/services/scope");
  const E = await import("../src/services/estimate");
  const quiet = async <T,>(f: () => Promise<T>): Promise<T> => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await f(); } finally { console.log = l; console.warn = w; } };
  const u = await quiet(() => analyzeBusinessMaterial([], "Dealer Warranty Claims Portal", "After-Sales", BRIEF));
  const def = await quiet(() => generateProductDefinition(u, "Dealer Warranty Claims Portal", "After-Sales"));
  const state = E.defaultProposalState();

  // ── scope ──
  const all = S.buildScopeFromDefinition(def);
  t("every BRD item is in the scope list, all kept", all.items.length === def.modules.length + def.screens.length + def.dataEntities.length + def.businessRules.length + def.integrations.length + def.userJourneys.length && all.items.every((i) => i.included && i.change === "KEPT"));
  const same = S.applyScope(def, all);
  t("nothing cut: the approved view equals the draft", same.screens.length === def.screens.length && same.businessRules.length === def.businessRules.length && same.modules.length === def.modules.length && same.integrations.length === def.integrations.length);

  const mod = def.modules[0];
  const cut = S.setIncluded(all, `module:${mod.id}`, false);
  const cutScreens = cut.items.filter((i) => i.kind === "screen" && i.parent === mod.name);
  t("cutting a module cuts its screens and marks them REMOVED", cutScreens.length > 0 && cutScreens.every((i) => !i.included && i.change === "REMOVED"), JSON.stringify(cutScreens.length));
  const approved = S.applyScope(def, cut);
  t("the approved BRD no longer has that module or its screens", !approved.modules.some((m) => m.id === mod.id) && approved.screens.length === def.screens.length - cutScreens.length);
  t("bringing the module back brings the screens back", S.applyScope(def, S.setIncluded(cut, `module:${mod.id}`, true)).screens.length === def.screens.length);
  t("the scope signature changes with the scope, not otherwise", S.scopeSignature(cut) !== S.scopeSignature(all) && S.scopeSignature(all) === S.scopeSignature(S.buildScopeFromDefinition(def)));

  const added = S.addScopeItem(all, "integration", "Loyalty Points Service", "Award points on settlement");
  t("an item the BU adds is NEW and joins the approved BRD", S.applyScope(def, added).integrations.some((i) => i.system === "Loyalty Points Service") && added.items.at(-1)!.change === "NEW");
  t("the same added item is not added twice", S.addScopeItem(added, "integration", "loyalty points service").items.length === added.items.length);
  const counts = S.scopeCounts(S.addScopeItem(cut, "rule", "NEW-1", "x"));
  t("counts add up", counts.total === counts.kept + counts.removed + counts.added && counts.removed >= 1 + cutScreens.length && counts.added === 1);

  // ── matching an uploaded final BRD ──
  const rule = def.businessRules[0], keptScreen = def.screens[def.screens.length - 1];
  const finalText = `Final approved BRD. Scope: ${keptScreen.name}. Rules: ${rule.code} ${rule.rule}.`;
  const m = S.matchScopeToText(all, finalText);
  t("a name found in the final text is kept, one not found is removed", m.find((x) => x.id === `screen:${keptScreen.id}`)!.keep && m.find((x) => x.id === `rule:${rule.id}`)!.keep && m.some((x) => !x.keep));
  const rec = S.applyReconciliation(all, m, [{ kind: "screen", name: "Dealer Scorecard" }], { fileName: "final.docx", matchedBy: "RULES" });
  t("reconciliation applies the decisions, keeps the file name and is not yet confirmed", rec.source === "upload" && rec.fileName === "final.docx" && !rec.confirmed && rec.items.some((i) => i.change === "REMOVED") && rec.items.some((i) => i.name === "Dealer Scorecard" && i.change === "NEW"));

  // ── estimate ──
  const est = E.buildEstimate(def, all, state);
  const sumF = est.activities.reduce((n, a) => n + a.functionalDays, 0), sumT = est.activities.reduce((n, a) => n + a.technicalDays, 0);
  t("every activity shows functional and technical days", est.activities.length >= 12 && est.activities.every((a) => a.functionalDays >= 0 && a.technicalDays >= 0 && a.functionalDays + a.technicalDays > 0 && a.basis && a.deliverable));
  t("totals add up (functional, technical, total)", Math.abs(est.functionalDays - sumF) < 0.5 && Math.abs(est.technicalDays - sumT) < 0.5 && Math.abs(est.totalDays - (est.functionalDays + est.technicalDays)) < 0.2);
  const roleTotal = est.team.reduce((n, r) => n + r.days, 0);
  t("days by role equal days by activity", Math.abs(roleTotal - est.totalDays) < 1.5, `${roleTotal} vs ${est.totalDays}`);
  t("cost = sum of role days x rate; contingency and total add up", Math.abs(est.team.reduce((n, r) => n + r.cost, 0) - est.subtotal) <= est.team.length && est.total === est.subtotal + est.contingency && est.contingency === Math.round(est.subtotal * 0.15));
  t("phase cost adds up to the subtotal", Math.abs(est.phases.reduce((n, p) => n + p.cost, 0) - est.subtotal) <= est.activities.length, `${est.phases.reduce((n, p) => n + p.cost, 0)} vs ${est.subtotal}`);
  t("milestone payments add up to the total exactly", est.milestones.reduce((n, x) => n + x.amount, 0) === est.total && est.milestones.reduce((n, x) => n + x.percent, 0) === 100);
  t("one build activity per module and one integration activity per integration", est.activities.filter((a) => a.id.startsWith("act-build-")).length === def.modules.length && est.activities.filter((a) => a.id.startsWith("act-int-")).length === def.integrations.length);

  const smaller = E.buildEstimate(def, cut, state);
  t("cutting a module lowers effort, cost and the build activities", smaller.totalDays < est.totalDays && smaller.total < est.total && smaller.activities.filter((a) => a.id.startsWith("act-build-")).length === def.modules.length - 1);
  const bigger = E.buildEstimate(def, added, state);
  t("adding an integration raises effort and adds an activity", bigger.totalDays > est.totalDays && bigger.activities.some((a) => a.name.includes("Loyalty Points Service")));
  t("deterministic", JSON.stringify(E.buildEstimate(def, all, state)) === JSON.stringify(est));

  const rich = { ...state, rateCard: { ...state.rateCard, rates: { ...state.rateCard.rates, "Backend Developer": 800 } } };
  t("changing a rate changes cost, not days", E.buildEstimate(def, all, rich).total > est.total && E.buildEstimate(def, all, rich).totalDays === est.totalDays);
  const cheap = { ...state, rateCard: { ...state.rateCard, contingencyPct: 0 } };
  t("0% contingency gives total = subtotal", E.buildEstimate(def, all, cheap).total === E.buildEstimate(def, all, cheap).subtotal);
  const first = est.activities.find((a) => a.id === "act-requirements")!;
  const edited = E.buildEstimate(def, all, { ...state, adjustments: { "act-requirements": { functionalDays: first.functionalDays + 10 } } });
  t("a manual day change is kept, flagged, and flows into the total (incl. project management)", edited.activities.find((a) => a.id === "act-requirements")!.adjusted === true && edited.totalDays > est.totalDays + 10);

  // ── RASIC ──
  const rows = est.rasic.rows;
  t("RASIC has a row per activity and a cell per party", rows.length === est.activities.length && rows.every((r) => r.cells.length === est.rasic.parties.length));
  t("each activity has exactly one Accountable and at least one Responsible", rows.every((r) => r.cells.filter((c) => c === "A").length === 1 && r.cells.filter((c) => c === "R").length >= 1), JSON.stringify(rows.filter((r) => r.cells.filter((c) => c === "A").length !== 1)));
  t("only R A S I C or blank are used", rows.every((r) => r.cells.every((c) => ["R", "A", "S", "I", "C", ""].includes(c))));

  // ── neutrality ──
  const src = (await import("node:fs")).readFileSync("src/services/estimate.ts", "utf8") + (await import("node:fs")).readFileSync("src/services/scope.ts", "utf8");
  t("no business domain named in the engine", !/\b(warranty|dealer|vehicle|bank|loan|hospital|patient|insurance|retail|airline)\b/i.test(src));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
