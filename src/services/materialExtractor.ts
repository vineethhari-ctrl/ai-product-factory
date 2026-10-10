import JSZip from 'jszip';
import type { MaterialExtraction } from '../types';

/**
 * Reads the text out of an uploaded file in the browser, so the AI and the offline engine work
 * from what the file actually says. Word, PowerPoint and Excel files are zip archives of XML;
 * PDFs are read with pdf.js. Images, audio and old binary Office formats are not read: the BA is
 * told so and asked to add a short description instead.
 */

/** Per-file cap, about 10k tokens: keeps prompts, cost and the browser's saved session bounded. */
export const MAX_CHARS_PER_FILE = 40_000;
const MAX_ROWS_PER_SHEET = 500;

/** The part of pdf.js this module uses; the browser and Node builds both satisfy it. */
export interface PdfLib {
  getDocument(src: { data: Uint8Array; isEvalSupported?: boolean; verbosity?: number }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{ getTextContent(): Promise<{ items: Array<{ str?: string; hasEOL?: boolean }> }> }>;
    }>;
  };
}

export interface ExtractOptions {
  /** pdf.js to use; defaults to the browser build, loaded only when a PDF is uploaded. */
  pdfjs?: PdfLib;
}

const ext = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

const decodeXml = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

const tidy = (s: string) => s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

const byNumber = (a: string, b: string) => Number(a.match(/(\d+)\.xml$/)?.[1] ?? 0) - Number(b.match(/(\d+)\.xml$/)?.[1] ?? 0);

/** Word: paragraphs, with table cells separated by " | ". */
function docxXmlToText(xml: string): string {
  const body = xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    // A cell's last paragraph ends with the cell, so a table row stays on one line.
    .replace(/<\/w:p>(\s*)<\/w:tc>/g, '</w:tc>')
    .replace(/<\/w:tc>/g, ' | ')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<\/w:p>/g, '\n');
  // Keep only run text (w:t) and the separators inserted above.
  const text = body.replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g, (_, t) => `\u0000${t}\u0000`);
  return tidy(
    text
      .split(/(\u0000[\s\S]*?\u0000)/)
      .map((part) => (part.startsWith('\u0000') ? decodeXml(part.slice(1, -1)) : part.replace(/<[^>]+>/g, '')))
      .join('')
      .replace(/ \| \n/g, '\n')
  );
}

/** PowerPoint / drawing XML: a:t runs, one line per paragraph. */
function drawingXmlToText(xml: string): string {
  const lines = xml.split(/<\/a:p>/).map((p) => [...p.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXml(m[1])).join(''));
  return tidy(lines.filter((l) => l.trim()).join('\n'));
}

async function readDocx(zip: JSZip): Promise<string> {
  const doc = await zip.file('word/document.xml')?.async('string');
  if (!doc) throw new Error('This Word file has no document body.');
  return docxXmlToText(doc);
}

async function readPptx(zip: JSZip): Promise<string> {
  const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort(byNumber);
  if (slides.length === 0) throw new Error('This presentation has no slides.');
  const out: string[] = [];
  for (const [i, path] of slides.entries()) {
    const slide = drawingXmlToText(await zip.file(path)!.async('string'));
    const notesPath = `ppt/notesSlides/notesSlide${path.match(/(\d+)\.xml$/)![1]}.xml`;
    const notesXml = await zip.file(notesPath)?.async('string');
    // Speaker notes often hold the real explanation; the slide number placeholder is dropped.
    const notes = notesXml ? drawingXmlToText(notesXml).split('\n').filter((l) => !/^\d+$/.test(l.trim())).join('\n') : '';
    out.push(`Slide ${i + 1}:\n${slide || '(no text)'}${notes ? `\nNotes: ${notes}` : ''}`);
  }
  return out.join('\n\n');
}

async function readXlsx(zip: JSZip): Promise<string> {
  const shared: string[] = [];
  const sst = await zip.file('xl/sharedStrings.xml')?.async('string');
  if (sst) for (const si of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push([...si[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join(''));

  // Sheet names in workbook order, mapped to their files through the relationships part.
  const workbook = (await zip.file('xl/workbook.xml')?.async('string')) ?? '';
  const rels = (await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) ?? '';
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => {
    const id = m[0].match(/\bId="([^"]+)"/)?.[1] ?? '';
    const t = m[0].match(/\bTarget="([^"]+)"/)?.[1] ?? '';
    return [id, t.startsWith('/') ? t.slice(1) : `xl/${t}`];
  }));
  let sheets = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({
    name: decodeXml(m[0].match(/\bname="([^"]*)"/)?.[1] ?? 'Sheet'),
    path: target.get(m[0].match(/\br:id="([^"]+)"/)?.[1] ?? '') ?? '',
  })).filter((s) => zip.file(s.path));
  if (sheets.length === 0) {
    sheets = Object.keys(zip.files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort(byNumber).map((path, i) => ({ name: `Sheet ${i + 1}`, path }));
  }
  if (sheets.length === 0) throw new Error('This workbook has no sheets.');

  const out: string[] = [];
  for (const sheet of sheets) {
    const xml = await zip.file(sheet.path)!.async('string');
    const rows: string[] = [];
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      if (rows.length >= MAX_ROWS_PER_SHEET) { rows.push(`… (more rows not read)`); break; }
      const cells = [...row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map((c) => {
        const type = c[1].match(/\bt="([^"]+)"/)?.[1];
        const inner = c[2] ?? '';
        if (type === 'inlineStr') return [...inner.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join('');
        const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        if (v === undefined) return '';
        if (type === 's') return shared[Number(v)] ?? '';
        if (type === 'b') return v === '1' ? 'TRUE' : 'FALSE';
        return decodeXml(v);
      });
      if (cells.some((c) => c.trim())) rows.push(cells.join(' | ').replace(/(\s\|\s)+$/, ''));
    }
    out.push(`Sheet: ${sheet.name}\n${rows.join('\n') || '(empty)'}`);
  }
  return out.join('\n\n');
}

async function readPdf(buffer: ArrayBuffer, options: ExtractOptions): Promise<{ text: string; pages: number }> {
  const pdfjs = options.pdfjs ?? ((await import('./pdfjsBrowser')).default as unknown as PdfLib);
  // Fonts are not needed to read text, so pdf.js's missing-font warnings are silenced (verbosity 0 = errors only).
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, verbosity: 0 }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    const text = content.items.map((i) => (i.str ?? '') + (i.hasEOL ? '\n' : '')).join('');
    pages.push(`Page ${n}:\n${tidy(text)}`);
  }
  return { text: pages.join('\n\n'), pages: doc.numPages };
}

const unsupported = (note: string): { text: string; extraction: MaterialExtraction } => ({
  text: '',
  extraction: { status: 'not-read', note, chars: 0, truncated: false },
});

/** Text of the file plus how the read went, for the material list and the AI. */
export async function extractMaterialText(
  name: string,
  mime: string,
  buffer: ArrayBuffer,
  options: ExtractOptions = {}
): Promise<{ text: string; extraction: MaterialExtraction }> {
  const e = ext(name);
  try {
    let text: string;
    let note = '';
    if (['txt', 'md', 'csv', 'tsv', 'json', 'log', 'xml', 'html', 'htm'].includes(e) || mime.startsWith('text/')) {
      text = tidy(new TextDecoder('utf-8').decode(buffer));
    } else if (e === 'docx') {
      text = await readDocx(await JSZip.loadAsync(buffer));
    } else if (e === 'pptx') {
      text = await readPptx(await JSZip.loadAsync(buffer));
    } else if (e === 'xlsx' || e === 'xlsm') {
      text = await readXlsx(await JSZip.loadAsync(buffer));
    } else if (e === 'pdf' || mime.includes('pdf')) {
      const pdf = await readPdf(buffer, options);
      text = pdf.text;
      // A scanned PDF is images of pages: almost no text per page.
      if (text.replace(/Page \d+:/g, '').replace(/\s/g, '').length < 40 * pdf.pages) {
        return { text, extraction: { status: 'partial', note: 'Looks like a scanned PDF (pictures of pages), so little or no text could be read. Paste the key points as a note.', chars: text.length, truncated: false } };
      }
    } else if (['doc', 'ppt', 'xls'].includes(e)) {
      return unsupported(`Old Office format (.${e}). Open it and "Save As" .${e}x, then upload that.`);
    } else if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(e)) {
      return unsupported('Images are not read yet. Add a note describing what the screenshot shows.');
    } else if (mime.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'aac', 'ogg'].includes(e)) {
      return unsupported('Audio is not transcribed yet. Paste the transcript as a note.');
    } else {
      return unsupported(`This file type (.${e || 'unknown'}) is not read. Paste its content as a note.`);
    }

    if (!text.trim()) return { text: '', extraction: { status: 'partial', note: 'The file contains no readable text.', chars: 0, truncated: false } };
    const truncated = text.length > MAX_CHARS_PER_FILE;
    if (truncated) {
      note = `Long file: the first ${MAX_CHARS_PER_FILE.toLocaleString('en-US')} of ${text.length.toLocaleString('en-US')} characters are used.`;
      text = `${text.slice(0, MAX_CHARS_PER_FILE)}\n[… truncated: first ${MAX_CHARS_PER_FILE.toLocaleString('en-US')} of ${text.length.toLocaleString('en-US')} characters read]`;
    }
    return { text, extraction: { status: truncated ? 'partial' : 'read', note, chars: Math.min(text.length, MAX_CHARS_PER_FILE), truncated } };
  } catch (err) {
    return {
      text: '',
      extraction: { status: 'error', note: `Could not read this file (${(err as Error).message || 'unknown error'}). It may be password-protected or damaged.`, chars: 0, truncated: false },
    };
  }
}
