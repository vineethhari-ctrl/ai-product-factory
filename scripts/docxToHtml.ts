import JSZip from "jszip";
// jsdom is a temporary dev tool without bundled types.
// @ts-ignore
import { JSDOM } from "jsdom";

/**
 * Test helper: reads a .docx the way a reader sees it and gives HTML the checks can query (h1 title, h2 headings, p, li, tables
 * with thead/tbody, `class="tall"` for rows with room to write, `landscape` markers). Not part of the app.
 */
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface DocxInfo { html: string; title: string; xml: Document; core: Document; landscapeSections: number; portraitSections: number; names: string[]; }

export async function readDocx(data: Uint8Array | Buffer): Promise<DocxInfo> {
  const zip = await JSZip.loadAsync(data);
  const names = Object.keys(zip.files);
  const parse = (xml: string): Document => new JSDOM(xml, { contentType: "text/xml" }).window.document;
  const xml = parse(await zip.file("word/document.xml")!.async("string"));
  const core = parse(await zip.file("docProps/core.xml")!.async("string"));
  const title = core.getElementsByTagName("dc:title")[0]?.textContent ?? "";
  const text = (el: Element): string => {
    let out = "";
    const walk = (n: Node) => {
      for (const c of Array.from(n.childNodes)) {
        const e = c as Element;
        if (e.nodeType !== 1) continue;
        if (e.localName === "t") out += e.textContent ?? "";
        else if (e.localName === "br") out += "\n";
        else walk(e);
      }
    };
    walk(el);
    return out;
  };
  const style = (p: Element) => p.getElementsByTagName("w:pStyle")[0]?.getAttribute("w:val") ?? "";
  const para = (p: Element): string => {
    const s = style(p), t = esc(text(p));
    if (s === "Title") return `<h1>${t}</h1>`;
    if (s === "Heading1") return `<h2>${t}</h2>`;
    if (p.getElementsByTagName("w:numPr").length) return `<ul><li>${t}</li></ul>`;
    const bold = p.getElementsByTagName("w:b").length > 0;
    return t ? `<p>${bold ? `<b>${t}</b>` : t}</p>` : "";
  };
  const table = (tbl: Element): string => {
    const rows = Array.from(tbl.childNodes).filter((n) => (n as Element).localName === "tr") as Element[];
    const isHead = (r: Element) => r.getElementsByTagName("w:tblHeader").length > 0;
    const tall = rows.some((r) => r.getElementsByTagName("w:trHeight").length > 0);
    const cells = (r: Element, tag: string) => (Array.from(r.childNodes).filter((n) => (n as Element).localName === "tc") as Element[]).map((c) => `<${tag}>${esc(Array.from(c.childNodes).filter((n) => (n as Element).localName === "p").map((p) => text(p as Element)).join("\n\n"))}</${tag}>`).join("");
    const head = rows.filter(isHead), body = rows.filter((r) => !isHead(r));
    return `<table${tall ? ' class="tall"' : ""}>${head.length ? `<thead>${head.map((r) => `<tr>${cells(r, "th")}</tr>`).join("")}</thead>` : ""}<tbody>${body.map((r) => `<tr>${cells(r, "td")}</tr>`).join("")}</tbody></table>`;
  };
  const body = xml.getElementsByTagName("w:body")[0];
  const html = Array.from(body.childNodes).map((n) => {
    const e = n as Element;
    if (e.localName === "p") return para(e);
    if (e.localName === "tbl") return table(e);
    return "";
  }).join("");
  const pgs = Array.from(xml.getElementsByTagName("w:pgSz"));
  const landscapeSections = pgs.filter((x) => x.getAttribute("w:orient") === "landscape").length;
  return { html: `<html><head><title>${esc(title)}</title></head><body>${html}</body></html>`, title, xml, core, landscapeSections, portraitSections: pgs.length - landscapeSections, names };
}
