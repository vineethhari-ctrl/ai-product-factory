import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { ProductDefinition } from "../src/types";

/**
 * Export prototype: ONE HTML file with the finished application inside it (the viewer's script and styles, plus the project's
 * definition as data). It opens in any browser by double-click, needs no server, no key and no network (system fonts only), is
 * view only and shows sample data. The viewer (src/viewer) is built by `npm run build:viewer` into dist-viewer/; in development
 * it is built on the first export and again whenever the source is newer.
 */

const viewerDir = () => process.env.PROTOTYPE_VIEWER_DIR || path.join(process.cwd(), "dist-viewer");

function newestSourceTime(): number {
  let newest = 0;
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx?|css)$/.test(e.name)) newest = Math.max(newest, statSync(p).mtimeMs);
    }
  };
  walk(path.join(process.cwd(), "src"));
  for (const f of ["vite.viewer.config.ts", path.join("server", "constraints.ts")]) {
    const p = path.join(process.cwd(), f);
    if (existsSync(p)) newest = Math.max(newest, statSync(p).mtimeMs);
  }
  return newest;
}

let building: Promise<void> | null = null;

async function buildViewer(): Promise<void> {
  if (!building) {
    building = (async () => {
      const { build } = await import("vite");
      await build({ configFile: path.join(process.cwd(), "vite.viewer.config.ts"), logLevel: "warn" });
    })().finally(() => { building = null; });
  }
  return building;
}

/** The viewer's script and styles; builds them when they are missing (or, outside production, older than the source). */
export async function viewerAssets(): Promise<{ js: string; css: string }> {
  const js = path.join(viewerDir(), "viewer.js"), css = path.join(viewerDir(), "viewer.css");
  const stale = process.env.NODE_ENV !== "production" && existsSync(js) && statSync(js).mtimeMs < newestSourceTime();
  if (!existsSync(js) || !existsSync(css) || stale) {
    try {
      await buildViewer();
    } catch (e) {
      throw new Error(`The prototype viewer could not be built (${(e as Error).message}). Run "npm run build:viewer" once and try again.`);
    }
  }
  if (!existsSync(js) || !existsSync(css)) throw new Error('The prototype viewer is missing. Run "npm run build:viewer" and try again.');
  return { js: readFileSync(js, "utf8"), css: readFileSync(css, "utf8") };
}

/** Only what the application needs: the BRD's analysis, tests, plans, proposal and research stay out of the file. */
export function definitionForViewer(def: ProductDefinition): Partial<ProductDefinition> {
  const { id, version, productName, businessUnit, uiTheme, personas, modules, screens, dataEntities } = def;
  return { id, version, productName, businessUnit, uiTheme, personas, modules, screens, dataEntities };
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** JSON that is safe inside a <script type="application/json"> element: no "</script", no "<!--", no line-separator characters. */
export const jsonForScript = (v: unknown): string =>
  JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

/** Script text that is safe inside a <script> element (a "</script" or "<!--" in a string stays the same string). */
const scriptSafe = (js: string): string => js.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\u0021--");

export async function buildPrototypeHtml(def: ProductDefinition): Promise<string> {
  const { js, css } = await viewerAssets();
  const title = `${def.productName || "Prototype"} (prototype)`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${css.replace(/<\/style/gi, "<\\/style")}</style>
</head>
<body>
<div id="root"></div>
<script id="prototype-data" type="application/json">${jsonForScript(definitionForViewer(def))}</script>
<script>${scriptSafe(js)}</script>
</body>
</html>
`;
}

export const prototypeFileName = (productName: string, now = new Date()): string =>
  `${(productName || "prototype").trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "prototype"}_prototype_${now.toISOString().slice(0, 10)}.html`;
