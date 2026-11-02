/**
 * Demo tour: drives the REAL app through one requirement end to end and records screenshots, the position of every
 * component worth pointing at, and the Word documents it produces. build.cjs turns that into one self-contained HTML tour.
 * Needs the app running (npm run dev) and Playwright + ImageMagick + LibreOffice (dev tools, not project dependencies).
 *   node scripts/demo-tour/capture.cjs           (writes TOUR_OUT, default ./demo-tour/out)
 */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const SPEC = require('./spec.cjs');
let CONTENT = {}; try { CONTENT = require('./content.cjs'); } catch { /* optional */ }

const OUT = path.resolve(process.env.TOUR_OUT || 'demo-tour/out');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const AI = process.env.TOUR_AI === '1'; // a real AI key is attached: wait longer for every step
const W = 1440, H = 900;
const POST_ONLY = process.env.TOUR_POST_ONLY === '1'; // reuse the recorded flow; redo only the documents and the phone pictures
for (const d of ['shots', 'dbg', 'docs', 'raw']) fs.mkdirSync(path.join(OUT, d), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

function locOf(p, s) {
  const i = s.indexOf(':'); const kind = s.slice(0, i), v = s.slice(i + 1);
  switch (kind) {
    case 'btn': return p.getByRole('button', { name: v });
    case 'btnx': return p.getByRole('button', { name: v, exact: true });
    case 'textx': return p.getByText(v, { exact: true });
    case 'text': return p.getByText(v);
    case 'css': return p.locator(v);
    case 'lbl': return p.getByLabel(v);
    case 'ph': return p.getByPlaceholder(v);
    case 'tab': return p.getByRole('tab', { name: v });
    case 'h': return p.getByRole('heading', { name: v });
    default: throw new Error('bad target ' + s);
  }
}
async function boxOf(p, s) {
  if (s.startsWith('rect:')) { const [x, y, w, h] = s.slice(5).split(',').map(Number); return { x, y, w, h }; }
  if (s.startsWith('union:')) {
    const bs = []; for (const part of s.slice(6).split('||')) { const b = await boxOf(p, part); if (b) bs.push(b); }
    if (!bs.length) return null;
    const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y));
    return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y };
  }
  let m = /^up:(\d+):(.*)$/.exec(s), up = 0; if (m) { up = Number(m[1]); s = m[2]; }
  let loc = locOf(p, s).filter({ visible: true }).first();
  for (let i = 0; i < up; i++) loc = loc.locator('xpath=..');
  try { const b = await loc.boundingBox({ timeout: 2500 }); if (!b || b.y + b.height < 24 || b.y > H - 8 || b.x > W - 8) return null; return { x: b.x, y: b.y, w: b.width, h: b.height }; } catch { return null; }
}
async function scrollTo(p, s, offset = 140) {
  if (s === 'bottom') { await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await sleep(350); return; }
  let m = /^up:(\d+):(.*)$/.exec(s), up = 0; if (m) { up = Number(m[1]); s = m[2]; }
  let loc = locOf(p, s).filter({ visible: true }).first();
  for (let i = 0; i < up; i++) loc = loc.locator('xpath=..');
  await loc.evaluate((el, off) => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -off); }, offset);
  await sleep(350);
}
const toWebp = (png, webp, q = 80) => execFileSync('convert', [png, '-quality', String(q), '-define', 'webp:method=5', webp]);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  const manifest = { generatedAt: new Date().toISOString(), ai: AI, product: SPEC.product, shots: [], docs: [], notes: [], downloads: [] };
  const ctxs = { p, sleep, log, OUT, AI, BASE, manifest, downloadVia: null };

  async function dismissBanner() { const b = p.locator('button[aria-label="Dismiss"]'); for (let i = 0; i < 3 && await b.count(); i++) { try { await b.first().click({ timeout: 800 }); } catch { break; } await sleep(150); } }

  async function takeShot(s0) {
    const s = { ...s0, ...(CONTENT[s0.id] || {}) };
    try {
      await p.evaluate(() => { if (!document.getElementById('__hidetoast')) { const st = document.createElement('style'); st.id = '__hidetoast'; st.textContent = 'div.fixed.bottom-6.right-6{display:none!important}'; document.head.appendChild(st); } }).catch(() => {});
      if (s.before) await s.before(ctxs);
      if (s.hideBanner !== false) await dismissBanner();
      if (s.scroll) await scrollTo(p, s.scroll, s.offset ?? 140); else if (s.top !== false) await p.evaluate(() => window.scrollTo(0, 0));
      await sleep(s.settle ?? 450);
      const raw = path.join(OUT, 'raw', s.id + '.png');
      await p.screenshot({ path: raw });
      const pins = [];
      for (const [i, pin] of (s.pins || []).entries()) {
        const b = await boxOf(p, pin.at);
        if (!b || b.w < 4 || b.h < 4) { log(`   (pin ${i + 1} "${pin.label}" not found: ${pin.at})`); continue; }
        const pad = pin.pad ?? 4;
        const x = Math.max(2, b.x - pad), y = Math.max(2, b.y - pad), w = Math.min(W - 4 - x, b.w + 2 * pad), h = Math.min(H - 4 - y, b.h + 2 * pad);
        pins.push({ n: pins.length + 1, label: pin.label, note: pin.note, x: +(x / W * 100).toFixed(3), y: +(y / H * 100).toFixed(3), w: +(w / W * 100).toFixed(3), h: +(h / H * 100).toFixed(3) });
      }
      toWebp(raw, path.join(OUT, 'shots', s.id + '.webp'));
      // a debug picture with the pins drawn on, to review them
      await p.evaluate((pp) => { const d = document.createElement('div'); d.id = '__pins'; d.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99999'; for (const q of pp) { const r = document.createElement('div'); r.style.cssText = `position:absolute;left:${q.x}%;top:${q.y}%;width:${q.w}%;height:${q.h}%;border:2px solid #e9730c;border-radius:6px;background:rgba(233,115,12,.08)`; const n = document.createElement('div'); n.textContent = q.n; n.style.cssText = 'position:absolute;left:-10px;top:-10px;width:20px;height:20px;border-radius:50%;background:#e9730c;color:#fff;font:700 12px sans-serif;display:flex;align-items:center;justify-content:center'; r.appendChild(n); d.appendChild(r); } document.body.appendChild(d); }, pins);
      await p.screenshot({ path: path.join(OUT, 'dbg', s.id + '.png') });
      await p.evaluate(() => document.getElementById('__pins')?.remove());
      manifest.shots.push({ id: s.id, chapter: s.chapter, title: s.title, lead: s.lead, value: s.value, tip: s.tip, file: `shots/${s.id}.webp`, pins });
      log(`ok  ${s.id}  (${pins.length}/${(s.pins || []).length} pins)`);
      if (s.after) await s.after(ctxs);
    } catch (e) { log(`ERR ${s.id}: ${String(e.message).split('\n')[0]}`); }
  }

  if (POST_ONLY) { const old = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8')); Object.assign(manifest, old, { docs: [], docFiles: undefined }); manifest.shots = old.shots.filter((s) => !s.phone); }
  else { await p.goto(BASE); await p.addStyleTag({ content: 'div.fixed.bottom-6.right-6{display:none!important}' }); await sleep(1500); }
  for (const step of (POST_ONLY ? [] : SPEC.flow)) {
    if (step.shot) await takeShot(step.shot); else { try { await step.run(ctxs); } catch (e) { log(`ERR step ${step.name}: ${String(e.message).split('\n')[0]}`); } }
  }

  // ───────────── the real documents, rendered page by page
  const sh = (cmd, args, o = {}) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 26, ...o });
  const dlFile = (kind) => { const d = manifest.downloads.find((x) => x.kind === kind); return d ? path.join(OUT, 'downloads', d.file) : null; };
  try {
    const bu = dlFile('bu-pack'), wp = dlFile('word-pack');
    const dirs = { bu: path.join(OUT, 'pack-bu'), word: path.join(OUT, 'pack-word') };
    for (const [k, f] of [['bu', bu], ['word', wp]]) { if (!f) continue; fs.rmSync(dirs[k], { recursive: true, force: true }); fs.mkdirSync(dirs[k], { recursive: true }); sh('unzip', ['-q', '-o', f, '-d', dirs[k]]); }
    const pdfDir = path.join(OUT, 'pdf'); fs.rmSync(pdfDir, { recursive: true, force: true }); fs.mkdirSync(pdfDir, { recursive: true });
    const docx = [];
    for (const k of ['bu', 'word']) if (fs.existsSync(dirs[k])) for (const n of fs.readdirSync(dirs[k])) if (n.endsWith('.docx')) docx.push([k, n]);
    for (const [k, n] of docx) { const src = path.join(pdfDir, `${k}-${n}`); fs.copyFileSync(path.join(dirs[k], n), src); }
    const lo = path.join(OUT, 'lo-home'); fs.mkdirSync(lo, { recursive: true });
    execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', pdfDir, ...fs.readdirSync(pdfDir).filter((x) => x.endsWith('.docx')).map((x) => path.join(pdfDir, x))], { stdio: 'ignore', timeout: 300000, env: { ...process.env, HOME: lo } });
    const pages = (pdf) => sh('pdftotext', ['-layout', pdf, '-']).split('\f');
    const find = (pdf, re) => { const i = pages(pdf).findIndex((t) => re.test(t)); return i < 0 ? 1 : i + 1; };
    for (const d of SPEC.docs || []) {
      const pdf = path.join(pdfDir, d.file.replace(/\.docx$/, '.pdf'));
      if (!fs.existsSync(pdf)) { log('   (no pdf for ' + d.file + ')'); continue; }
      const pg = d.page ? d.page : find(pdf, d.match);
      const base = path.join(OUT, 'raw', d.id);
      try {
        sh('pdftoppm', ['-r', '95', '-f', String(pg), '-l', String(pg), '-png', '-singlefile', pdf, base]);
        try { toWebp(base + '.png', path.join(OUT, 'docs', d.id + '.webp'), 82); } catch { await sleep(800); toWebp(base + '.png', path.join(OUT, 'docs', d.id + '.webp'), 82); }
        const [w, h] = sh('identify', ['-format', '%w %h', base + '.png']).split(' ').map(Number);
        manifest.docs.push({ id: d.id, title: d.title, caption: d.caption, file: `docs/${d.id}.webp`, doc: d.doc, page: pg, w, h });
        log(`doc ${d.id} page ${pg} (${w}x${h})`);
      } catch (e) { log(`ERR doc ${d.id}: ${String(e.message).split('\n')[0].slice(0, 120)}`); }
    }
    manifest.docFiles = docx.map(([k, n]) => ({ pack: k, name: n, pages: pages(path.join(pdfDir, `${k}-${n.replace(/\.docx$/, '.pdf')}`)).length - 1 }));
  } catch (e) { log('ERR docs: ' + String(e.message).split('\n')[0]); }

  // ───────────── on a phone: the exported prototype file, and the app itself
  try {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const q = await phone.newPage();
    const proto = dlFile('prototype');
    for (const ph of SPEC.phone || []) {
      try {
        if (ph.open === 'prototype') await q.goto('file://' + proto); else if (ph.open === 'app') { await q.goto(BASE); }
        await sleep(1200);
        if (ph.do) await ph.do({ p: q, sleep, OUT });
        const raw = path.join(OUT, 'raw', ph.id + '.png'); await q.screenshot({ path: raw });
        toWebp(raw, path.join(OUT, 'shots', ph.id + '.webp'), 80);
        manifest.shots.push({ id: ph.id, chapter: 'phone', title: ph.title, lead: ph.lead, value: ph.value, file: `shots/${ph.id}.webp`, pins: [], phone: true });
        log('ok  ' + ph.id);
      } catch (e) { log(`ERR ${ph.id}: ${String(e.message).split('\n')[0]}`); }
    }
  } catch (e) { log('ERR phone: ' + String(e.message).split('\n')[0]); }

  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  log('page errors:', JSON.stringify(errors));
  await browser.close();
})();
