/** Recaptures content pages scrolled to the content (tab bar at the top) from a saved project: LS=<localstorage.json> TOUR_OUT=<dir> node detail.cjs */
const fs = require('fs'), path = require('path'); const { chromium } = require('playwright');
const OUT = path.resolve(process.env.TOUR_OUT); fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3 });
  const ls = JSON.parse(fs.readFileSync(process.env.LS, 'utf8')); await ctx.addInitScript((d) => { for (const [k, v] of Object.entries(d)) { try { localStorage.setItem(k, v); } catch {} } }, ls);
  const p = await ctx.newPage(); await p.goto('http://localhost:3000'); await p.addStyleTag({ content: 'div.fixed.bottom-6.right-6{display:none!important}' }); await sleep(3000);
  const btn = (n) => p.getByRole('button', { name: n }).filter({ visible: true }).first();
  const dismiss = async () => { const d = p.locator('button[aria-label="Dismiss"]'); for (let i = 0; i < 3 && await d.count(); i++) { await d.first().click({ timeout: 800 }).catch(() => {}); await sleep(150); } };
  const shot = async (id, anchor, off = 170, extra = 0) => { await dismiss(); const el = btn(new RegExp(esc(anchor))); await el.scrollIntoViewIfNeeded().catch(() => {}); const top = await el.evaluate((e) => e.getBoundingClientRect().top); await p.evaluate((d) => window.scrollBy(0, d), top - off + extra); await sleep(500); await p.screenshot({ path: path.join(OUT, id + '.png') }); console.log('shot', id); await p.evaluate(() => window.scrollTo(0, 0)); };
  const step = async (n, f) => { try { await f(); } catch (e) { console.log('ERR', n, String(e.message).split('\n')[0]); } };
  await step('brd', async () => { await btn(/BRD & Product Spec/).click(); await p.getByText('Official Business Requirements Document', { exact: false }).first().waitFor({ timeout: 60000 }); await sleep(1500); });
  for (const [id, t] of [['d-brd-doc', 'BRD Document'], ['d-overview', 'Executive Overview'], ['d-approach', 'Solution Approach Note'], ['d-personas', 'Personas & Journeys'], ['d-screens', 'Screens & UI Topology'], ['d-rules', 'Business Rules Engine'], ['d-data', 'Data Model & Fields'], ['d-integrations', 'Integrations & APIs'], ['d-governance', 'Governance & Risks'], ['d-tests', 'Use Cases & Tests']]) {
    await step(id, async () => { await btn(new RegExp(esc(t))).click(); await sleep(2000); if (id === 'd-approach') { await p.waitForFunction(() => !/Writing…|The AI has not written it yet/.test(document.body.innerText), null, { timeout: 420000 }).catch(() => console.log('approach still writing')); await sleep(1500); } await shot(id, t); });
  }
  await step('qa', async () => { await btn(/Use Cases & QA/).click(); await sleep(3000); await p.waitForFunction(() => !/Writing|Generating|Drafting/i.test(document.body.innerText), null, { timeout: 900000 }).catch(() => {}); await sleep(2000); });
  await shot('d-qa-cases-top', 'Formal Use Cases', 130);
  for (const [id, t] of [['d-qa-matrix', 'Scenario Coverage Matrix'], ['d-qa-cases', 'Executable Test Cases'], ['d-qa-bdd', 'Automated BDD Feature']]) await step(id, async () => { await btn(new RegExp(esc(t))).click(); await sleep(1200); await shot(id, t, 130); });
  await step('eng', async () => { await btn(/Interactive Prototype/).click(); await sleep(2500); await btn(/Engineering Pkg/).click(); await p.getByText('Autonomous Engineering Handoff').first().waitFor({ timeout: 900000 }); await sleep(3000); });
  for (const [id, y] of [['d-eng-1', 700], ['d-eng-2', 1500], ['d-eng-3', 2300]]) await step(id, async () => { await p.evaluate((v) => window.scrollTo(0, v), y); await sleep(600); await p.screenshot({ path: path.join(OUT, id + '.png') }); console.log('shot', id); });
  await b.close(); console.log('DONE');
})().catch((e) => { console.log('FATAL', e.message); process.exit(1); });
