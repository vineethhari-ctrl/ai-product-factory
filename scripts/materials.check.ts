// Reading uploaded files: Word, PowerPoint, Excel, PDF and text, plus files that cannot be read.
import { readFileSync } from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractMaterialText, MAX_CHARS_PER_FILE, type PdfLib } from "../src/services/materialExtractor";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra.slice(0, 600)}`); };
const dir = new URL("./fixtures/materials/", import.meta.url);
const read = async (file: string, mime = "") => {
  const b = readFileSync(new URL(file, dir));
  return extractMaterialText(file, mime, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), { pdfjs: pdfjs as unknown as PdfLib });
};

const docx = await read("brief.docx");
t("Word: heading and paragraphs read", docx.extraction.status === "read" && /Field Service Brief/.test(docx.text) && /Request → Quote → Order → Handover/.test(docx.text), docx.text);
t("Word: XML entities decoded", /Approvals & sign-off <required> "before" dispatch/.test(docx.text), docx.text);
t("Word: table rows read with cell separators", /Role \| Owner \| SLA/.test(docx.text) && /Dispatcher \| Ops \| 4 h/.test(docx.text), docx.text);
t("Word: non-English characters kept", /Ünïcode check: café, 25 °C/.test(docx.text));

const pptx = await read("deck.pptx");
t("PowerPoint: slides in order with their text", /^Slide 1:\nCurrent pain points\nManual job cards\nNo SLA tracking/.test(pptx.text) && /Slide 2:\nTarget state\nMobile capture by technicians/.test(pptx.text), pptx.text);
t("PowerPoint: speaker notes read", /Notes: Supervisors re-key every job card twice\./.test(pptx.text), pptx.text);

const xlsx = await read("data.xlsx");
t("Excel: every sheet by name", /Sheet: Fields/.test(xlsx.text) && /Sheet: Roles/.test(xlsx.text), xlsx.text);
t("Excel: text, numbers and booleans in rows", /Field \| Type \| Required/.test(xlsx.text) && /jobNumber \| string \| TRUE/.test(xlsx.text) && /estimatedHours \| 4\.5 \| FALSE/.test(xlsx.text) && /Technician \| 42/.test(xlsx.text), xlsx.text);

const pdf = await read("brief.pdf", "application/pdf");
t("PDF: text of every page", pdf.extraction.status === "read" && /Page 1:/.test(pdf.text) && /Dispatchers assign jobs to technicians within 4 hours/.test(pdf.text) && /Page 2:\nPage two: approvals require a supervisor sign-off/.test(pdf.text), pdf.text);
const scan = await read("scanned-like.pdf", "application/pdf");
t("PDF without text is flagged as scanned", scan.extraction.status === "partial" && /scanned PDF/.test(scan.extraction.note), JSON.stringify(scan.extraction));

const txt = await read("notes.txt", "text/plain");
t("Text file read as written", txt.extraction.status === "read" && txt.text === 'Step one → step two\nnotes, with "quotes"');

const legacy = await read("legacy.doc");
t("Old .doc: not read, with a Save As hint", legacy.extraction.status === "not-read" && /Save As" \.docx/.test(legacy.extraction.note) && legacy.text === "");
const corrupt = await read("corrupt.docx");
t("Damaged file: reported as unreadable, no crash", corrupt.extraction.status === "error" && /password-protected or damaged/.test(corrupt.extraction.note));
const img = await extractMaterialText("screen.png", "image/png", new ArrayBuffer(8));
t("Image: not read, asks for a description", img.extraction.status === "not-read" && /describing what the screenshot shows/.test(img.extraction.note));
const audio = await extractMaterialText("call.m4a", "audio/mp4", new ArrayBuffer(8));
t("Audio: not read, asks for a transcript", audio.extraction.status === "not-read" && /transcript/.test(audio.extraction.note));

const big = new TextEncoder().encode("x".repeat(MAX_CHARS_PER_FILE + 5000));
const long = await extractMaterialText("long.txt", "text/plain", big.buffer);
t("Long file: cut at the cap and the cut is stated", long.extraction.truncated && long.extraction.status === "partial" && long.text.startsWith("x".repeat(100)) && /truncated: first 40,000 of 45,000 characters read/.test(long.text) && /first 40,000 of 45,000/.test(long.extraction.note));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
