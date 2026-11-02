import JSZip from "jszip";
import type { EngineeringPackage, ProductDefinition } from "../src/types";
import { renderDocx } from "../src/services/docx";
import { approachSections, brdSections, reviewSections } from "../src/services/brdDoc";
import { currentApproachNote } from "../src/services/approachNote";
import { currentTestSuite } from "../src/services/testSuite";
import { engineeringSections, testSuiteSections } from "../src/services/techDoc";
import { buildEstimate, currentProposalState } from "../src/services/estimate";
import { currentScope } from "../src/services/scope";
import { currentNarrative, documentTitle, proposalSections } from "../src/services/proposalDoc";
import { buildEngineeringPlan } from "./engineeringPlan";
import { isPackage, platformName } from "../src/services/fitGap";

/**
 * "All documents as Word": one zip with every document of the initiative as a real .docx, for the TEAM: the BRD, the approach
 * note, the review sheet, the test suite, the engineering plan and the proposal / SOW (with effort, rates, RASIC and fee).
 * It is internal. What goes to the business is the BU demo pack, which has no commercial content.
 */

const slug = (x: string, fallback: string) => x.trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || fallback;
export const wordPackFileName = (productName: string, now = new Date()): string => `${slug(productName, "product")}_all-documents-Word_${now.toISOString().slice(0, 10)}.zip`;
const longDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export interface WordPack { buffer: Buffer; fileName: string; files: string[]; }

/** `pkg` is the engineering package when the team has built one; its plan is used, else the rules-based plan. */
export async function buildWordPack(def: ProductDefinition, opts: { now?: Date; pkg?: EngineeringPackage | null; preparedBy?: string } = {}): Promise<WordPack> {
  const now = opts.now ?? new Date();
  const preparedOn = longDate(now);
  const preparedBy = opts.preparedBy?.trim() || def.proposal?.vendorName?.trim() || undefined;
  const intro = (extra: string) => [`${def.productName} for ${def.businessUnit}. Version ${def.version}. ${extra}`.trim()];
  const note = currentApproachNote(def);
  const suite = currentTestSuite(def);
  const planFromTeam = !!opts.pkg?.plan;
  const plan = opts.pkg?.plan ?? buildEngineeringPlan(def);

  const { scope } = currentScope(def);
  const state = currentProposalState(def.proposal);
  const est = buildEstimate(def, scope, state);
  const { narrative } = currentNarrative(def, scope, est, state);
  const proposalTitle = documentTitle(def, state);
  const proposalIntro = `Prepared for ${state.clientName?.trim() || def.businessUnit}${state.vendorName?.trim() ? ` by ${state.vendorName.trim()}` : ""}. Version ${def.version}.${scope.confirmed ? "" : " DRAFT: the scope is not yet confirmed as BU-approved."}`;

  const docs: Array<[string, string, string[], ReturnType<typeof brdSections>]> = [
    ["1-Business-Requirements-Document.docx", `Business Requirements Document: ${def.productName}`, intro(`Prepared on ${preparedOn}.`), brdSections(def, { preparedOn, preparedBy })],
    ["2-Solution-Approach-Note.docx", `Solution Approach Note: ${def.productName}`, intro(`Prepared on ${preparedOn}.`), approachSections(def, note)],
    ["3-Review-Sheet.docx", `Review Sheet: ${def.productName}`, intro(`Please fill in and send back. Prepared on ${preparedOn}.`), reviewSections(def)],
    ["4-Test-Suite.docx", `Test Suite: ${def.productName}`, intro(`Prepared on ${preparedOn}.`), testSuiteSections(def, suite)],
    ["5-Engineering-Plan.docx", `Engineering Plan: ${def.productName}`, intro(`Prepared on ${preparedOn}.`), engineeringSections(def, plan)],
    [`6-${slug(state.docKind, "Proposal")}.docx`, proposalTitle, [proposalIntro], proposalSections(def, scope, est, state, narrative)],
  ];

  const readme = `${def.productName}: all documents as Word
Version ${def.version}. Prepared on ${preparedOn}${preparedBy ? ` by ${preparedBy}` : ""}.
${isPackage(def) ? `Delivery type: implementation of ${platformName(def)} (the BRD includes the fit-gap).\n` : ""}
INTERNAL: THIS FOLDER CONTAINS COSTS. Do not send it to the business.
The proposal (file 6) has effort, rates, the team, the RASIC and the fee. What goes to the business is the "BU demo pack"
(prototype, BRD, approach note and review sheet, nothing commercial).

WHAT IS IN THIS FOLDER (real Word files, .docx)
${docs.map(([n, title]) => `  ${n}\n      ${title}`).join("\n")}

NOTES
  - ${planFromTeam ? "The engineering plan is the one from the Engineering Package step." : "The engineering plan was derived from the BRD by rules; open the Engineering Package step and build it with the AI for the full version."}
  - The test suite is ${suite.origin === "AI" ? "the one the AI wrote" : "derived from the BRD by rules; open the Use Cases & QA step to have the AI write it"}.
  - ${scope.confirmed ? "The proposal is for the scope the BA confirmed as BU-approved." : "The proposal is a DRAFT: the BU-approved scope has not been confirmed yet."}
Prepared with AI Product Factory.
`;

  const zip = new JSZip();
  zip.file("README.txt", readme, { date: now });
  const files = ["README.txt"];
  for (const [name, title, introLines, sections] of docs) {
    zip.file(name, await renderDocx(title, introLines, sections, { now, author: preparedBy, footer: `${def.productName} · ${title.split(":")[0]}` }), { date: now });
    files.push(name);
  }
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
  return { buffer, fileName: wordPackFileName(def.productName, now), files };
}
