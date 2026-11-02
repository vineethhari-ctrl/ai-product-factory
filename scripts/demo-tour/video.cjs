/**
 * Phone-sized demo video from the recorded project: opens the real app on a phone-size screen with the saved project, walks the nine steps,
 * then the exported prototype, and joins the pictures with captions into an MP4. No AI calls: everything is already in the project.
 *   node scripts/demo-tour/video.cjs      (reads TOUR_OUT, writes TOUR_OUT/demo-phone.mp4)
 */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const OUT = path.resolve(process.env.TOUR_OUT || 'demo-tour/out');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const dir = path.join(OUT, 'video'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const m = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
const facts = JSON.parse(fs.readFileSync(path.join(OUT, 'facts.json'), 'utf8'));
const proto = m.downloads.find((d) => d.kind === 'prototype');
const ls = JSON.parse(fs.readFileSync(path.join(OUT, 'localstorage.json'), 'utf8'));
const sh = (c, a) => execFileSync(c, a, { stdio: ['ignore', 'pipe', 'inherit'] });
const FONT = 'DejaVu-Sans-Bold', FONT2 = 'DejaVu-Sans';

const step = (name) => async (p) => { const b = p.getByRole('button', { name: new RegExp(name) }).filter({ visible: true }).first(); await b.scrollIntoViewIfNeeded(); await b.click(); await sleep(1800); };
const tab = (name) => async (p) => { const b = p.getByRole('button', { name: new RegExp(name) }).filter({ visible: true }).first(); await b.scrollIntoViewIfNeeded(); await b.click(); await sleep(1500); await b.scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, 200)); await sleep(500); };
const scrollText = (t, dy = -90) => async (p) => { await p.getByText(t).filter({ visible: true }).first().evaluate((el, d) => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, d); }, dy); await sleep(500); };
const app = [
  ['Start with the business’s own words', 'Upload notes, emails, Word or Excel. Choose New application or a package such as SAP.', step('Upload Material')],
  ['The factory reads it back', 'A structured understanding. What the business said is kept apart from what was proposed.', step('Business Understanding')],
  ['Questions go to the right team', 'Business questions and technical questions are listed separately.', async (p) => { await scrollText('CLARIFICATIONS')(p); }],
  ['The requirements document', 'A full BRD in minutes, ready for the business to review.', step('BRD & Product Spec')],
  ['SAP fit-gap', 'Standard, configuration or development: how SAP meets each requirement.', tab('Fit-Gap')],
  ['Approach note for leadership', 'Problems, solution, choices, phases and risks.', tab('Solution Approach Note')],
  ['A working prototype', 'The requirements as an application the business can click through.', step('Interactive Prototype')],
  ['Open a record, move it on', 'Workflow follows the rules: only the legal next moves are offered.', async (p) => { await p.locator('tbody tr').first().tap().catch(() => p.locator('tbody tr').first().click()); await sleep(1200); }],
  ['Change control', 'Describe a change in plain words and see what it touches.', step('Change Impact')],
  ['Tests from the same requirements', 'Use cases, scenarios and test cases, every rule covered.', step('Use Cases & QA')],
  ['Hand-off to the delivery team', 'Architecture, interfaces, backlog, and every document as Word.', step('Engineering Package')],
  ['Scope, effort, cost and proposal', 'Priced from the scope the business approved: days, people, RASIC and the SOW.', step('Proposal & SOW')],
];
const NARR = [
  'AI Product Factory. One page of requirement notes in, an approved plan out. Here is the whole journey on a phone, for a SAP SuccessFactors joiner onboarding project.',
  'It starts with the business\u2019s own words: notes, emails, Word or Excel files. You choose a new application, or a package such as SAP.',
  'The factory reads it back as a structured understanding. What the business said is kept apart from what the AI proposed.',
  'Questions are split by audience. Business questions go to the business team. Technical questions go to the tech team.',
  'Next, a full requirements document, ready for the business to review and approve.',
  'For SAP, a fit gap shows for every requirement whether standard, configuration or development is needed.',
  'A short approach note for leadership: problems, solution, options, phases and risks.',
  'Then a working prototype the business can click through, built from the requirements.',
  'Open a record and move it on. Only the legal next steps are offered, following the business rules.',
  'When something changes, describe it in plain words and see what it touches.',
  'Tests are written from the same requirements. Every business rule is covered.',
  'The delivery team gets architecture, interfaces and a backlog, and every document as Word.',
  'Finally, scope, effort, cost and the proposal, priced from the scope the business approved.',
  'The prototype is also one file. Send it by email and it opens in any phone browser.',
  'The menu lists every screen, by module, in the order of the process.',
  'A record shows its status steps, field rules and workflow buttons.',
  'Real application, real documents. From one page of notes to a BRD, prototype, fit gap, tests, engineering plan and proposal.',
];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript((data) => { for (const [k, v] of Object.entries(data)) { try { localStorage.setItem(k, v); } catch { /* ignore */ } } }, ls);
  const p = await ctx.newPage();
  await p.addInitScript(() => { const s = document.createElement('style'); s.textContent = 'div.fixed.bottom-6.right-6{display:none!important}'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s)); });
  await p.goto(BASE); await sleep(2500);
  const frames = [];
  const snap = async (id, title, sub) => { const f = path.join(dir, id + '.png'); await p.screenshot({ path: f }); frames.push({ f, title, sub }); console.log('frame', id); };
  let i = 0;
  for (const [title, sub, act] of app) {
    try {
      const dismiss = p.locator('button[aria-label="Dismiss"]'); for (let k = 0; k < 3 && await dismiss.count(); k++) await dismiss.first().click({ timeout: 800 }).catch(() => {});
      await act(p); await sleep(600);
      await snap('app-' + String(++i).padStart(2, '0'), title, sub);
    } catch (e) { console.log('skip', title, String(e.message).split('\n')[0]); }
  }
  // the exported prototype, as the BU would open it on a phone
  const q = await ctx.newPage();
  const protoFile = path.join(OUT, 'downloads', proto.file);
  const psnap = async (id, title, sub) => { const f = path.join(dir, id + '.png'); await q.screenshot({ path: f }); frames.push({ f, title, sub }); console.log('frame', id); };
  await q.goto('file://' + protoFile); await sleep(1500); await psnap('proto-1', 'The prototype file on a phone', 'One file by email. Opens in the phone’s browser: no install, no network.');
  await q.touchscreen.tap(50, 129); await sleep(900); await psnap('proto-2', 'Menu by module', 'Every screen of the application, in the order of the process.');
  await q.keyboard.press('Escape'); await q.reload(); await sleep(1200); await q.locator('tbody tr').first().tap(); await sleep(1200); await psnap('proto-3', 'A record with its workflow', 'Status steps, field rules and the stage buttons, on the phone.');
  await b.close();

  // captions, then the film
  const W = 780, cap = (txt, size, color, h, font = FONT2) => sh('convert', ['-size', `${W - 120}x${h}`, '-background', 'none', '-fill', color, '-font', font, '-pointsize', String(size), '-gravity', 'West', `caption:${txt}`, 'png:-']);
  const parts = [];
  const card = (id, lines, bg = '#0d1b2e') => { const f = path.join(dir, id + '.png'); const args = ['-size', `${W}x1888`, `xc:${bg}`]; let y = 560; for (const [txt, size, color, font] of lines) { const png = path.join(dir, id + '-' + y + '.png'); fs.writeFileSync(png, cap(txt, size, color, size * 4, font)); args.push(png, '-gravity', 'NorthWest', '-geometry', `+60+${y}`, '-composite'); y += size * 3 + 30; } args.push(f); sh('convert', args); return f; };
  const title = card('title', [['AI Product Factory', 64, '#ffffff', FONT], [`One requirement note in. An approved ${facts.platform ? 'SAP' : ''} plan out.`, 44, '#c9d3e6', FONT2], [`${facts.product} · ${facts.unit}`, 34, '#8b86ff', FONT2]]);
  parts.push([title, 3.2]);
  for (const fr of frames) {
    const f = fr.f.replace('.png', '-c.png');
    const t = path.join(dir, 'cap-t.png'), s = path.join(dir, 'cap-s.png');
    fs.writeFileSync(t, cap(fr.title, 44, '#ffffff', 120, FONT)); fs.writeFileSync(s, cap(fr.sub, 30, '#c9d3e6', 150, FONT2));
    sh('convert', [fr.f, '-resize', 'x1500', '-background', '#0d1b2e', '-gravity', 'North', '-extent', `${W}x1888`, t, '-gravity', 'NorthWest', '-geometry', '+60+1530', '-composite', s, '-gravity', 'NorthWest', '-geometry', '+60+1625', '-composite', f]);
    parts.push([f, 3.4]);
  }
  const end = card('end', [['Real application. Real documents.', 56, '#ffffff', FONT], ['BRD, prototype, SAP fit-gap, tests, engineering plan and proposal, from one page of notes.', 38, '#c9d3e6', FONT2]]);
  parts.push([end, 3.2]);
  const wavs = [];
  parts.forEach(([f], i) => { const w = path.join(dir, 'n' + i + '.wav'); const txt = (NARR[i] || '').replace(/'/g, '\u2019').replace(/[:\\]/g, ' '); try { sh('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `flite=text='${txt}':voice=slt`, '-ar', '44100', '-ac', '1', w]); const d = parseFloat(sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', w]).toString()); parts[i][1] = Math.max(parts[i][1], d + 0.7); wavs.push(w); } catch (e) { wavs.push(null); } });
  fs.writeFileSync(path.join(OUT, 'narration.txt'), NARR.map((t, i) => (i + 1) + '. ' + t).join('\n\n') + '\n');
  const list = path.join(dir, 'list.txt');
  fs.writeFileSync(list, parts.map(([f, d]) => `file '${f}'\nduration ${d}`).join('\n') + `\nfile '${parts[parts.length - 1][0]}'\n`);
  const mp4 = path.join(OUT, 'demo-phone.mp4'); const silent = path.join(dir, 'silent.mp4');
  sh('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', 'fps=25,format=yuv420p,scale=780:1888', '-c:v', 'libx264', '-crf', '23', '-movflags', '+faststart', silent]);
  const alist = path.join(dir, 'a.txt'); const aud = path.join(dir, 'all.wav'); const pad = (d, w, i) => { const o = path.join(dir, 'p' + i + '.wav'); sh('ffmpeg', ['-y', '-loglevel', 'error', ...(w ? ['-i', w] : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono']), '-af', 'apad', '-t', String(d), '-ar', '44100', '-ac', '1', o]); return o; };
  fs.writeFileSync(alist, parts.map(([, d], i) => `file '${pad(d, wavs[i], i)}'`).join('\n'));
  sh('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', alist, '-c', 'copy', aud]);
  sh('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', aud, '-c:v', 'copy', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', mp4]);
  console.log('video', mp4, Math.round(fs.statSync(mp4).size / 1024), 'KB', parts.length, 'slides');
})();
