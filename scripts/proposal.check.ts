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

  const rich = { ...state, rateCard: { ...state.rateCard, rates: { ...state.rateCard.rates, "Backend Developer": 20000 } } };
  t("changing a rate changes cost, not days", E.buildEstimate(def, all, rich).total > est.total && E.buildEstimate(def, all, rich).totalDays === est.totalDays);
  const cheap = { ...state, rateCard: { ...state.rateCard, contingencyPct: 0 } };
  t("0% contingency gives total = subtotal", E.buildEstimate(def, all, cheap).total === E.buildEstimate(def, all, cheap).subtotal);
  const first = est.activities.find((a) => a.id === "act-requirements")!;
  const edited = E.buildEstimate(def, all, { ...state, adjustments: { "act-requirements": { functionalDays: first.functionalDays + 10 } } });
  t("a manual day change is kept, flagged, and flows into the total (incl. project management)", edited.activities.find((a) => a.id === "act-requirements")!.adjusted === true && edited.totalDays > est.totalDays + 10);

  t("the default currency is INR, with Indian digit grouping", state.rateCard.currency === "INR" && /^₹\s?\d{1,2},\d{2},\d{3}$/.test(E.formatMoney(123456, "INR")) && E.formatMoney(5000000, "INR").includes("50,00,000") && est.currency === "INR");
  t("an untouched old USD default is upgraded; an edited card is kept", E.currentProposalState({ docKind: "Proposal", rateCard: { ...state.rateCard, currency: "USD", isDefault: true } }).rateCard.currency === "INR" && E.currentProposalState({ docKind: "Proposal", rateCard: { ...state.rateCard, currency: "USD", isDefault: false } }).rateCard.currency === "USD");
  const flat0 = E.buildEstimate(def, all, { ...state, rateCard: { ...state.rateCard, allowancePct: 0 } });
  t("the estimating allowance is 15% by default and lifts the total effort by about 15%", state.rateCard.allowancePct === 15 && Math.abs(est.totalDays / flat0.totalDays - 1.15) < 0.02, `${est.totalDays} vs ${flat0.totalDays}`);
  const scaled = est.activities.filter((a) => a.id !== "act-pm" && !a.adjusted).every((a) => { const f = flat0.activities.find((x) => x.id === a.id)!; return Math.abs((a.functionalDays + a.technicalDays) / (f.functionalDays + f.technicalDays) - 1.15) < 0.06; });
  t("the allowance is built into every activity's days (no activity of its own)", scaled && !est.activities.some((a) => /buffer|allowance/i.test(a.name + a.id)) && est.activities.length === flat0.activities.length);
  const adjDays = E.buildEstimate(def, all, { ...state, adjustments: { "act-requirements": { functionalDays: 10, technicalDays: 2 } } }).activities.find((a) => a.id === "act-requirements")!;
  t("a figure the BA types is final: the allowance is not applied on top", adjDays.functionalDays === 10 && adjDays.technicalDays === 2);
  t("0% allowance gives the plain figures; the percent is adjustable", flat0.totalDays < est.totalDays && E.buildEstimate(def, all, { ...state, rateCard: { ...state.rateCard, allowancePct: 30 } }).totalDays > est.totalDays);
  t("'how estimated' names what the size depends on: no arithmetic, no percent, no constants", est.activities.every((a) => a.basis && !/%|\d+(\.\d+)?\s*(functional|technical)|per (rule|screen|record|integration|journey|role)\b.*\d|\+\s*\d/.test(a.basis)), JSON.stringify(est.activities.filter((a) => /%|functional|technical/.test(a.basis)).map((a) => a.basis)));
  t("an old saved card without the allowance gets the default", E.currentProposalState({ docKind: "Proposal", rateCard: { ...state.rateCard, allowancePct: undefined, isDefault: false } }).rateCard.allowancePct === 15);
  // ── RASIC ──
  const rows = est.rasic.rows;
  t("RASIC has a row per activity and a cell per party", rows.length === est.activities.length && rows.every((r) => r.cells.length === est.rasic.parties.length));
  t("each activity has exactly one Accountable and at least one Responsible", rows.every((r) => r.cells.filter((c) => c === "A").length === 1 && r.cells.filter((c) => c === "R").length >= 1), JSON.stringify(rows.filter((r) => r.cells.filter((c) => c === "A").length !== 1)));
  t("only R A S I C or blank are used", rows.every((r) => r.cells.every((c) => ["R", "A", "S", "I", "C", ""].includes(c))));

  // ── narrative, document, AI path ──

  const N = await import("../src/services/proposalNarrative");
  const D = await import("../src/services/proposalDoc");
  const { generateProposalNarrative, reconcileScope } = await import("../server/proposalService");
  const { buildProposalPrompt, buildReconcilePrompt } = await import("../server/proposalPrompt");
  const { setProviderForTests, AIUnavailableError } = await import("../server/llmRouter");
  const { ProposalNarrativeSchema, ScopeReconcileSchema } = await import("../server/aiSchemas");
  const { providerOrder } = await import("../server/routing");
  const estCut = E.buildEstimate(def, cut, state);
  const nOff = N.buildProposalNarrative(def, cut, estCut, state);
  t("offline narrative says what the business removed, and states the real total", nOff.origin === "OFFLINE" && nOff.exclusions.some((x) => x.includes(mod.name)) && nOff.executiveSummary.includes(E.formatMoney(estCut.total, "INR")) && nOff.executiveSummary.includes(mod.name));
  const nText = JSON.stringify(N.buildProposalNarrative(def, all, est, state));
  t("the narrative says an allowance is included, without its size, and that unapproved requests are not changes", nText.includes("include an allowance for clarification, rework and risk within the approved scope") && nText.includes("not changes until approved") && !/15%\s*(buffer|allowance)|allowance[^"]{0,40}15/i.test(nText));
  const secs = D.proposalSections(def, cut, estCut, state, nOff);
  const flat = JSON.stringify(secs);
  const firstCol = (id: string) => (secs.find((x) => x.id === "scope")!.blocks.filter((b): b is Extract<typeof b, { kind: "table" }> => b.kind === "table" && b.head[0] === id).flatMap((b) => b.rows.map((r) => r[0])));
  t("the scope section's module and screen tables hold approved items only", !firstCol("Module").includes(mod.name) && firstCol("Module").length === def.modules.length - 1 && cutScreens.every((sc) => !firstCol("Screen").includes(sc.name)) && firstCol("Screen").length === def.screens.length - cutScreens.length);
  t("the out-of-scope section names what the business removed", JSON.stringify(secs.find((x) => x.id === "out")).includes(mod.name));
  const allText = flat + D.proposalMarkdown(def, state, secs) + D.proposalHtml(def, state, secs);
  t("nothing printed, copied or downloaded names the allowance percentage, a buffer line, or the formulas", !/buffer/i.test(allText) && !/allowance[^"<]{0,60}\d+\s*%|\d+\s*%[^"<]{0,20}allowance/i.test(allText) && !/act-buffer/.test(allText));
  t("the document says only that an allowance is included", /include an allowance for clarification, rework and risk/.test(allText));
  t("the document carries effort, team, RASIC, milestones and sign-off", ["effort", "cost", "rasic", "timeline", "signoff", "acceptance", "commercial"].every((id) => secs.some((x) => x.id === id)));
  const md = D.proposalMarkdown(def, state, secs), html = D.proposalHtml(def, state, secs);
  t("markdown and Word versions carry the same total", md.includes(E.formatMoney(estCut.total, "INR")) && html.includes(E.formatMoney(estCut.total, "INR")) && html.includes("<table>") && md.includes("| ---"));
  t("a marked-up cell cannot break the Markdown table", !D.proposalMarkdown(def, state, [{ id: "x", title: "T", blocks: [{ kind: "table", head: ["a"], rows: [["x|y\nz"]] }] }]).includes("x|y"));
  t("html escapes what the business typed", D.proposalHtml(def, state, [{ id: "x", title: "<b>", blocks: [{ kind: "p", text: "<script>" }] }]).includes("&lt;script&gt;"));
  t("a stored narrative is shown only for the scope it was written for", D.currentNarrative(def, cut, estCut, { ...state, narrative: { ...nOff, origin: "AI" } }).narrative.origin === "AI" && D.currentNarrative(def, all, est, { ...state, narrative: { ...nOff, origin: "AI" } }).stale === true);

  const modelN = ProposalNarrativeSchema.parse({
    executiveSummary: "A model-written summary.", background: ["B1"], objectives: ["O1"], approach: ["A1"], deliverables: ["D1"],
    assumptions: ["As1"], exclusions: ["Hosting is excluded."], clientResponsibilities: ["C1"], risks: [{ risk: "R-model", impact: "I", mitigation: "M" }],
    acceptanceCriteria: ["Ac1"], changeControl: ["Cc1"], governance: ["G1"], commercialTerms: ["The price is USD 5 only.", "Invoiced by milestone."],
  });
  const calls: Array<{ task: string; prompt: string }> = [];
  const offlineFirst = await quiet(() => generateProposalNarrative(def, cut, state));
  t("with no model the rules-based narrative answers", offlineFirst.origin === "OFFLINE");
  process.env.GEMINI_API_KEY = "g";
  let restore = setProviderForTests("gemini", async (task, prompt) => { calls.push({ task, prompt }); return task === "generate-proposal" ? modelN : null; });
  const ai = await quiet(() => generateProposalNarrative(def, cut, state));
  restore();
  const prompt = calls[0]?.prompt ?? "";
  const approvedPart = prompt.slice(prompt.indexOf("APPROVED SCOPE"), prompt.indexOf("REMOVED BY THE BUSINESS"));
  t("a model is asked with the approved scope: the cut module's screens are absent; the removal is listed under REMOVED", calls[0]?.task === "generate-proposal" && (() => { const scr = approvedPart.slice(approvedPart.indexOf("SCREENS:"), approvedPart.indexOf("INTEGRATIONS:")); return cutScreens.every((sc) => !scr.includes(`- ${sc.name} [`)) && !scr.includes(`[${mod.name},`); })() && /NOT\./.test(prompt) && prompt.slice(prompt.indexOf("REMOVED BY THE BUSINESS")).includes(mod.name));
  t("the model is told an allowance is included but never to give its size", /never give a percentage/.test(prompt) && !/allowance[^\n]{0,80}\d+\s*%/.test(prompt) && !/buffer/i.test(prompt));
  t("the prompt carries the computed numbers and says never to change them", prompt.includes(E.formatMoney(estCut.total, "INR")) && prompt.includes(`${Math.round(estCut.totalDays)} person-days`) && /never change or add one/i.test(prompt));
  t("the model's narrative is used (origin AI) for this approved scope", ai.origin === "AI" && ai.executiveSummary === "A model-written summary." && ai.basedOn === S.scopeSignature(cut) && ai.risks[0].risk === "R-model");
  t("what the business removed is always stated, whatever the model wrote", ai.exclusions.some((x) => x.includes(mod.name)) && ai.exclusions.includes("Hosting is excluded."));
  t("the fee line is the engine's; a figure the model invented is dropped", ai.commercialTerms[0].includes(E.formatMoney(estCut.total, "INR")) && !ai.commercialTerms.some((x) => x.includes("USD 5")) && ai.commercialTerms.includes("Invoiced by milestone."));
  t("the prompt is domain-neutral", !/\b(vehicle|dealer|hospital|patient|airline|battery|warranty|insurance|pharmacy|retail)\b/i.test(buildProposalPrompt(S.applyScope(def, all), all, est, state).replace(new RegExp(def.productName, "gi"), "").replace(new RegExp(def.businessUnit, "gi"), "").split("APPROVED SCOPE")[0]));
  t("Gemini first, Claude as backup, for both new tasks", providerOrder("generate-proposal").join(",") === "gemini,claude" && providerOrder("reconcile-scope").join(",") === "gemini,claude");
  restore = setProviderForTests("gemini", async () => null);
  let err: unknown; try { await quiet(() => generateProposalNarrative(def, cut, state)); } catch (e) { err = e; }
  restore();
  t("keys set but every provider failed: AIUnavailableError (the browser keeps the old text and offers Retry)", err instanceof AIUnavailableError);

  // reconcile with a model: one id decided, one unknown id ignored, one item skipped (decided by name matching), one addition
  const target = all.items.find((i) => i.kind === "screen")!;
  const modelR = ScopeReconcileSchema.parse({ decisions: [{ id: target.id, keep: false, note: "Deferred to phase 2" }, { id: "screen:does-not-exist", keep: false, note: "x" }], added: [{ kind: "integration", name: "Loyalty Points Service", detail: "Award points" }] });
  restore = setProviderForTests("gemini", async (task, p) => { calls.push({ task, prompt: p }); return task === "reconcile-scope" ? modelR : null; });
  const rec2 = await quiet(() => reconcileScope(def, all, finalText, "final.docx"));
  restore();
  t("the model's decision cuts that screen with its note; matchedBy AI; not yet confirmed", rec2.matchedBy === "AI" && !rec2.confirmed && rec2.items.find((i) => i.id === target.id)!.change === "REMOVED" && rec2.items.find((i) => i.id === target.id)!.note === "Deferred to phase 2");
  t("an unknown id is ignored; the model's addition is NEW", !rec2.items.some((i) => i.id === "screen:does-not-exist") && rec2.items.some((i) => i.name === "Loyalty Points Service" && i.change === "NEW"));
  t("an item the model skipped is decided by name matching, not silently kept", rec2.items.filter((i) => i.change === "REMOVED").length > 1);
  t("the reconcile prompt lists every draft item id and the final text", all.items.every((i) => buildReconcilePrompt(all, finalText).includes(i.id)) && buildReconcilePrompt(all, finalText).includes("Final approved BRD"));
  delete process.env.GEMINI_API_KEY;
  const rec3 = await quiet(() => reconcileScope(def, all, finalText, "final.docx"));
  t("with no model, name matching answers (matchedBy RULES)", rec3.matchedBy === "RULES" && rec3.items.some((i) => i.change === "REMOVED"));

  // ── neutrality ──
  const src = (await import("node:fs")).readFileSync("src/services/estimate.ts", "utf8") + (await import("node:fs")).readFileSync("src/services/scope.ts", "utf8");
  t("no business domain named in the engine", !/\b(warranty|dealer|vehicle|bank|loan|hospital|patient|insurance|retail|airline)\b/i.test(src));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
