/**
 * Spares Management walk-through on the real app with the real AI: one requirement line in, every page captured (desktop 16:9).
 *   TOUR_OUT=<dir> node scripts/demo-tour/spares.cjs     -> <dir>/slides/*.png and <dir>/slides.json (id, title, visible text)
 */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const OUT = path.resolve(process.env.TOUR_OUT || 'demo-tour/spares');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const REQ = process.env.REQ || 'Spares Management for the Service Centre: spare part requests raised by technicians go through stock check, approval, issue, return of the faulty part and replenishment, with reorder alerts and an audit trail.';
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(path.join(OUT, 'slides'), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const slides = [];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3 });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(BASE); await p.addStyleTag({ content: 'div.fixed.bottom-6.right-6{display:none!important}' }); await sleep(1500);
  const dismiss = async () => { const d = p.locator('button[aria-label="Dismiss"]'); for (let i = 0; i < 3 && await d.count(); i++) { await d.first().click({ timeout: 800 }).catch(() => {}); await sleep(150); } };
  const btn = (n) => p.getByRole('button', { name: n }).filter({ visible: true }).first();
  const click = async (n, t = 30000) => { const x = btn(n); await x.waitFor({ timeout: t }); await x.scrollIntoViewIfNeeded().catch(() => {}); await x.click(); };
  // slices: scroll positions in px; each makes one slide
  const shot = async (id, title, ys = [0]) => {
    await dismiss();
    for (let i = 0; i < ys.length; i++) {
      await p.evaluate((y) => window.scrollTo(0, y), ys[i]); await sleep(500);
      const sid = ys.length > 1 ? `${id}-${i + 1}` : id; const f = path.join(OUT, 'slides', sid + '.png');
      await p.screenshot({ path: f });
      const text = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 1400));
      slides.push({ id: sid, title, file: f, y: ys[i], text }); log('slide', sid);
    }
    await p.evaluate(() => window.scrollTo(0, 0));
    fs.writeFileSync(path.join(OUT, 'slides.json'), JSON.stringify(slides, null, 1));
  };
  const step = async (name, fn) => { try { await fn(); } catch (e) { log('ERR', name, String(e.message).split('\n')[0]); } };

  await step('start', async () => {
    const nb = p.locator('input[placeholder^="e.g. priya"]'); if (await nb.count()) { await nb.fill('Vineeth'); await p.keyboard.press('Enter'); await sleep(600); }
    await p.locator('input[placeholder^="e.g. Unified"]').fill('Spares Management');
    await p.locator('input[placeholder^="e.g. Commercial"]').fill('After-Sales Service');
    await p.locator('textarea[placeholder^="Any specific context"]').fill(REQ); await sleep(800);
  });
  await shot('create', 'Start with one line of requirement');
  await step('understand', async () => { await click(/Understand Business/i); await btn(/Proceed to Product Definition/).waitFor({ timeout: 900000 }); await sleep(3000); });
  await shot('understanding', 'The factory reads it back', [0, 700, 1400]);
  await step('brd', async () => { await click(/Proceed to Product Definition/); await p.getByText('Official Business Requirements Document', { exact: false }).first().waitFor({ timeout: 900000 }); await sleep(2500); });
  await shot('brd', 'The Business Requirements Document', [0, 800]);
  for (const [id, name, ys] of [['brd-overview', 'Executive Overview', [0, 700]], ['brd-approach', 'Solution Approach Note', [0, 800]], ['brd-personas', 'Personas & Journeys', [0, 800]], ['brd-screens', 'Screens & UI Topology', [0, 800]], ['brd-rules', 'Business Rules Engine', [0, 800]], ['brd-data', 'Data Model & Fields', [0, 900]], ['brd-integrations', 'Integrations & APIs', [0]], ['brd-governance', 'Governance & Risks', [0, 700]], ['brd-tests', 'Use Cases & Tests', [0, 800]]]) {
    await step(id, async () => { await click(new RegExp(name)); await sleep(2500); }); await shot(id, name, ys);
  }
  await step('approve', async () => { await click(/Approve BRD & Build Prototype/); await sleep(1800); });
  await shot('approved', 'Approve the BRD');
  await step('launch', async () => { await click(/Launch Prototype/); await p.getByText('Application view').first().waitFor({ timeout: 900000 }); await sleep(3000); });
  await shot('prototype', 'The working prototype', [0]);
  // walk the prototype's left menu
  await step('menu', async () => {
    const names = await p.evaluate(() => { const seen = new Set(); const out = []; for (const el of document.querySelectorAll('aside button, nav button')) { const t = (el.textContent || '').trim().replace(/\s+/g, ' '); const r = el.getBoundingClientRect(); if (t && t.length < 60 && r.left < 320 && r.width > 80 && !seen.has(t)) { seen.add(t); out.push(t); } } return out; });
    log('menu', JSON.stringify(names));
    let n = 0; for (const t of names) { if (n >= 7) break; try { await p.locator('aside button, nav button').filter({ hasText: t }).first().click({ timeout: 3000 }); await sleep(1500); await shot('proto-' + (++n), 'Prototype screen: ' + t, [0]); } catch { /* skip */ } }
  });
  await step('row', async () => { await p.locator('tbody tr').first().click({ timeout: 4000 }); await sleep(1200); await shot('proto-record', 'Open a record', [0, 600]); });
  await step('qa', async () => { await click(/Use Cases & QA/); await sleep(2500); }); await shot('qa', 'Use cases and QA', [0, 800]);
  for (const [id, name] of [['qa-matrix', 'Scenario Coverage Matrix'], ['qa-cases', 'Executable Test Cases'], ['qa-bdd', 'Automated BDD Feature']]) { await step(id, async () => { await click(new RegExp(name)); await sleep(1200); }); await shot(id, name, [0, 600]); }
  await step('eng', async () => { await click(/Interactive Prototype/); await sleep(1500); await click(/Engineering Pkg/); await p.getByText('Autonomous Engineering Handoff').first().waitFor({ timeout: 900000 }); await sleep(3000); });
  await shot('eng', 'Engineering package', [0, 800, 1600]);
  await step('prop', async () => { await click(/Proposal & SOW/); await sleep(2500); }); await shot('prop-scope', 'Approved scope', [0, 700]);
  await step('prop-confirm', async () => { await p.getByPlaceholder('Approved by (name, role)').fill('Service Head and Business Sponsor'); await p.getByPlaceholder('Approved on (date)').fill('7 Nov 2026'); await click(/Confirm this is the BU-approved scope/); await sleep(1200); });
  await shot('prop-confirmed', 'Scope confirmed by the business', [0, 700]);
  for (const [id, name] of [['prop-effort', '2\\. Effort'], ['prop-cost', '3\\. Cost'], ['prop-rasic', '4\\. RASIC'], ['prop-doc', '5\\. Proposal']]) { await step(id, async () => { await click(new RegExp(name)); await sleep(1500); if (id === 'prop-doc') { await click(/Write with AI/); await p.getByText('Writing…').first().waitFor({ timeout: 20000 }).catch(() => {}); await p.getByText('Writing…').first().waitFor({ state: 'detached', timeout: 900000 }).catch(() => {}); await sleep(2500); } }); await shot(id, name.replace('\\', ''), [0, 700]); }
  fs.writeFileSync(path.join(OUT, 'localstorage.json'), JSON.stringify(await p.evaluate(() => Object.fromEntries(Object.entries(localStorage)))));
  log('page errors', JSON.stringify(errs)); await b.close(); log('DONE');
})().catch((e) => { console.log('FATAL', e.message); process.exit(1); });
