/** Continues the Spares walk-through from its saved project: AI prototype design, prototype screens, QA, engineering. Replaces those slides in slides.json. */
const fs = require('fs'), path = require('path'); const { chromium } = require('playwright');
const OUT = path.resolve(process.env.TOUR_OUT || 'demo-tour/spares'); const BASE = process.env.BASE_URL || 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const log = console.log;
const all = JSON.parse(fs.readFileSync(path.join(OUT, 'slides.json'), 'utf8'));
const ONLY_QA_ENG = process.env.ONLY_QA_ENG === '1';
const isOld = (id) => (ONLY_QA_ENG ? /^(qa|eng)/ : /^(prototype|proto-|qa|eng)/).test(id);
const slides = all.filter((s) => !isOld(s.id)); const ls = JSON.parse(fs.readFileSync(path.join(OUT, 'localstorage.json'), 'utf8'));
let order = all.map((s) => s.id.replace(/-\d+$/, ''));
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3 });
  await ctx.addInitScript((d) => { for (const [k, v] of Object.entries(d)) { try { localStorage.setItem(k, v); } catch {} } }, ls);
  const p = await ctx.newPage(); await p.goto(BASE); await p.addStyleTag({ content: 'div.fixed.bottom-6.right-6{display:none!important}' }); await sleep(2500);
  const btn = (n) => p.getByRole('button', { name: n }).filter({ visible: true }).first();
  const click = async (n, t = 30000) => { const x = btn(n); await x.waitFor({ timeout: t }); await x.scrollIntoViewEnabled; await x.scrollIntoViewIfNeeded().catch(() => {}); await x.click(); };
  const step = async (n, f) => { try { await f(); } catch (e) { log('ERR', n, String(e.message).split('\n')[0]); } };
  const dismiss = async () => { const d = p.locator('button[aria-label="Dismiss"]'); for (let i = 0; i < 3 && await d.count(); i++) { await d.first().click({ timeout: 800 }).catch(() => {}); await sleep(150); } };
  const shot = async (id, title, ys = [0]) => { await dismiss(); for (let i = 0; i < ys.length; i++) { await p.evaluate((y) => window.scrollTo(0, y), ys[i]); await sleep(500); const sid = ys.length > 1 ? `${id}-${i + 1}` : id; const f = path.join(OUT, 'slides', sid + '.png'); await p.screenshot({ path: f }); slides.push({ id: sid, title, file: f, y: ys[i], text: await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 1400)) }); log('slide', sid); } await p.evaluate(() => window.scrollTo(0, 0)); };
  // prototype: AI design
  if (!ONLY_QA_ENG) await step('proto', async () => { await click(/Interactive Prototype/); await sleep(2500); await click(/Design tools/); await sleep(800); await click(/Design with AI|Redesign with AI/); await p.getByText('AI is designing...').first().waitFor({ timeout: 60000 }).catch(() => {}); await p.getByText('AI is designing...').first().waitFor({ state: 'detached', timeout: 1500000 }); await sleep(3000); await click(/Design tools/).catch(() => {}); await sleep(600); });
  if (!ONLY_QA_ENG) await shot('prototype', 'The prototype, designed by the AI', [0]);
  if (!ONLY_QA_ENG) await step('menu', async () => {
    const names = await p.evaluate(() => { const out = [], seen = new Set(); for (const el of document.querySelectorAll('button, a, div[role=button], li')) { const r = el.getBoundingClientRect(); const t = (el.textContent || '').trim().replace(/\s+/g, ' '); if (r.left < 40 && r.width > 150 && r.width < 340 && r.top > 150 && t.length > 4 && t.length < 90 && !seen.has(t)) { seen.add(t); out.push(t); } } return out; });
    log('menu', JSON.stringify(names)); let n = 0;
    for (const t of names) { if (n >= 8) break; try { await p.getByText(t, { exact: true }).first().click({ timeout: 4000 }); await sleep(1500); await shot('proto-' + (++n), 'Prototype screen: ' + t, [0]); } catch {} }
  });
  if (!ONLY_QA_ENG) await step('row', async () => { await p.locator('tbody tr').first().click({ timeout: 5000 }); await sleep(1200); await shot('proto-record', 'Open a record and move it through the workflow', [0, 600]); });
  await step('qa', async () => { await click(/Use Cases & QA/); await sleep(3000); const g = btn(/Generate with AI/); if (await g.count()) { await g.click(); await sleep(3000); await p.waitForFunction(() => !/Writing|Generating|Drafting/i.test(document.body.innerText), null, { timeout: 900000 }).catch(() => {}); } await sleep(2500); });
  await shot('qa', 'Use cases and QA', [0, 800]);
  for (const [id, name] of [['qa-matrix', 'Scenario Coverage Matrix'], ['qa-cases', 'Executable Test Cases'], ['qa-bdd', 'Automated BDD Feature']]) { await step(id, async () => { await click(new RegExp(name)); await sleep(1200); }); await shot(id, name, [0, 600]); }
  await step('eng', async () => { await click(/Interactive Prototype/); await sleep(2500); await click(/Engineering Pkg/); await p.getByText('Autonomous Engineering Handoff').first().waitFor({ timeout: 2400000 }); await p.waitForFunction(() => !/Generating|Writing|Drafting/i.test(document.body.innerText), null, { timeout: 900000 }).catch(() => {}); await sleep(3000); });
  await shot('eng', 'Engineering package', [0, 800, 1600]);
  const rank = (id) => { const k = id.replace(/-\d+$/, ''); const i = order.indexOf(k); return i < 0 ? 999 : i; };
  const prop = slides.filter((s) => s.id.startsWith('prop')); const rest = slides.filter((s) => !s.id.startsWith('prop'));
  const first = rest.filter((s) => !/^(prototype|proto-|qa|eng)/.test(s.id)); const mid = rest.filter((s) => /^(prototype|proto-|qa|eng)/.test(s.id));
  fs.writeFileSync(path.join(OUT, 'slides.json'), JSON.stringify([...first, ...mid, ...prop], null, 1)); log('DONE'); await b.close();
})().catch((e) => { log('FATAL', e.message); process.exit(1); });
