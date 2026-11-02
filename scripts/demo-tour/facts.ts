/**
 * Numbers for the tour, read from the project the capture produced (the project backup file), so every figure in the tour is real.
 *   npx tsx scripts/demo-tour/facts.ts <project.json> <facts.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseProjectFile } from "../../src/services/projectFile";
import { buildEstimate, currentProposalState, toMonths } from "../../src/services/estimate";
import { currentScope } from "../../src/services/scope";
import { currentTestSuite } from "../../src/services/testSuite";
import { currentFitGap, devObjects, fitGapCounts } from "../../src/services/fitGap";
import { withSystemFields } from "../../src/services/validationEngine";

const [, , inFile, outFile] = process.argv;
const parsed = parseProjectFile<any>(readFileSync(inFile, "utf8"));
if (!parsed.ok) throw new Error(parsed.error);
const def = parsed.state.productDefinition;
const { scope } = currentScope(def);
const state = currentProposalState(def.proposal);
const est = buildEstimate(def, scope, state);
const suite = currentTestSuite(def);
const fg = currentFitGap(def);
const fit = fitGapCounts(fg);
const facts = {
  product: def.productName, unit: def.businessUnit, platform: def.delivery?.platform, version: def.version,
  personas: def.personas.length, modules: def.modules.length, screens: def.screens.length, rules: def.businessRules.length,
  journeys: def.userJourneys.length, records: def.dataEntities.length, integrations: def.integrations.length,
  fields: def.dataEntities.reduce((n: number, e: any) => n + withSystemFields(e).fields.filter((f: any) => f.source !== "system").length, 0),
  openQuestions: def.openQuestions.length,
  useCases: suite.useCases.length, scenarios: suite.scenarios.length, testCases: suite.testCases.length,
  fit: { total: fg.rows.length, standard: fit.standard, configure: fit.configure, develop: fit.develop, processChange: fit["process-change"], thirdParty: fit["third-party"] },
  devObjects: devObjects(fg).map((g) => ({ type: g.type, n: g.rows.length })),
  migration: fg.migration.length,
  effort: { days: Math.round(est.totalDays), functional: Math.round(est.functionalDays), technical: Math.round(est.technicalDays), months: toMonths(est.totalDays, est.daysPerMonth), weeks: est.durationWeeks, activities: est.activities.length, roles: est.team.length, milestones: est.milestones.length },
};
writeFileSync(outFile, JSON.stringify(facts, null, 1));
console.log(JSON.stringify(facts));
