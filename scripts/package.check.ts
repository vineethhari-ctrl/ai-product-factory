/**
 * Package implementation mode: delivery type, fit-gap (rules-based and AI), package estimate, documents. Run: npm run check:package
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "pkg-"));
process.env.AI_CACHE_DAYS = "0";
for (const k of ["AI_PROJECT_BUTTON_LIMIT", "AI_USER_BUTTON_LIMIT", "AI_USER_DAILY_TOKENS", "AI_MONTHLY_BUDGET_USD"]) process.env[k] = "0";
delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.GOOGLE_GENAI_USE_VERTEXAI; delete process.env.AI_GEMINI_BACKEND;

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); };

const BRIEF = `Problems today: requests are tracked in spreadsheets and approvals go over email.

A requester first raises a request, then the buyer checks it, then the manager approves it, then the receiver confirms delivery.

A request cannot be approved without a cost centre. Amounts above 50000 must be approved by the manager. Goods must not be received before approval.

We will track approval time and on-time delivery.

It must talk to the supplier portal, the identity service and the payment file exchange.`;

// A made-up platform: the engine must work from whatever the BA types.
const PLATFORM = "Northwind Suite 9";
const REAL_PLATFORMS = /\b(SAP|S\/4|HANA|Oracle|Salesforce|Dynamics|Workday|ServiceNow|SuccessFactors)\b/;
const INDUSTRY = /\b(vehicle|battery|loan|bank|dealer|claim|patient|invoice|warranty|policy|hospital|airline|insurance|retail)\b/i;

(async () => {
  const quiet = async <T,>(f: () => Promise<T>): Promise<T> => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await f(); } finally { console.log = l; console.warn = w; } };
  const { analyzeBusinessMaterial, generateProductDefinition } = await import("../server/aiReasoningService");
  const fit = await import("../src/services/fitGap");
  const { buildEstimate, currentProposalState, defaultProposalState, PACKAGE_ROLES, ROLES, rolesFor, PACKAGE_RASIC_PARTIES, RASIC_PARTIES } = await import("../src/services/estimate");
  const { buildScopeFromDefinition, setIncluded } = await import("../src/services/scope");
  const { buildProposalNarrative } = await import("../src/services/proposalNarrative");
  const { brdSections, reviewSections, fitGapText } = await import("../src/services/brdDoc");

  // ── Delivery type ──────────────────────────────────────────────────────
  t("cleanDelivery: junk is ignored", fit.cleanDelivery(null) === undefined && fit.cleanDelivery({ kind: "other" }) === undefined && fit.cleanDelivery("package") === undefined);
  t("cleanDelivery: platform trimmed, control characters removed, capped at 80", JSON.stringify(fit.cleanDelivery({ kind: "package", platform: "  A\u0000B " + "x".repeat(200) })) === JSON.stringify({ kind: "package", platform: ("A B " + "x".repeat(200)).slice(0, 80) }));
  t("cleanDelivery: a new application carries no platform", JSON.stringify(fit.cleanDelivery({ kind: "custom", platform: "X" })) === JSON.stringify({ kind: "custom" }));
  t("no platform typed: a neutral name, never an invented product", fit.platformName({ delivery: { kind: "package" } }) === "the chosen platform");

  const delivery = { kind: "package" as const, platform: PLATFORM };
  const u = await quiet(() => analyzeBusinessMaterial([], "Purchase Desk", "Procurement", BRIEF, delivery));
  const def = await quiet(() => generateProductDefinition(u, "Purchase Desk", "Procurement"));
  t("Understand Business keeps the delivery type", u.delivery?.kind === "package" && u.delivery.platform === PLATFORM);
  t("the BRD carries it on (offline path too)", def.delivery?.kind === "package" && def.delivery.platform === PLATFORM);
  const custom = await quiet(() => generateProductDefinition({ ...u, delivery: undefined }, "Purchase Desk", "Procurement"));
  t("a new application has no delivery set (old behaviour)", custom.delivery === undefined);

  // ── Prompts carry the package directive only in package mode ──────────
  const { setProviderForTests, AIUnavailableError } = await import("../server/llmRouter");
  process.env.GEMINI_API_KEY = "g";
  const prompts: Record<string, string> = {};
  let restore = setProviderForTests("gemini", async (task, prompt) => { prompts[task] = prompt; return null; });
  try { await quiet(() => analyzeBusinessMaterial([], "Purchase Desk", "Procurement", BRIEF, delivery)); } catch { /* every provider failed: expected */ }
  try { await quiet(() => generateProductDefinition(u, "Purchase Desk", "Procurement")); } catch { /* expected */ }
  const pkgAnalyze = prompts["analyze-material"] ?? "", pkgDef = prompts["generate-definition"] ?? "";
  try { await quiet(() => analyzeBusinessMaterial([], "Purchase Desk", "Procurement", BRIEF)); } catch { /* expected */ }
  restore();
  t("analysis prompt: package directive with the platform the BA typed", /PACKAGE IMPLEMENTATION/.test(pkgAnalyze) && pkgAnalyze.includes(PLATFORM));
  t("BRD prompt: package directive with the platform", /PACKAGE IMPLEMENTATION/.test(pkgDef) && pkgDef.includes(PLATFORM));
  t("a new application's prompt has no package directive", !/PACKAGE IMPLEMENTATION/.test(prompts["analyze-material"] ?? "x"));
  delete process.env.GEMINI_API_KEY;

  // ── Rules-based fit-gap ────────────────────────────────────────────────
  const fg = fit.buildFitGap(def);
  const traced = new Set(fg.rows.flatMap((r) => r.traces.map((x) => x.toLowerCase())));
  t("every business rule is covered by a row", def.businessRules.every((r) => traced.has(r.code.toLowerCase())), def.businessRules.map((r) => r.code).join(","));
  t("every integration is an interface row", def.integrations.every((i) => fg.rows.some((r) => r.fit === "develop" && r.objectType === "Interface" && r.traces.includes(i.system))));
  t("every screen is covered", def.screens.every((s) => traced.has(s.name.toLowerCase())));
  t("every record is a migration object", def.dataEntities.every((e) => fg.migration.some((m) => m.name === e.name)));
  t("development rows always have a type; other rows never do", fg.rows.every((r) => (r.fit === "develop") === !!r.objectType));
  t("rows are numbered FG-01, FG-02 ... in order", fg.rows.every((r, i) => r.id === `FG-${String(i + 1).padStart(2, "0")}`));
  t("the rules-based fit-gap says it must be confirmed by a platform consultant", fg.origin === "OFFLINE" && fg.openPoints.some((p) => /confirm/i.test(p) && p.includes(PLATFORM)));
  const counts = fit.fitGapCounts(fg);
  t("the summary's counts add up to the rows", Object.values(counts).reduce((n, c) => n + c, 0) === fg.rows.length && fg.summary.startsWith(`${fg.rows.length} requirements`));
  t("deterministic", JSON.stringify(fit.buildFitGap(def)) === JSON.stringify(fit.buildFitGap(def)));
  t("roles map to access", fg.authorisations.length === def.personas.length);

  // ── AI fit-gap, checked by the server ──────────────────────────────────
  const { generateFitGap } = await import("../server/fitGapService");
  const { buildFitGapPrompt } = await import("../server/fitGapPrompt");
  const { FitGapSchema } = await import("../server/aiSchemas");
  const { providerOrder } = await import("../server/routing");
  const { depthDirective } = await import("../server/depth");
  const { AI_BUTTONS } = await import("../server/usage");
  const [r1, r2] = def.businessRules;
  const sys = def.integrations[0]?.system ?? "Other system";
  const modelFit = FitGapSchema.parse({
    summary: "A model-written summary.",
    areas: ["Purchasing", "Receiving"],
    rows: [
      { area: "Purchasing", requirement: "Raise a request", traces: [def.screens[0].name, r1.code], fit: "standard", platformFeature: "Standard request app", objectType: "Report", complexity: "Low" },
      { area: "Purchasing", requirement: "Manager approval", traces: [r2?.code ?? r1.code], fit: "develop", platformFeature: "Custom approval", gap: "Extra routing", complexity: "High" },
      { area: "Receiving", requirement: "Use the standard receipt", traces: [], fit: "process-change", platformFeature: "Standard receipt", gap: "Receivers confirm in the standard screen", complexity: "Low" },
      { area: "Purchasing", requirement: "   ", traces: [], fit: "standard", platformFeature: "", complexity: "Low" },
    ],
    migration: [{ name: def.dataEntities[0].name, source: "Spreadsheets", complexity: "Medium" }],
    orgStructure: ["Purchasing units"],
    authorisations: [{ role: def.personas[0].name, access: "Create requests" }],
    openPoints: ["Edition to confirm"],
  });
  process.env.GEMINI_API_KEY = "g";
  const calls: Array<{ task: string; prompt: string; system?: string }> = [];
  restore = setProviderForTests("gemini", async (task, prompt) => { calls.push({ task, prompt }); return task === "generate-fit-gap" ? modelFit : null; });
  const ai = await quiet(() => generateFitGap(def));
  restore();
  t("the model is asked with the platform, every rule code and every integration", calls[0]?.task === "generate-fit-gap" && calls[0].prompt.includes(PLATFORM) && def.businessRules.every((r) => calls[0].prompt.includes(r.code)) && def.integrations.every((i) => calls[0].prompt.includes(i.system)));
  t("the model's fit-gap is used (origin AI), tied to this BRD and platform", ai.origin === "AI" && ai.summary === "A model-written summary." && ai.basedOn === fit.fitGapSignature(def));
  t("rules and integrations the model left out are added, and listed", def.businessRules.slice(2).every((r) => ai.addedForCoverage?.includes(r.code)) && def.integrations.every((i) => ai.addedForCoverage?.includes(i.system)), JSON.stringify(ai.addedForCoverage));
  t("a development row without a type gets one; a standard row loses a type it should not have", ai.rows.find((r) => r.requirement === "Manager approval")?.objectType === "Enhancement" && !ai.rows.find((r) => r.requirement === "Raise a request")?.objectType);
  t("an empty row is dropped; rows renumbered", !ai.rows.some((r) => !r.requirement.trim()) && ai.rows.every((r, i) => r.id === `FG-${String(i + 1).padStart(2, "0")}`));
  t("records the model did not list are still migration objects", def.dataEntities.every((e) => ai.migration.some((m) => m.name === e.name)) && ai.migration[0].source === "Spreadsheets");
  t("the stored fit-gap is shown for its BRD and platform; a changed platform falls back to rules", fit.currentFitGap({ ...def, fitGap: ai }).origin === "AI" && fit.currentFitGap({ ...def, delivery: { kind: "package", platform: "Other" }, fitGap: ai }).origin === "OFFLINE");
  restore = setProviderForTests("gemini", async () => null);
  let err: unknown; try { await quiet(() => generateFitGap(def)); } catch (e) { err = e; }
  restore();
  t("keys set but every provider failed: AIUnavailableError (Retry banner)", err instanceof AIUnavailableError);
  restore = setProviderForTests("gemini", async (task) => (task === "generate-fit-gap" ? FitGapSchema.parse({ ...modelFit, rows: [] }) : null));
  const empty = await quiet(() => generateFitGap(def));
  restore();
  t("a model that assessed nothing: the rules-based fit-gap stands in", empty.origin === "OFFLINE");
  delete process.env.GEMINI_API_KEY;
  t("no key: the rules-based fit-gap answers", (await quiet(() => generateFitGap(def))).origin === "OFFLINE");
  t("Gemini first, Claude as backup", providerOrder("generate-fit-gap").join(",") === "gemini,claude");
  t("the depth rule has a focus line for the fit-gap", /fit-gap/.test(depthDirective("generate-fit-gap") ?? ""));
  t("the usage panel names the button", AI_BUTTONS["generate-fit-gap"] === "Fit-Gap");
  const promptSrc = ["server/fitGapPrompt.ts", "server/fitGapService.ts", "src/services/fitGap.ts"].map((f) => readFileSync(f, "utf8")).join("\n");
  t("fit-gap code names no real platform: the platform is the BA's own words", !REAL_PLATFORMS.test(promptSrc), promptSrc.match(REAL_PLATFORMS)?.[0]);
  t("fit-gap code and prompt are domain-neutral", !INDUSTRY.test(promptSrc) && !INDUSTRY.test(buildFitGapPrompt({ ...def, productName: "P", businessUnit: "B" }).replace(BRIEF, "")));
  t("a real platform the BA types reaches the prompt as typed", buildFitGapPrompt({ ...def, delivery: { kind: "package", platform: "SAP S/4HANA" } }).includes("SAP S/4HANA"));

  // ── Estimate ───────────────────────────────────────────────────────────
  const withFit = { ...def, fitGap: ai };
  const scope = buildScopeFromDefinition(withFit);
  const state = defaultProposalState();
  const est = buildEstimate(withFit, scope, state);
  const ids = est.activities.map((a) => a.id);
  t("package activities: fit-gap workshops, configuration, migration, interfaces, cutover", ["act-explore", "act-migration", "act-interfaces", "act-deploy", "act-security"].every((i) => ids.includes(i)) && ids.some((i) => i.startsWith("act-config-")), ids.join(","));
  t("no custom-build activities in a package implementation", !ids.some((i) => i.startsWith("act-build-") || i.startsWith("act-int-") || i === "act-design"));
  const ifaces = ai.rows.filter((r) => r.objectType === "Interface").length;
  t("interfaces are sized from the fit-gap (counted once)", est.activities.find((a) => a.id === "act-interfaces")!.name.includes(`(${ifaces})`));
  t("each activity's roles add up to its total", est.activities.every((a) => Math.abs(Object.values(a.roleDays).reduce((n, d) => n + (d ?? 0), 0) - (a.functionalDays + a.technicalDays)) < 0.051));
  t("the team is the package team", est.team.every((r) => PACKAGE_ROLES.includes(r.role)) && est.team.some((r) => r.role === "Functional Consultant"));
  const rate = (r: string) => (state.rateCard.rates as Record<string, number>)[r];
  t("price is exactly days x rate", Math.abs(est.total - Math.round(est.team.reduce((n, r) => n + r.days * rate(r.role), 0))) <= est.team.length);
  t("RASIC: package parties, one A and at least one R per row", JSON.stringify(est.rasic.parties) === JSON.stringify(PACKAGE_RASIC_PARTIES) && est.rasic.rows.every((r) => r.cells.filter((c) => c === "A").length === 1 && r.cells.includes("R")));
  const noAllow = buildEstimate(withFit, scope, { ...state, rateCard: { ...state.rateCard, allowancePct: 0 } });
  const a0 = noAllow.activities.find((a) => a.id === "act-mobilise")!, a15 = est.activities.find((a) => a.id === "act-mobilise")!;
  t("the allowance is folded into each activity (8 days -> 9.2)", a0.functionalDays + a0.technicalDays === 8 && Math.abs(a15.functionalDays + a15.technicalDays - 9.2) < 1e-9);
  t("milestones add up to the total; package milestone names", est.milestones.reduce((n, m) => n + m.amount, 0) === est.total && est.milestones.some((m) => /Fit-gap/.test(m.name)));
  const cutInt = setIncluded(scope, `integration:${def.integrations[0].id}`, false);
  const estCut = buildEstimate(withFit, cutInt, state);
  t("an integration the BU cut leaves the interfaces", (estCut.activities.find((a) => a.id === "act-interfaces")?.name ?? "(0)").includes(`(${ifaces - 1})`) || (ifaces === 1 && !estCut.activities.some((a) => a.id === "act-interfaces")));
  const cutRec = setIncluded(scope, `record:${def.dataEntities[0].id}`, false);
  const migName = (e: typeof est) => e.activities.find((a) => a.id === "act-migration")?.name ?? "";
  t("a record the BU cut is not migrated", migName(buildEstimate(withFit, cutRec, state)) !== migName(est) && !migName(buildEstimate(withFit, cutRec, state)).includes(`(${ai.migration.length} `));
  const customEst = buildEstimate(custom, buildScopeFromDefinition(custom), state);
  t("a new application keeps the custom estimate: custom team, parties and activities", customEst.team.every((r) => ROLES.includes(r.role)) && JSON.stringify(customEst.rasic.parties) === JSON.stringify(RASIC_PARTIES) && customEst.activities.some((a) => a.id.startsWith("act-build-")));
  t("the rate card shows the roles of the delivery type", rolesFor(def).includes("Functional Consultant") && !rolesFor(custom).includes("Functional Consultant"));
  const oldCard = currentProposalState({ docKind: "Proposal", rateCard: { currency: "INR", rates: { "Project Manager": 1, "Business Analyst": 2 } as never, allowancePct: 15, daysPerMonth: 20, utilisation: 0.85, maxPerRole: 4 } });
  t("a rate card saved before the package roles keeps its rates and gains defaults for the new roles", oldCard.rateCard.rates["Project Manager"] === 1 && oldCard.rateCard.rates["Functional Consultant"] > 0);

  // ── Proposal words and documents ───────────────────────────────────────
  const nar = buildProposalNarrative(withFit, scope, est, state);
  t("the proposal says the platform is implemented", nar.executiveSummary.includes(`implement ${PLATFORM}`));
  t("migration is in scope, licences are not", !nar.exclusions.some((x) => /^Data migration from existing systems, unless/.test(x)) && nar.exclusions.some((x) => x.includes("licences")));
  const brd = brdSections(withFit);
  t("the BRD carries the fit-gap, development objects, migration and set-up", ["fitgap", "fitgap-dev", "fitgap-migration", "fitgap-setup"].every((id) => brd.some((s) => s.id === id)));
  t("a new application's BRD has no fit-gap", !brdSections(custom).some((s) => s.id.startsWith("fitgap")));
  const review = reviewSections(withFit);
  const pc = review.find((s) => s.id === "process-changes");
  t("the review sheet asks the BU to agree each process change", !!pc && JSON.stringify(pc).includes("Use the standard receipt") && JSON.stringify(pc).includes("Agree?"));
  const text = fitGapText(withFit, ai);
  t("the copied fit-gap carries no effort or money", !/person-day|person-month|INR|₹|\bfee\b|allowance|contingency/i.test(text));

  // ── Demo pack ──────────────────────────────────────────────────────────
  const { buildDemoPack } = await import("../server/demoPack");
  const JSZip = (await import("jszip")).default;
  const pack = await quiet(() => buildDemoPack(withFit, { now: new Date("2026-11-02T10:00:00Z") }));
  const zip = await JSZip.loadAsync(pack.buffer);
  const readme = await zip.file("README.txt")!.async("string");
  const brdDoc = await zip.file("2-Business-Requirements-Document.doc")!.async("string");
  t("the demo pack's README explains the fit-gap", readme.includes("fit-gap") && readme.includes(PLATFORM));
  t("the demo pack's BRD has the fit-gap, with no effort or money", brdDoc.includes(`How ${PLATFORM} meets the requirements`) && !/person-day|INR|₹|allowance|contingency/i.test(brdDoc));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
