import JSZip from 'jszip';
import type { Section } from './docRender';

/**
 * A real Word document (.docx) from the same section model as the Markdown and the .doc: a title, intro lines, numbered
 * headings, paragraphs, bullet lists and tables (header row repeats on every page, tall rows give room to write in).
 * Written with JSZip only (no extra library), so it runs in the browser and on the server. Wide tables switch their part of
 * the document to landscape. Deterministic: the same input and `now` give the same bytes.
 */

const WIDE_COLUMNS = 6;
const PORTRAIT = { w: 11906, h: 16838, margin: 1134 };

// Characters XML 1.0 cannot carry are dropped; the rest is escaped.
const clean = (t: string) => t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
const esc = (t: string) => clean(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface RunOpts { bold?: boolean; italic?: boolean; color?: string; size?: number }
function run(text: string, o: RunOpts = {}): string {
  const rpr = `${o.bold ? '<w:b/>' : ''}${o.italic ? '<w:i/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}${o.size ? `<w:sz w:val="${o.size}"/><w:szCs w:val="${o.size}"/>` : ''}`;
  // A line break inside a text becomes a Word line break.
  const parts = clean(text).split(/\r?\n/).map((l) => `<w:t xml:space="preserve">${esc(l)}</w:t>`);
  return `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}${parts.join('<w:br/>')}</w:r>`;
}
const para = (text: string, o: RunOpts & { style?: string; bullet?: boolean; spacing?: string } = {}): string =>
  `<w:p><w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.bullet ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : ''}${o.spacing ?? ''}</w:pPr>${text === '' ? '' : run(text, o)}</w:p>`;

function colWidths(head: string[], rows: string[][], total: number): number[] {
  const n = head.length;
  const cells = (i: number) => [head[i] ?? '', ...rows.map((r) => r[i] ?? '')];
  // A column is never narrower than its longest word (up to 14 characters), so labels like "Remove" or "Module" do not break mid-word.
  const longestWord = (i: number) => Math.min(14, Math.max(2, ...cells(i).flatMap((c) => c.split(/\s+/).map((w) => w.length))));
  const floor = head.map((_, i) => longestWord(i) * 105 + 240);
  const weight = head.map((_, i) => {
    const lens = rows.map((r) => (r[i] ?? '').length);
    const avg = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
    const longest = Math.max((head[i] ?? '').length, ...(lens.length ? lens : [0]));
    // Short ids and labels stay narrow; long prose gets the room.
    return Math.max(4, Math.min(44, Math.round(0.6 * avg + 0.4 * Math.min(longest, 60))));
  });
  const floorSum = floor.reduce((a, b) => a + b, 0);
  // If even the floors do not fit, shrink them evenly; otherwise share the rest by weight.
  if (floorSum >= total) return floor.map((f) => Math.floor((f / floorSum) * total));
  const rest = total - floorSum, wsum = weight.reduce((a, b) => a + b, 0) || 1;
  const widths = floor.map((f, i) => f + Math.floor((weight[i] / wsum) * rest));
  const drift = total - widths.reduce((a, b) => a + b, 0);
  widths[widths.indexOf(Math.max(...widths))] += drift;
  void n;
  return widths;
}

function table(b: Extract<Section['blocks'][number], { kind: 'table' }>, contentWidth: number): string {
  const widths = colWidths(b.head, b.rows, contentWidth);
  const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>`;
  const cell = (text: string, w: number, o: { head?: boolean; bold?: boolean } = {}) =>
    `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${o.head ? '<w:shd w:val="clear" w:color="auto" w:fill="EEF2FF"/>' : ''}</w:tcPr>${text === '' ? '<w:p><w:pPr><w:pStyle w:val="TableText"/></w:pPr></w:p>' : text.split(/\r?\n\r?\n/).map((chunk) => para(chunk, { style: 'TableText', bold: o.head || o.bold })).join('')}</w:tc>`;
  const tr = (cells: string[], o: { head?: boolean; bold?: boolean; tall?: boolean } = {}) =>
    `<w:tr><w:trPr><w:cantSplit/>${o.tall ? '<w:trHeight w:val="680" w:hRule="atLeast"/>' : ''}${o.head ? '<w:tblHeader/>' : ''}</w:trPr>${cells.map((c, i) => cell(c ?? '', widths[i], o)).join('')}</w:tr>`;
  // A table whose header cells are all empty (a label/value list) has no header row.
  const rows = [
    ...(b.head.every((h) => !h.trim()) ? [] : [tr(b.head, { head: true })]),
    ...b.rows.map((r) => tr(r, { tall: b.tall })),
    ...(b.foot ? [tr(b.foot, { bold: true })] : []),
  ].join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${contentWidth}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows}</w:tbl>${para('', { spacing: '<w:spacing w:before="0" w:after="60"/>' })}${b.note ? para(b.note, { italic: true, size: 18 }) : ''}`;
}

const isWide = (sec: Section) => sec.blocks.some((b) => b.kind === 'table' && b.head.length >= WIDE_COLUMNS);

const sectPr = (landscape: boolean) => {
  const w = landscape ? PORTRAIT.h : PORTRAIT.w, h = landscape ? PORTRAIT.w : PORTRAIT.h;
  return `<w:sectPr><w:footerReference w:type="default" r:id="rId3"/><w:pgSz w:w="${w}" w:h="${h}"${landscape ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${PORTRAIT.margin}" w:right="${PORTRAIT.margin}" w:bottom="${PORTRAIT.margin}" w:left="${PORTRAIT.margin}" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`;
};
const contentWidth = (landscape: boolean) => (landscape ? PORTRAIT.h : PORTRAIT.w) - 2 * PORTRAIT.margin;

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const STYLES = `${XML}<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:color w:val="1E293B"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="160"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="3730A3"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="20" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:color w:val="64748B"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr></w:style>
</w:styles>`;

const NUMBERING = `${XML}<w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#8226;"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="500" w:hanging="260"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;

const footer = (label: string) => `${XML}<w:ftr ${NS}><w:p><w:pPr><w:pStyle w:val="Footer"/><w:jc w:val="right"/></w:pPr>${run(`${label}   Page `)}<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;

export interface DocxOptions {
  /** Written into the file properties and fixes every zip timestamp, so the same input gives the same bytes. */
  now?: Date;
  author?: string;
  /** Small text at the foot of every page, before the page number. */
  footer?: string;
}

/** The .docx bytes for a titled document made of sections. */
export async function renderDocx(title: string, introLines: string[], sections: Section[], opts: DocxOptions = {}): Promise<Uint8Array> {
  const now = opts.now ?? new Date();
  // Group consecutive sections that need the same page orientation; the first group also carries the title and intro.
  const groups: Array<{ landscape: boolean; xml: string }> = [];
  const head = [para(title, { style: 'Title' }), ...introLines.filter(Boolean).map((l) => para(l))].join('');
  sections.forEach((sec, i) => {
    const landscape = isWide(sec);
    let g = groups[groups.length - 1];
    if (!g || g.landscape !== landscape) { g = { landscape, xml: '' }; groups.push(g); }
    g.xml += para(`${i + 1}. ${sec.title}`, { style: 'Heading1' });
    for (const b of sec.blocks) {
      if (b.kind === 'p') g.xml += para(b.text, { bold: b.bold });
      else if (b.kind === 'ul') g.xml += b.items.map((x) => para(x, { bullet: true, spacing: '<w:spacing w:after="40"/>' })).join('');
      else g.xml += table(b, contentWidth(landscape));
    }
  });
  if (!groups.length) groups.push({ landscape: false, xml: '' });
  groups[0].xml = head + groups[0].xml;
  const body = groups.map((g, i) => (i < groups.length - 1 ? `${g.xml}<w:p><w:pPr>${sectPr(g.landscape)}</w:pPr></w:p>` : g.xml)).join('') + sectPr(groups[groups.length - 1].landscape);
  const iso = now.toISOString().replace(/\.\d{3}Z$/, 'Z');

  const zip = new JSZip();
  // No folder entries: JSZip would stamp them with the current time and the bytes would differ on every run.
  const add = (name: string, data: string) => zip.file(name, data, { date: now, createFolders: false });
  add('[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
  add('_rels/.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  add('word/_rels/document.xml.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`);
  add('word/document.xml', `${XML}<w:document ${NS}><w:body>${body}</w:body></w:document>`);
  add('word/styles.xml', STYLES);
  add('word/numbering.xml', NUMBERING);
  add('word/footer1.xml', footer(opts.footer ?? title));
  add('docProps/core.xml', `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>${esc(opts.author ?? 'AI Product Factory')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`);
  add('docProps/app.xml', `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>AI Product Factory</Application></Properties>`);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}
