/**
 * "How the AI Product Factory works" demo on the Spares example: every step, every important button highlighted and numbered, then the output explained.
 * Drives the real app (AI answers come from the router cache when the same run was done before).  TOUR_OUT=<dir> node scripts/demo-tour/howto.cjs
 * Writes <dir>/slides/*.png and <dir>/slides.json: [{id,title,file,say,marks:[{n,label,what}],explain}]
 */
const fs = require('fs'), path = require('path'); const { chromium } = require('playwright');
const OUT = path.resolve(process.env.TOUR_OUT || 'demo-tour/howto'); const BASE = process.env.BASE_URL || 'http://localhost:3000';
const REQ = 'Spares Management for the Service Centre: spare part requests raised by technicians go through stock check, approval, issue, return of the faulty part and replenishment, with reorder alerts and an audit trail.';
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(path.join(OUT, 'slides'), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const log = console.log; const slides = [];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3 });
  const p = await ctx.newPage(); await p.goto(BASE); await p.addStyleTag({ content: 'div.fixed.bottom-6.right-6{display:none!important}' }); await sleep(1500);
  const btn = (n) => p.getByRole('button', { name: n }).filter({ visible: true }).first();
  const click = async (n, t = 30000) => { const x = btn(n); await x.waitFor({ timeout: t }); await x.scrollIntoViewIfNeeded().catch(() => {}); await x.click(); };
  const step = async (n, f) => { try { await f(); } catch (e) { log('ERR', n, String(e.message).split('\n')[0]); } };
  const dismiss = async () => { const d = p.locator('button[aria-label="Dismiss"]'); for (let i = 0; i < 3 && await d.count(); i++) { await d.first().click({ timeout: 800 }).catch(() => {}); await sleep(150); } };
  const loc = (spec) => { const [k, ...r] = spec.split(':'); const v = r.join(':'); if (k === 'btn') return btn(new RegExp(esc(v))); if (k === 'ph') return p.locator(`[placeholder^="${v}"]`).filter({ visible: true }).first(); if (k === 'text') return p.getByText(v, { exact: false }).filter({ visible: true }).first(); if (k === 'css') return p.locator(v).filter({ visible: true }).first(); return p.locator('nothing'); };
  // slide: ys scroll positions; marks [[spec,label,what]] highlighted (numbered) on the first scroll position where they are on screen
  const slide = async (id, title, o = {}) => {
    await dismiss(); const ys = o.ys || [0];
    for (let i = 0; i < ys.length; i++) {
      await p.evaluate((y) => window.scrollTo(0, y), ys[i]); await sleep(450);
      const marks = [], boxes = [];
      if (i === 0 || o.marksAll) for (const [spec, label, what] of (o.marks || [])) {
        try { const l = loc(spec); if (!(await l.count())) continue; const bb = await l.boundingBox(); if (!bb || bb.width < 6 || bb.y + bb.height < 0 || bb.y > 800 || bb.x > 1430) continue; marks.push({ n: marks.length + 1, label, what }); boxes.push({ n: marks.length, x: bb.x, y: bb.y, w: bb.width, h: bb.height }); } catch { /* not on screen */ }
      }
      if (boxes.length) await p.evaluate((bx) => { const d = document.createElement('div'); d.id = '__marks'; d.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99999'; for (const q of bx) { const r = document.createElement('div'); r.style.cssText = `position:absolute;left:${q.x - 4}px;top:${q.y - 4}px;width:${q.w + 8}px;height:${q.h + 8}px;border:3px solid #ea580c;border-radius:9px;background:rgba(234,88,12,.10)`; const n = document.createElement('div'); n.textContent = q.n; n.style.cssText = 'position:absolute;left:-13px;top:-15px;width:26px;height:26px;border-radius:50%;background:#ea580c;color:#fff;font:700 15px sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.4)'; r.appendChild(n); d.appendChild(r); } document.body.appendChild(d); }, boxes);
      const sid = ys.length > 1 ? `${id}-${i + 1}` : id; const f = path.join(OUT, 'slides', sid + '.png'); await p.screenshot({ path: f });
      await p.evaluate(() => document.getElementById('__marks')?.remove());
      slides.push({ id: sid, title, file: f, say: i === 0 ? o.say : o.say2?.[i - 1] || '', marks, explain: o.explain?.[i] || '' }); log('slide', sid, marks.length + '/' + (o.marks || []).length);
    }
    await p.evaluate(() => window.scrollTo(0, 0)); fs.writeFileSync(path.join(OUT, 'slides.json'), JSON.stringify(slides, null, 1));
  };
  const M = JSON.parse(fs.readFileSync(path.join(__dirname, 'howto-spec.json'), 'utf8'));
  const S = (id, o = {}) => slide(id, M[id].title, { ...M[id], ...o });

  if (process.env.BRD_ONLY) {   // recapture only the BRD pages from a saved project (LS=<localstorage.json>), no AI calls
    const ls = JSON.parse(fs.readFileSync(process.env.LS, 'utf8')); await p.evaluate((d) => { for (const [k, v] of Object.entries(d)) { try { localStorage.setItem(k, v); } catch {} } }, ls); await p.reload(); await sleep(3000);
    await step('brd', async () => { await click(/BRD & Product Spec/); await p.getByText('Official Business Requirements Document', { exact: false }).first().waitFor({ timeout: 60000 }); await sleep(2500); });
    await S('brd', { ys: [0, 800] });
    for (const id of ['brd-overview', 'brd-approach', 'brd-personas', 'brd-screens', 'brd-rules', 'brd-data', 'brd-integrations', 'brd-governance', 'brd-tests']) await step(id, async () => { await click(new RegExp(esc(M[id].tab))); await sleep(2200); }).then(() => S(id));
    log('DONE'); await b.close(); return;
  }
  await step('start', async () => { const nb = p.locator('input[placeholder^="e.g. priya"]'); if (await nb.count()) { await nb.fill('Vineeth'); await p.keyboard.press('Enter'); await sleep(600); } });
  await S('overview');
  await step('fill', async () => { await p.locator('input[placeholder^="e.g. Unified"]').fill('Spares Management'); await p.locator('input[placeholder^="e.g. Commercial"]').fill('After-Sales Service'); await p.locator('textarea[placeholder^="Any specific context"]').fill(REQ); await sleep(600); await p.getByText('PRODUCT INITIATIVE').first().scrollIntoViewIfNeeded().catch(() => {}); });
  await S('create', { ys: [650] });
  await step('understand', async () => { await click(/Understand Business/i); await btn(/Proceed to Product Definition/).waitFor({ timeout: 900000 }); await sleep(3000); });
  await S('understanding', { ys: [0, 650, 1300] });
  await step('brd', async () => { await click(/Proceed to Product Definition/); await p.getByText('Official Business Requirements Document', { exact: false }).first().waitFor({ timeout: 900000 }); await sleep(2500); });
  await S('brd', { ys: [0, 800] });
  for (const id of ['brd-overview', 'brd-approach', 'brd-fitgap', 'brd-personas', 'brd-screens', 'brd-rules', 'brd-data', 'brd-integrations', 'brd-governance', 'brd-tests']) {
    if (!M[id]) continue; await step(id, async () => { await click(new RegExp(esc(M[id].tab))); await sleep(2200); }); await S(id);
  }
  await step('approve', async () => { await click(/Approve BRD & Build Prototype/); await sleep(1800); }); await S('approved');
  await step('proto', async () => { await click(/Interactive Prototype/); await sleep(2500); });
  await S('prototype-intro');
  await step('design', async () => { await click(/Design tools/); await sleep(800); });
  await S('design-tools');
  await step('design-run', async () => { await click(/Design with AI|Redesign with AI/); await sleep(5000); await p.waitForFunction(() => !/Screens made by the offline engine/.test(document.body.innerText), null, { timeout: 1500000 }); log('prototype designed by AI'); await sleep(3000); await click(/Design tools/).catch(() => {}); await sleep(600); });
  await S('prototype');
  const names = await p.evaluate(() => { const out = [], seen = new Set(); for (const el of document.querySelectorAll('button, a, div[role=button], li')) { const r = el.getBoundingClientRect(); const t = (el.textContent || '').trim().replace(/\s+/g, ' '); if (r.left < 40 && r.width > 150 && r.width < 340 && r.top > 150 && t.length > 4 && t.length < 90 && !seen.has(t)) { seen.add(t); out.push(t); } } return out; });
  log('menu', names.length);
  let n = 0; for (const t of names.slice(0, 8)) { try { await p.getByText(t, { exact: true }).first().click({ timeout: 4000 }); await sleep(1500); } catch { continue; } n++; if (M['proto-' + n]) await S('proto-' + n, { title: M['proto-' + n].title + ': ' + t }); }
  await step('role', async () => { const sel = p.locator('select').first(); const opts = await sel.locator('option').allTextContents(); if (opts.length > 2) { await sel.selectOption({ index: opts.length - 1 }); await sleep(1500); } }); await S('role-switch');
  await step('change', async () => { await click(/Request Change/); await sleep(1200); }); await S('change-open');
  await step('change-run', async () => { await p.locator('textarea').last().fill('Add a vendor warranty check before a part is issued for a vehicle that is still under warranty.'); await click(/Analyze Impact/); await p.getByText('Synthesized Impact Matrix').first().waitFor({ timeout: 300000 }); await sleep(1500); }); await S('change-result');
  await step('change-close', async () => { await btn(/Cancel \/ Dismiss|Close|Dismiss/).click().catch(() => p.keyboard.press('Escape')); await sleep(800); });
  await step('blueprint', async () => { await click(/Service Blueprint/); await sleep(2000); }); await S('blueprint');
  await step('qa', async () => { await click(/Use Cases & QA/); await sleep(3000); await p.waitForFunction(() => !/Writing|Generating|Drafting/i.test(document.body.innerText), null, { timeout: 900000 }).catch(() => {}); await sleep(2500); }); await S('qa');
  for (const id of ['qa-matrix', 'qa-cases', 'qa-bdd']) await step(id, async () => { await click(new RegExp(esc(M[id].tab))); await sleep(1200); }).then(() => S(id));
  await step('eng', async () => { await click(/Interactive Prototype/); await sleep(2500); await click(/Engineering Pkg/); await p.getByText('Autonomous Engineering Handoff').first().waitFor({ timeout: 900000 }); await sleep(3000); }); await S('eng');
  await step('prop', async () => { await click(/Proposal & SOW/); await sleep(2500); }); await S('prop-scope');
  await step('prop-confirm', async () => { await p.getByPlaceholder('Approved by (name, role)').fill('Service Head and Business Sponsor'); await p.getByPlaceholder('Approved on (date)').fill('7 Nov 2026'); await click(/Confirm this is the BU-approved scope/); await sleep(1200); }); await S('prop-confirmed');
  for (const [id, t] of [['prop-effort', '2\\. Effort'], ['prop-cost', '3\\. Cost'], ['prop-rasic', '4\\. RASIC'], ['prop-doc', '5\\. Proposal']]) await step(id, async () => { await click(new RegExp(t)); await sleep(1500); if (id === 'prop-doc') { await click(/Write with AI|Rewrite with AI/); await p.getByText('Writing…').first().waitFor({ timeout: 20000 }).catch(() => {}); await p.getByText('Writing…').first().waitFor({ state: 'detached', timeout: 900000 }).catch(() => {}); await sleep(2500); } }).then(() => S(id));
  await step('usage', async () => { await p.evaluate(() => window.scrollTo(0, 0)); await click(/AI tokens/); await sleep(1200); }); await S('usage');
  fs.writeFileSync(path.join(OUT, 'localstorage.json'), JSON.stringify(await p.evaluate(() => Object.fromEntries(Object.entries(localStorage)))));
  log('DONE'); await b.close();
})().catch((e) => { console.log('FATAL', e.message); process.exit(1); });
