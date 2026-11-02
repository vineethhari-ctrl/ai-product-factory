/**
 * One small document model (paragraphs, bullet lists, tables) and its renderers: Markdown, and HTML that Word opens as a document
 * (saved as .doc, no library). The proposal, the BRD and the review sheet are all written as sections of this model, so what is
 * on screen, copied and downloaded always agree.
 */

export type Block =
  | { kind: 'p'; text: string; bold?: boolean }
  | { kind: 'ul'; items: string[] }
  /** `tall` gives each row room to write in (a column left empty for the reader's answer). */
  | { kind: 'table'; head: string[]; rows: string[][]; foot?: string[]; note?: string; tall?: boolean };
export interface Section { id: string; title: string; blocks: Block[]; }

const cell = (t: string) => t.replace(/\|/g, '/').replace(/\n/g, ' ');
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderMarkdown(title: string, intro: string[], sections: Section[]): string {
  const out: string[] = [`# ${title}`, '', ...intro.flatMap((l) => [l, '']) ];
  sections.forEach((sec, i) => {
    out.push(`## ${i + 1}. ${sec.title}`, '');
    for (const b of sec.blocks) {
      if (b.kind === 'p') out.push(b.bold ? `**${b.text}**` : b.text, '');
      else if (b.kind === 'ul') out.push(...b.items.map((x) => `- ${x}`), '');
      else {
        out.push(`| ${b.head.map(cell).join(' | ')} |`, `| ${b.head.map(() => '---').join(' | ')} |`, ...b.rows.map((r) => `| ${r.map(cell).join(' | ')} |`));
        if (b.foot) out.push(`| ${b.foot.map((x) => `**${cell(x)}**`).join(' | ')} |`);
        out.push('');
        if (b.note) out.push(b.note, '');
      }
    }
  });
  return out.join('\n');
}

const STYLE = 'body{font-family:Calibri,Arial,sans-serif;font-size:10.5pt;color:#1e293b}h1{font-size:20pt}h2{font-size:14pt;color:#3730a3;margin-top:18pt}table{border-collapse:collapse;width:100%;margin:6pt 0}th,td{border:1px solid #cbd5e1;padding:3pt 5pt;vertical-align:top;font-size:9pt}th{background:#eef2ff;text-align:left}table.tall td{height:34pt}';

/** HTML Word opens as a document (saved as .doc). `introLines` are plain text paragraphs under the title. */
export function renderHtml(title: string, introLines: string[], sections: Section[]): string {
  const body = sections.map((sec, i) => `<h2>${i + 1}. ${esc(sec.title)}</h2>` + sec.blocks.map((b) => {
    if (b.kind === 'p') return b.bold ? `<p><b>${esc(b.text).replace(/\n/g, '<br>')}</b></p>` : `<p>${esc(b.text).replace(/\n/g, '<br>')}</p>`;
    if (b.kind === 'ul') return `<ul>${b.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
    return `<table${b.tall ? ' class="tall"' : ''}><thead><tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}${b.foot ? `<tr>${b.foot.map((c) => `<td><b>${esc(c)}</b></td>`).join('')}</tr>` : ''}</tbody></table>${b.note ? `<p><i>${esc(b.note)}</i></p>` : ''}`;
  }).join('')).join('');
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLE}</style></head><body><h1>${esc(title)}</h1>${introLines.map((l) => `<p>${esc(l)}</p>`).join('')}${body}</body></html>`;
}
