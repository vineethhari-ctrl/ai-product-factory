import { isPackage, platformName } from "../src/services/fitGap";
import JSZip from "jszip";
import type { ProductDefinition } from "../src/types";
import { renderDocx } from "../src/services/docx";
import { approachSections, brdSections, reviewSections } from "../src/services/brdDoc";
import { currentApproachNote } from "../src/services/approachNote";
import { buildPrototypeHtml } from "./prototypeExport";

/**
 * The BU demo pack: ONE zip the business can open with nothing installed, to review what is proposed and answer in writing.
 *   README.txt   how to use the pack
 *   1-Prototype.html   the finished application (stand-alone, view only)
 *   2-Business-Requirements-Document.docx   the BRD in business language, proposed items marked
 *   3-Solution-Approach-Note.docx   problems, solution, choices, phases, risks
 *   4-Review-Sheet.docx   questions, assumptions and every proposed item, with a column to write the answer in
 * It is for the BUSINESS: no effort, price, estimate, proposal, test suite, engineering plan or research. Those stay with the team.
 */

export const DEMO_PACK_FILES = ["README.txt", "1-Prototype.html", "2-Business-Requirements-Document.docx", "3-Solution-Approach-Note.docx", "4-Review-Sheet.docx"] as const;

const slug = (x: string, fallback: string) => x.trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || fallback;
export const demoPackFileName = (productName: string, now = new Date()): string => `${slug(productName, "product")}_BU-demo-pack_${now.toISOString().slice(0, 10)}.zip`;

const longDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function demoPackReadme(def: ProductDefinition, preparedOn: string, preparedBy?: string): string {
  return `${def.productName}: review pack for ${def.businessUnit}
Version ${def.version}. Prepared on ${preparedOn}${preparedBy ? ` by ${preparedBy}` : ""}.

WHAT IS IN THIS PACK
  1-Prototype.html
      The application as it would look and work. Double-click it: it opens in your browser. Nothing to install, no internet needed.
      Use the menu on the left to move between screens and the "Role" box at the top to see what each kind of user sees.
      It uses sample people and figures, it is view only, and nothing you do in it is saved.
  2-Business-Requirements-Document.docx
      What the product must do, in plain language: who uses it, how the work flows, the screens, the business documents,
      the rules and the information it keeps. Items marked "Proposed: please confirm" were not stated by you: we proposed
      them from how similar work is usually done.${isPackage(def) ? `
      It also shows how ${platformName(def)} meets each requirement (the fit-gap): what works as delivered, what is set up
      by settings, what has to be built, and where we propose to use the platform's standard way of working.` : ""}
  3-Solution-Approach-Note.docx
      The problems we are solving, how the solution works, the choices we considered, the rollout in phases and the risks.
  4-Review-Sheet.docx
      The one to fill in. It lists our questions, the assumptions to confirm, and every proposed item with a box to write
      Keep, Change or Remove.

HOW TO REVIEW (about an hour)
  1. Open the prototype and click through the screens for your own role. Does it look like your work?
  2. Skim the Business Requirements Document, especially the rules and the items marked "Proposed".
  3. Fill in the Review Sheet, starting with the questions marked "Must be answered before sign-off". Send it back to us.
  4. Anything you remove will not be built. Anything you change will be reflected in the next version.

NOT IN THIS PACK
  Costs, effort and schedule are not part of this pack. They are prepared from the version you approve.

The .docx files open in Word (or any word processor). The prototype opens in any current browser.
Prepared with AI Product Factory.
`;
}

export interface DemoPack { buffer: Buffer; fileName: string; files: string[]; }

/** The pack as a zip. `now` fixes the date written in the files (the same input then gives the same pack). */
export async function buildDemoPack(def: ProductDefinition, opts: { now?: Date; preparedBy?: string } = {}): Promise<DemoPack> {
  const now = opts.now ?? new Date();
  const preparedOn = longDate(now);
  const preparedBy = opts.preparedBy?.trim() || def.proposal?.vendorName?.trim() || undefined;
  const note = currentApproachNote(def);
  const docx = (kind: string) => ({ now, author: preparedBy, footer: `${def.productName} · ${kind}` });
  const intro = (extra: string) => [`${def.productName} for ${def.businessUnit}. Version ${def.version}. ${extra}`.trim()];

  const files: Array<[string, string | Uint8Array]> = [
    ["README.txt", demoPackReadme(def, preparedOn, preparedBy)],
    ["1-Prototype.html", await buildPrototypeHtml(def)],
    ["2-Business-Requirements-Document.docx", await renderDocx(`Business Requirements Document: ${def.productName}`, intro(`Prepared on ${preparedOn}.`), brdSections(def, { preparedOn, preparedBy }), docx(`Business Requirements Document`))],
    ["3-Solution-Approach-Note.docx", await renderDocx(`Solution Approach Note: ${def.productName}`, intro(`Prepared on ${preparedOn}.`), approachSections(def, note), docx(`Solution Approach Note`))],
    ["4-Review-Sheet.docx", await renderDocx(`Review Sheet: ${def.productName}`, intro(`Please fill in and send back. Prepared on ${preparedOn}.`), reviewSections(def), docx(`Review Sheet`))],
  ];
  const zip = new JSZip();
  for (const [name, content] of files) zip.file(name, content, { date: now });
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
  return { buffer, fileName: demoPackFileName(def.productName, now), files: files.map(([n]) => n) };
}
