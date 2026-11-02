/**
 * Builds the guided tour from what capture.cjs recorded: ONE self-contained HTML file (images, pins, documents, even a working
 * prototype are inside it), plus a variant for publishing as a page. Mobile-first layout; light and dark themes.
 *   node scripts/demo-tour/build.cjs     (reads TOUR_OUT, default ./demo-tour/out; writes tour.html and tour.page.html next to it)
 */
const fs = require('fs'), path = require('path');
const OUT = path.resolve(process.env.TOUR_OUT || 'demo-tour/out');
const M = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
const F = JSON.parse(fs.readFileSync(path.join(OUT, 'facts.json'), 'utf8'));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const b64 = (rel) => 'data:image/webp;base64,' + fs.readFileSync(path.join(OUT, rel)).toString('base64');
const kb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB');
const AI = !!M.ai;

const CHAPTERS = [
  { id: 'start', label: 'Start', step: 'Step 1 of 9', title: 'Upload the material', intro: `Everything begins with the material the business already has. In this walkthrough that is one short requirement note from HR Operations and the HR business partners: a five-stage joiner process, five rules, four measures and five systems. The requirement is realistic in shape and fictional in detail, and every name and figure on screen is sample data.` },
  { id: 'understand', label: 'Understand', step: 'Step 2 of 9', title: 'Understanding the business', intro: 'The note is read once and written back as a structured business understanding. What the business said is kept apart from what the factory proposed, and whatever it cannot settle becomes a question for the right team.' },
  { id: 'brd', label: 'The BRD', step: 'Step 3 of 9', title: 'A requirements document the business can sign', intro: `One click turns the understanding into a full Business Requirements Document of twelve sections. The same content is shown as tabs, can be copied as text, and leaves the tool as a Word file.` },
  { id: 'fitgap', label: 'SAP fit-gap', step: 'Step 3 of 9 · SAP projects', title: 'How SAP meets each requirement', intro: 'This chapter appears when the initiative is a package implementation. It answers the question a CHRO and an SAP lead ask first: how much of this is standard SuccessFactors, how much is configuration, and how much has to be built?' },
  { id: 'prototype', label: 'Prototype', step: 'Step 4 of 9', title: 'A working application, not a picture', intro: 'Approving the BRD unlocks the prototype: the requirements as an application the business can click through, with its own menu, roles, workflow and rules. This is the part that gets reactions in the room.' },
  { id: 'blueprint', label: 'Blueprint', step: 'Step 5 of 9', title: 'The service blueprint', intro: 'The journey is drawn layer by layer, from what the user does to the rules applied behind the screen.' },
  { id: 'change', label: 'Change', step: 'Step 6 of 9', title: 'Change control in the room', intro: 'In every demo someone says “can we also…”. The factory turns that sentence into an impact analysis before anything is promised.' },
  { id: 'qa', label: 'Tests', step: 'Step 7 of 9', title: 'Tests written from the same requirements', intro: 'Because every rule, journey and record is already written down, the test suite follows from them. No rule can reach the delivery team without a test.' },
  { id: 'engineering', label: 'Engineering', step: 'Step 8 of 9', title: 'Hand-off to the delivery team', intro: 'The engineering package turns the BRD into what a delivery team needs to start: architecture, services, interfaces, quality targets and a backlog.' },
  { id: 'proposal', label: 'Proposal', step: 'Step 9 of 9', title: 'Scope, effort, cost, RASIC and the proposal', intro: 'The second half of the factory prices and proposes exactly the scope the business approved. For an SAP project the effort follows the fit-gap: workshops, configuration by process area, development by object type, interfaces, migration and cutover.' },
  { id: 'docs', label: 'Documents', step: 'What you take away', title: 'The documents, as real Word files', intro: 'Everything the factory writes can leave the tool as a Word file. There are two packs. The BU pack goes to the business and has nothing commercial in it. The team pack adds the test suite, the engineering plan and the proposal with effort, team and RASIC.' },
  { id: 'phone', label: 'On a phone', step: 'Mobile', title: 'Review it on a phone', intro: 'Reviewers rarely sit at a laptop. The exported prototype is one file that opens on a phone with no install and no network, with a menu, search and the same workflow. The factory itself is a working tool for a laptop.' },
  { id: 'control', label: 'Control', step: 'Behind the scenes', title: 'Control, cost and safety', intro: 'A team can use the factory every day without a surprise bill or a surprise answer.' },
  { id: 'anyclient', label: 'Any client', step: 'Reuse', title: 'The same tool for any client and any platform', intro: 'Nothing in the factory is specific to HR or to SAP. The platform is whatever the business analyst types, and the rest of the pack follows from it.' },
];
const ORDER = ['start', 'understand', 'brd', 'fitgap', 'prototype', 'blueprint', 'change', 'qa', 'engineering', 'proposal', 'docs', 'phone', 'control', 'anyclient'];
CHAPTERS.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
const shotsOf = (ch) => M.shots.filter((s) => s.chapter === ch && !s.phone);

function stage(s, extra = '') {
  const pins = s.pins.map((p) => `<button type="button" class="pin" style="left:${p.x}%;top:${p.y}%;width:${p.w}%;height:${p.h}%" data-n="${p.n}" aria-label="${p.n}. ${esc(p.label)}"><b>${p.n}</b></button>`).join('');
  return `<div class="stage${extra}"><img src="${b64(s.file)}" alt="${esc(s.title)}" width="1440" height="900" decoding="async">${pins}</div>`;
}
function stepCard(s, i) {
  const legend = s.pins.length ? `<ol class="legend">${s.pins.map((p) => `<li data-n="${p.n}" tabindex="0"><span class="num">${p.n}</span><span class="txt"><strong>${esc(p.label)}</strong><span>${esc(p.note)}</span></span></li>`).join('')}</ol>` : '';
  return `<article class="step" id="s-${s.id}" data-step>
  <h3>${esc(s.title)}</h3>
  <p class="lead">${esc(s.lead || '')}</p>
  <div class="split${s.pins.length ? '' : ' solo'}">
    <figure class="shot">${stage(s)}<button type="button" class="enlarge" data-zoom="${s.id}">Enlarge</button></figure>
    ${legend}
  </div>
  ${s.value ? `<p class="value"><span>Worth noticing</span>${esc(s.value)}</p>` : ''}
</article>`;
}

const docsByDoc = M.docs;
const docGallery = `<div class="gallery">${docsByDoc.map((d) => `<figure class="doc"><button type="button" class="docimg ${d.w > d.h ? 'land' : ''}" data-doczoom="${d.id}"><img src="${b64(d.file)}" alt="${esc(d.title)}" decoding="async"></button><figcaption><strong>${esc(d.title)}</strong><span>${esc(d.caption)}</span></figcaption></figure>`).join('')}</div>`;

const dl = (kind) => M.downloads.find((d) => d.kind === kind);
const dataUri = (d, mime) => `data:${mime};base64,` + fs.readFileSync(path.join(OUT, 'downloads', d.file)).toString('base64');
function packs(standalone) {
  const rows = [
    ['bu-pack', 'BU pack', 'For the business', 'application/zip', ['README', 'Prototype (one HTML file)', 'Business Requirements Document', 'Solution Approach Note', 'Review Sheet'], 'No costs, no effort, no schedule.'],
    ['word-pack', 'Team pack', 'For the delivery and commercial team', 'application/zip', ['README', 'Business Requirements Document', 'Solution Approach Note', 'Review Sheet', 'Test Suite', 'Engineering Plan', 'Proposal / SOW'], 'Includes effort, team, RASIC and fee. Internal.'],
  ];
  return `<div class="packs">${rows.map(([kind, name, who, mime, files, note]) => { const d = dl(kind); return `<div class="pack"><h4>${name}</h4><p class="who">${who}</p><ul>${files.map((f) => `<li>${f}</li>`).join('')}</ul><p class="note">${note}</p>${d && standalone ? `<a class="btn" download="${esc(d.file)}" href="${dataUri(d, mime)}">Download this sample (${kb(d.size)})</a>` : d ? `<p class="size">${esc(d.file)} (${kb(d.size)})</p>` : ''}</div>`; }).join('')}</div>`;
}

const pipeline = [
  ['1', 'Upload', 'start', 'Any messy material', 'Business'],
  ['2', 'Understand', 'understand', 'Structured understanding, two sets of questions', 'Business'],
  ['3', 'BRD', 'brd', 'Requirements document, approach note, SAP fit-gap', 'Business, leadership'],
  ['4', 'Prototype', 'prototype', 'Clickable application, exported file', 'Business'],
  ['5', 'Blueprint', 'blueprint', 'Journey by layer', 'Business, design'],
  ['6', 'Change', 'change', 'Impact analysis, version history', 'Business, BA'],
  ['7', 'Tests', 'qa', 'Use cases, scenarios, test cases, feature file', 'QA'],
  ['8', 'Engineering', 'engineering', 'Architecture, APIs, backlog, SQL', 'Delivery'],
  ['9', 'Proposal', 'proposal', 'Scope, effort, cost, RASIC, SOW', 'Commercial'],
];
const fitPct = (n) => Math.round((n / F.fit.total) * 100);

const faqs = [
  ['Where does our data go?', 'The browser only talks to the factory’s own server. When an AI is connected, the server sends the text of the uploaded material to the AI provider you configure (Google Vertex AI or Anthropic) and the provider key stays on the server, never in the browser. With no key, nothing leaves the machine: the built-in engine answers.'],
  ['Who wrote this: the AI or rules?', 'Every AI step says who answered: the AI and which model, a saved earlier answer, or the built-in engine. If the AI is busy, the step keeps the previous result and offers Retry. It never silently falls back.'],
  ['Can the business change its mind?', 'Yes. Unknown items are marked, the BRD stays a draft until sign-off, and change requests go through impact analysis. The proposal is priced from the scope the business approved, so cuts and additions flow into effort and cost.'],
  ['How accurate is the SAP fit-gap?', 'It is a first view for the fit-gap workshops, not a replacement for them. With an AI connected it uses the model’s knowledge of the platform and marks every uncertain fit “to be confirmed”. A SAP consultant confirms each row.'],
  ['What does it cost to run?', 'A typical initiative uses a few AI clicks per step. Usage is counted per person and per project, with limits per button and a monthly budget. A repeated request is answered from a saved copy at no cost.'],
  ['Is the estimate a quote?', 'No. It is a high-level estimate for a proposal, built from the scope and your own day rates. Delivery teams size the work in the design phase.'],
  ['Can we keep the work?', 'Yes. Export saves the whole project as one file and Import loads it again on another machine. The Word documents are yours to edit.'],
];

const css = `
/* Layout: guided-tour reader. A chapter rail on the left (a sheet on phones); each screen is a card with the real screenshot beside its numbered call-outs.
   Colour: cool paper, navy ink, the app's own indigo for actions, amber only for call-out pins. Type: Bricolage Grotesque for headlines, IBM Plex for text and figures. */
:root{--bg:#f4f6fa;--surface:#ffffff;--surface2:#eef1f7;--ink:#0d1b2e;--muted:#56657a;--line:#d9e0ea;--accent:#4338ca;--accent-ink:#ffffff;--accent-soft:#e8e7fb;--pin:#e0690b;--pin-ink:#ffffff;--good:#0f7a4f;--shadow:0 1px 2px rgba(13,27,46,.06),0 8px 24px rgba(13,27,46,.07);--r:14px;
--f-display:'Bricolage Grotesque','Segoe UI',system-ui,sans-serif;--f-body:'IBM Plex Sans','Segoe UI',system-ui,sans-serif;--f-mono:'IBM Plex Mono',ui-monospace,Consolas,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0a111d;--surface:#111b2c;--surface2:#16233a;--ink:#e8eef8;--muted:#9fb0c7;--line:#243551;--accent:#8b86ff;--accent-ink:#0a111d;--accent-soft:#1d2250;--pin:#ff8a2a;--pin-ink:#1b0e00;--good:#46d19a;--shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px rgba(0,0,0,.35);color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0a111d;--surface:#111b2c;--surface2:#16233a;--ink:#e8eef8;--muted:#9fb0c7;--line:#243551;--accent:#8b86ff;--accent-ink:#0a111d;--accent-soft:#1d2250;--pin:#ff8a2a;--pin-ink:#1b0e00;--good:#46d19a;--shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px rgba(0,0,0,.35);color-scheme:dark}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:76px}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:40;background:var(--bg)}
body{background:var(--bg);color:var(--ink);font-family:var(--f-body);font-size:16px;line-height:1.6;padding-block:0;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));margin:0}
a{color:var(--accent)}
h1,h2,h3,h4{font-family:var(--f-display);line-height:1.12;margin:0;text-wrap:balance;letter-spacing:-.01em}
p{margin:0}
.wrap{max-width:1180px;margin-inline:auto}
button{font:inherit;color:inherit;cursor:pointer}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px;border-radius:6px}
/* top bar */
.bar{position:sticky;top:env(safe-area-inset-top,0px);z-index:30;margin-inline:calc(-1*max(16px,env(safe-area-inset-left,0px)));padding:10px max(16px,env(safe-area-inset-right,0px)) 10px max(16px,env(safe-area-inset-left,0px));background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.bar .wrap{display:flex;align-items:center;gap:12px}
.brand{font-family:var(--f-display);font-weight:700;font-size:17px;white-space:nowrap}
.brand small{font-family:var(--f-body);font-weight:500;color:var(--muted);font-size:13px;margin-left:8px}
.sp{flex:1}
.pill{border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:7px 14px;font-size:14px;font-weight:500}
.pill.primary{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.prog{position:absolute;left:0;bottom:-1px;height:3px;background:var(--accent);width:0}
/* hero */
.hero{padding-block:clamp(36px,7vw,84px) clamp(24px,4vw,44px)}
.eyebrow{font-family:var(--f-mono);font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.hero h1{font-size:clamp(34px,5.2vw,58px);margin-top:14px;max-width:18ch}
.hero .sub{font-size:clamp(17px,2.2vw,21px);color:var(--muted);max-width:60ch;margin-top:18px}
.cta{display:flex;flex-wrap:wrap;gap:10px;margin-top:26px}
.btn{display:inline-block;border:1px solid var(--accent);background:var(--accent);color:var(--accent-ink);border-radius:10px;padding:11px 18px;font-weight:600;text-decoration:none}
.btn.ghost{background:transparent;color:var(--accent)}
.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;margin-top:34px}
.facts div{background:var(--surface);padding:16px 18px}
.facts b{display:block;font-family:var(--f-display);font-size:30px;line-height:1;font-variant-numeric:tabular-nums}
.facts span{display:block;font-size:13px;color:var(--muted);margin-top:6px}
.honest{margin-top:22px;border:1px solid var(--line);background:var(--surface);border-radius:var(--r);padding:14px 18px;font-size:14px;color:var(--muted);max-width:78ch}
.honest strong{color:var(--ink)}
@media (max-width:640px){.facts{grid-template-columns:repeat(2,1fr)}.brand small{display:none}.pill{padding:6px 12px}.bar .wrap{gap:8px}}
.herogrid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:clamp(24px,4vw,56px);align-items:center}
.heroshot{margin:0;border:1px solid var(--line);border-radius:var(--r);overflow:hidden;box-shadow:var(--shadow);background:#fff;line-height:0}
.heroshot img{width:100%;height:auto;display:block}
.heroshot figcaption{line-height:1.4;padding:10px 14px;font-size:13px;color:var(--muted);background:var(--surface);border-top:1px solid var(--line)}
@media (max-width:900px){.herogrid{grid-template-columns:minmax(0,1fr)}}
/* layout */
.layout{display:grid;grid-template-columns:230px minmax(0,1fr);gap:clamp(20px,3vw,44px);align-items:start}
.rail{position:sticky;top:calc(64px + env(safe-area-inset-top,0px));max-height:calc(100vh - 80px);overflow:auto;padding-block:8px 24px}
.rail h4{font-size:12px;font-family:var(--f-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}
.rail a{display:flex;gap:10px;padding:7px 10px;border-radius:8px;text-decoration:none;color:var(--muted);font-size:14.5px;line-height:1.3}
.rail a i{font-style:normal;font-family:var(--f-mono);font-size:12px;width:20px;flex:none;padding-top:2px}
.rail a:hover{background:var(--surface2);color:var(--ink)}
.rail a.on{background:var(--accent-soft);color:var(--ink);font-weight:600}
@media (max-width:900px){.layout{grid-template-columns:minmax(0,1fr)}.rail{display:none}}
.sheet{position:fixed;inset:0;z-index:60;background:rgba(5,10,20,.55);display:none}
.sheet.open{display:block}
.sheet nav{position:absolute;left:0;right:0;bottom:0;max-height:78vh;overflow:auto;background:var(--surface);border-radius:18px 18px 0 0;padding:18px max(16px,env(safe-area-inset-left,0px)) calc(24px + env(safe-area-inset-bottom,0px))}
.sheet a{display:flex;gap:12px;padding:12px 6px;border-bottom:1px solid var(--line);text-decoration:none;color:var(--ink)}
.sheet a i{font-style:normal;font-family:var(--f-mono);color:var(--muted);width:24px}
/* overview */
.sec{padding-block:clamp(30px,5vw,60px) 0}
.sec > h2{font-size:clamp(26px,4vw,40px)}
.sec > .intro{color:var(--muted);max-width:68ch;margin-top:12px;font-size:17px}
.flow{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-top:22px;padding:0;list-style:none}
.flow li a{display:block;height:100%;text-decoration:none;color:inherit;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:14px 16px}
.flow li a:hover{border-color:var(--accent)}
.flow b{font-family:var(--f-mono);font-size:12px;color:var(--accent)}
.flow strong{display:block;font-family:var(--f-display);font-size:19px;margin:4px 0 4px}
.flow span{display:block;font-size:13.5px;color:var(--muted)}
.flow em{display:block;font-style:normal;font-size:12px;margin-top:8px;color:var(--good);font-weight:600}
/* chapters */
.chapter{padding-block:clamp(40px,6vw,76px) 0}
.chead .kick{font-family:var(--f-mono);font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
.chead h2{font-size:clamp(28px,4.4vw,46px);margin-top:8px}
.chead p{color:var(--muted);max-width:70ch;margin-top:14px;font-size:17px}
.steps{display:grid;gap:22px;margin-top:26px}
.step{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:clamp(16px,2.4vw,28px);box-shadow:var(--shadow)}
.step h3{font-size:clamp(21px,2.6vw,28px)}
.step .lead{margin-top:10px;max-width:74ch}
.split{display:grid;grid-template-columns:minmax(0,1.85fr) minmax(250px,1fr);gap:22px;margin-top:18px;align-items:start}
.split.solo{grid-template-columns:minmax(0,1fr)}
@media (max-width:1000px){.split{grid-template-columns:minmax(0,1fr)}}
.shot{margin:0;position:relative}
@media (min-width:1001px){.split>.shot{position:sticky;top:78px}}
.stage{position:relative;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff;line-height:0}
.stage img{width:100%;height:auto;display:block}
.pin{position:absolute;border:2px solid var(--pin);border-radius:6px;background:color-mix(in srgb,var(--pin) 9%,transparent);padding:0;transition:opacity .15s,box-shadow .15s}
.pin b{position:absolute;left:-9px;top:-9px;min-width:20px;height:20px;border-radius:999px;background:var(--pin);color:var(--pin-ink);font:700 11.5px/20px var(--f-body);text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.35)}
.stage.focus .pin:not(.on){opacity:.18}
.pin.on{box-shadow:0 0 0 4px color-mix(in srgb,var(--pin) 35%,transparent);background:color-mix(in srgb,var(--pin) 18%,transparent)}
.enlarge{position:absolute;right:10px;bottom:10px;background:rgba(13,27,46,.86);color:#fff;border:0;border-radius:8px;padding:6px 12px;font-size:13px;font-weight:500;line-height:1.4}
.legend{margin:0;padding:0;list-style:none;display:grid;gap:4px}
.legend li{display:flex;gap:10px;padding:8px 10px;border-radius:10px;border:1px solid transparent;font-size:14.5px;line-height:1.45}
.legend li:hover,.legend li.on{background:var(--surface2);border-color:var(--line)}
.legend .num{flex:none;width:22px;height:22px;border-radius:999px;background:var(--pin);color:var(--pin-ink);font:700 12px/22px var(--f-body);text-align:center;margin-top:1px}
.legend .txt{display:flex;flex-direction:column;min-width:0}
.legend .txt span{color:var(--muted)}
.value{margin-top:16px;padding:12px 16px;background:var(--accent-soft);border-radius:10px;font-size:15px;max-width:78ch}
.value span{display:block;font-family:var(--f-mono);font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin-bottom:2px}
/* documents */
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:18px;margin-top:24px}
.doc{margin:0;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;display:flex;flex-direction:column}
.docimg{border:0;background:#fff;padding:0;aspect-ratio:3/4;overflow:hidden;display:block;line-height:0;border-bottom:1px solid var(--line)}
.docimg.land{aspect-ratio:4/3}
.docimg img{width:100%;height:100%;object-fit:cover;object-position:top}
.doc figcaption{padding:12px 14px 16px;display:flex;flex-direction:column;gap:4px;font-size:14px}
.doc figcaption span{color:var(--muted)}
.packs{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px;margin-top:24px}
.pack{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:18px 20px}
.pack h4{font-size:22px}
.pack .who{color:var(--accent);font-weight:600;font-size:14px;margin:2px 0 8px}
.pack ul{margin:0 0 10px;padding-left:20px}
.pack .note{font-size:14px;color:var(--muted);margin-bottom:12px}
.pack .size{font-size:13px;color:var(--muted);font-family:var(--f-mono)}
/* phones */
.phones{display:flex;flex-wrap:wrap;gap:28px;justify-content:center;margin-top:26px}
.phone{width:min(280px,100%);text-align:center}
.phone .frame{border:9px solid #0d1b2e;border-radius:34px;overflow:hidden;background:#fff;line-height:0;box-shadow:var(--shadow)}
.phone img{width:100%;height:auto}
.phone p{margin-top:12px;font-size:14px;color:var(--muted)}
.tryit{margin-top:22px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:16px}
.tryit iframe{width:100%;height:min(70vh,640px);border:1px solid var(--line);border-radius:10px;background:#fff;margin-top:12px}
/* tables, faq */
.tbl{overflow-x:auto;margin-top:22px;border:1px solid var(--line);border-radius:var(--r);background:var(--surface)}
.tbl table{border-collapse:collapse;width:100%;min-width:620px;font-size:14.5px}
.tbl th,.tbl td{text-align:left;padding:11px 14px;border-bottom:1px solid var(--line);vertical-align:top}
.tbl th{font-family:var(--f-mono);font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);background:var(--surface2)}
.tbl tr:last-child td{border-bottom:0}
details.q{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:0 16px;margin-top:10px}
details.q summary{padding:14px 0;font-weight:600;cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:12px}
details.q summary::after{content:'+';color:var(--accent);font-size:20px;line-height:1}
details.q[open] summary::after{content:'\\2212'}
details.q p{padding:0 0 16px;color:var(--muted);max-width:76ch}
.steps3{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:22px;counter-reset:n}
.steps3 div{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;counter-increment:n}
.steps3 div::before{content:counter(n);display:inline-grid;place-items:center;width:28px;height:28px;border-radius:999px;background:var(--accent);color:var(--accent-ink);font:700 14px var(--f-body);margin-bottom:8px}
.steps3 strong{display:block;font-family:var(--f-display);font-size:18px;margin-bottom:4px}
.steps3 span{color:var(--muted);font-size:14.5px}
footer{margin-top:70px;padding-block:28px calc(40px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--line);color:var(--muted);font-size:13.5px}
/* lightbox and present mode */
.lb{position:fixed;inset:0;z-index:80;background:rgba(5,10,20,.88);display:none;flex-direction:column}
.lb.open{display:flex}
.lb header{display:flex;align-items:center;gap:12px;padding:12px max(16px,env(safe-area-inset-left,0px));padding-top:calc(12px + env(safe-area-inset-top,0px));color:#fff}
.lb header strong{flex:1;font-family:var(--f-display);font-size:17px}
.lb .body{flex:1;overflow:auto;padding:0 max(12px,env(safe-area-inset-left,0px)) calc(20px + env(safe-area-inset-bottom,0px));-webkit-overflow-scrolling:touch}
.lb .zoom{margin-inline:auto;width:max(100%,980px);max-width:1600px}
.lb .zoom.doc1{width:max(100%,720px);max-width:900px}
.lb .stage,.lb .zoom>img{border-radius:8px}
.lb .zoom>img{width:100%;height:auto;background:#fff;display:block}
.lb .pill{background:#fff;color:#0d1b2e}
.bottom{position:fixed;left:0;right:0;bottom:0;z-index:50;display:none;align-items:center;gap:10px;padding:10px max(16px,env(safe-area-inset-left,0px)) calc(10px + env(safe-area-inset-bottom,0px));background:var(--surface);border-top:1px solid var(--line)}
.bottom .cnt{flex:1;text-align:center;font-size:14px;color:var(--muted);font-variant-numeric:tabular-nums}
body.present{padding-bottom:70px}
body.present .bottom{display:flex}
body.present .hero,body.present .rail,body.present .sec.over,body.present .chead,body.present .after,body.present footer{display:none}
body.present .layout{grid-template-columns:minmax(0,1fr)}
body.present .chapter{padding:0}
body.present .chapter .steps{margin:0}
body.present .step{display:none;margin-top:18px}
body.present .step.cur{display:block}
body.present .chapter:not(.hasCur){display:none}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}.pin{transition:none}}
`;

const js = `
(function(){
  var $=function(s,r){return (r||document).querySelector(s)}, $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
  // pins <-> legend
  function focusPin(step,n,on){var st=$('.stage',step);if(!st)return;$$('.pin',st).forEach(function(p){p.classList.toggle('on',on&&p.getAttribute('data-n')===String(n))});$$('.legend li',step).forEach(function(l){l.classList.toggle('on',on&&l.getAttribute('data-n')===String(n))});st.classList.toggle('focus',on)}
  $$('.step').forEach(function(step){
    $$('.legend li',step).forEach(function(li){var n=li.getAttribute('data-n');['mouseenter','focus'].forEach(function(e){li.addEventListener(e,function(){focusPin(step,n,true)})});['mouseleave','blur'].forEach(function(e){li.addEventListener(e,function(){focusPin(step,n,false)})});li.addEventListener('click',function(){var on=li.classList.contains('on');focusPin(step,n,!on)})});
    $$('.pin',step).forEach(function(p){var n=p.getAttribute('data-n');p.addEventListener('click',function(ev){ev.stopPropagation();var on=p.classList.contains('on');focusPin(step,n,!on);var li=$('.legend li[data-n="'+n+'"]',step);if(li&&!on)li.scrollIntoView({block:'nearest',behavior:'smooth'})});p.addEventListener('mouseenter',function(){focusPin(step,n,true)});p.addEventListener('mouseleave',function(){focusPin(step,n,false)})});
  });
  // lightbox
  var lb=$('#lb'),lbBody=$('#lbBody'),lbTitle=$('#lbTitle');
  function openLb(title,node,cls){lbTitle.textContent=title;lbBody.innerHTML='';var z=document.createElement('div');z.className='zoom '+(cls||'');z.appendChild(node);lbBody.appendChild(z);lb.classList.add('open');document.body.style.overflow='hidden';lb.focus();lbBody.scrollTop=0}
  function closeLb(){lb.classList.remove('open');document.body.style.overflow=''}
  $('#lbClose').addEventListener('click',closeLb);
  document.addEventListener('keydown',function(e){if(e.key==='Escape'){if(lb.classList.contains('open'))closeLb();else if(document.body.classList.contains('present'))present(false)}});
  $$('[data-zoom]').forEach(function(b){b.addEventListener('click',function(){var step=b.closest('.step');var st=$('.stage',step).cloneNode(true);st.classList.remove('focus');$$('.pin',st).forEach(function(p){p.classList.remove('on')});openLb($('h3',step).textContent,st)})});
  $$('.stage img').forEach(function(im){im.addEventListener('click',function(){var b=im.closest('.shot').querySelector('[data-zoom]');if(b)b.click()})});
  $$('[data-doczoom]').forEach(function(b){b.addEventListener('click',function(){var im=$('img',b).cloneNode(true);im.removeAttribute('loading');openLb($('strong',b.closest('.doc')).textContent,im,'doc1')})});
  // chapter sheet (phones)
  var sheet=$('#sheet');$('#chaptersBtn').addEventListener('click',function(){sheet.classList.add('open')});sheet.addEventListener('click',function(e){if(e.target===sheet||e.target.closest('a'))sheet.classList.remove('open')});
  // progress and current chapter
  var chs=$$('.chapter'),links=$$('.rail a'),prog=$('#prog');
  function onScroll(){var h=document.documentElement.scrollHeight-innerHeight;prog.style.width=(h>0?Math.min(100,scrollY/h*100):0)+'%';var cur=null;chs.forEach(function(c){if(c.getBoundingClientRect().top<innerHeight*0.35)cur=c});links.forEach(function(a){a.classList.toggle('on',!!cur&&a.getAttribute('href')==='#'+cur.id)})}
  addEventListener('scroll',onScroll,{passive:true});onScroll();
  // present mode: one screen at a time, arrows to move
  var steps=$$('.step'),idx=0;
  function show(i){idx=Math.max(0,Math.min(steps.length-1,i));steps.forEach(function(s,k){s.classList.toggle('cur',k===idx)});chs.forEach(function(c){c.classList.toggle('hasCur',c.contains(steps[idx]))});$('#cnt').textContent=(idx+1)+' / '+steps.length+'  '+$('h3',steps[idx]).textContent;scrollTo(0,0)}
  function present(on){var best=0;if(on)steps.forEach(function(s,k){if(s.getBoundingClientRect().top<innerHeight*0.5)best=k});document.body.classList.toggle('present',on);if(on){show(best);var el=document.documentElement;if(el.requestFullscreen)el.requestFullscreen().catch(function(){})}else{steps.forEach(function(s){s.classList.remove('cur')});chs.forEach(function(c){c.classList.remove('hasCur')});if(document.fullscreenElement&&document.exitFullscreen)document.exitFullscreen().catch(function(){})}}
  $('#presentBtn').addEventListener('click',function(){present(!document.body.classList.contains('present'))});
  $('#prev').addEventListener('click',function(){show(idx-1)});$('#next').addEventListener('click',function(){show(idx+1)});$('#exit').addEventListener('click',function(){present(false)});
  document.addEventListener('keydown',function(e){if(!document.body.classList.contains('present')||lb.classList.contains('open'))return;if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' '){e.preventDefault();show(idx+1)}else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();show(idx-1)}});
  // optional live prototype (only in the stand-alone file)
  var tb=$('#tryBtn');if(tb){tb.addEventListener('click',function(){var src=$('#protoSrc');var f=document.createElement('iframe');f.setAttribute('title','The exported prototype');f.setAttribute('sandbox','allow-scripts allow-forms');var bin=atob(src.textContent.trim()),u=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);f.srcdoc=new TextDecoder('utf-8').decode(u);tb.replaceWith(f)})}
})();
`;

function body(standalone) {
  const protoFile = dl('prototype');
  const protoHtml = standalone && protoFile ? fs.readFileSync(path.join(OUT, 'downloads', protoFile.file)).toString('base64') : '';
  const chapterHtml = CHAPTERS.map((c, i) => {
    const num = String(i + 1).padStart(2, '0');
    const head = `<header class="chead"><div class="kick">${esc(c.step)}</div><h2>${esc(c.title)}</h2><p>${esc(c.intro)}</p></header>`;
    let inner = '';
    if (c.id === 'docs') {
      inner = `${packs(standalone)}${docGallery}<div class="steps3"><div><strong>Open in Word</strong><span>These are real .docx files. Edit them, add your logo, send them.</span></div><div><strong>Nothing hidden</strong><span>Items the factory proposed are marked "Proposed: please confirm" so nobody mistakes a proposal for a decision.</span></div><div><strong>Answerable</strong><span>The Review Sheet has an empty column for every question, so the business can reply in the file itself.</span></div></div>`;
      if (standalone && protoHtml) inner += `<div class="tryit"><strong>Try the real exported prototype</strong><p style="color:var(--muted);font-size:14.5px;margin-top:4px">This is the exact file the BU receives, running inside this page. Pick a role, open a joiner, move it to the next stage.</p><button type="button" class="btn" id="tryBtn" style="margin-top:12px">Load the prototype here</button><script type="text/plain" id="protoSrc">${protoHtml}</script></div>`;
    } else if (c.id === 'phone') {
      const ph = M.shots.filter((s) => s.phone);
      inner = `<div class="phones">${ph.map((s) => `<figure class="phone" style="margin:0"><div class="frame"><img src="${b64(s.file)}" alt="${esc(s.title)}" decoding="async"></div><p><strong style="color:var(--ink)">${esc(s.title)}</strong><br>${esc(s.lead || '')}</p></figure>`).join('')}</div>
      <div class="steps3"><div><strong>Send one file</strong><span>The exported prototype is a single .html file. Email it or put it on a shared drive; it opens in the phone's browser.</span></div><div><strong>Same workflow</strong><span>Roles, work queues, joiner documents and stage buttons all work on a phone.</span></div><div><strong>This tour too</strong><span>You are reading it on whatever device you have: tap Enlarge on any screenshot, and tap a numbered marker to see what it points at.</span></div></div>`;
    } else if (c.id === 'control') {
      const sh = shotsOf('control').map(stepCard).join('');
      inner = `<div class="steps">${sh}</div><div class="after" style="margin-top:26px">${faqs.map(([q, a]) => `<details class="q"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>`;
    } else if (c.id === 'anyclient') {
      inner = `<div class="steps3"><div><strong>New initiative</strong><span>Name it, give the business unit, and choose New application or Package implementation.</span></div><div><strong>Type the platform</strong><span>SAP S/4HANA, SuccessFactors, Oracle, Salesforce, ServiceNow or anything else. Nothing else changes.</span></div><div><strong>Drop in the material</strong><span>Notes, emails, Word, Excel, PDF, slides. Messy is fine.</span></div><div><strong>Click through the nine steps</strong><span>Review what is proposed, then send the BU pack.</span></div></div>
      <div class="tbl"><table><thead><tr><th>Requirement</th><th>Delivery type</th><th>What the pack looks like</th></tr></thead><tbody>
      <tr><td>Joiner onboarding (this tour)</td><td>Package: SAP SuccessFactors</td><td>${F.fit.total}-row fit-gap, ${F.screens}-screen prototype, ${F.testCases} test cases, interfaces and migration sized in the estimate.</td></tr>
      <tr><td>Purchase to pay</td><td>Package: SAP S/4HANA</td><td>Fit-gap by process area, vendor and open-order migration, interfaces to suppliers and banks.</td></tr>
      <tr><td>Customer service desk</td><td>Package: ServiceNow, Salesforce or Dynamics</td><td>Standard workflow and configuration first; development only for real gaps.</td></tr>
      <tr><td>Dealer or field application</td><td>New application</td><td>AI-designed prototype after research on comparable apps, engineering plan and API contracts from scratch, no fit-gap.</td></tr>
      <tr><td>Anything else</td><td>Either</td><td>The factory has no built-in industry knowledge: every name comes from the material you give it.</td></tr>
      </tbody></table></div>
      <div class="honest" style="margin-top:22px"><strong>What this walkthrough is.</strong> It was recorded from the live application on ${esc(new Date(M.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))}. ${AI ? 'An AI model wrote the content you see, as it does for any real initiative.' : 'No AI key was attached for this recording, so the built-in rules engine produced the content. With an AI connected, the BRD, fit-gap, tests, engineering plan and proposal wording are written by the model for the specific requirement, and are richer and more specific.'} Names, figures and people on screen are sample data. The effort is a high-level estimate for a proposal, built from the scope and illustrative day rates.</div>`;
    } else {
      inner = `<div class="steps">${shotsOf(c.id).map(stepCard).join('')}</div>`;
    }
    return `<section class="chapter" id="${'c-' + c.id}">${head}${inner}</section>`;
  }).join('');
  const rail = CHAPTERS.map((c, i) => `<a href="#c-${c.id}"><i>${String(i + 1).padStart(2, '0')}</i><span>${esc(c.label)}</span></a>`).join('');
  const sheetLinks = CHAPTERS.map((c, i) => `<a href="#c-${c.id}"><i>${String(i + 1).padStart(2, '0')}</i><span>${esc(c.title)}</span></a>`).join('');
  const pipe = `<ul class="flow">${pipeline.map(([n, t, id, out, who]) => `<li><a href="#c-${id}"><b>STEP ${n}</b><strong>${t}</strong><span>${out}</span><em>${who}</em></a></li>`).join('')}</ul>`;
  const stat = (n, l) => `<div><b>${n}</b><span>${l}</span></div>`;
  return `<div class="bar"><div class="wrap"><span class="brand">AI Product Factory<small>guided tour</small></span><span class="sp"></span><button type="button" class="pill" id="chaptersBtn">Chapters</button><button type="button" class="pill primary" id="presentBtn">Present</button></div><div class="prog" id="prog"></div></div>
<div class="wrap">
<section class="hero">
  <div class="herogrid"><div>
  <div class="eyebrow">${esc(F.unit)} · ${esc(F.platform)} · guided tour</div>
  <h1>One requirement note in. An approved SAP plan out.</h1>
  <p class="sub">Follow a single HR requirement, ${esc(F.product)}, through the factory from a page of notes to a working prototype, an SAP fit-gap, a test suite, an engineering plan and a priced proposal. Every screen below is the real application.</p>
  <div class="cta"><a class="btn" href="#c-start">Start the tour</a><a class="btn ghost" href="#c-docs">Jump to the documents</a></div>
  </div>${(() => { const s = M.shots.find((x) => x.id === 'proto-dashboard'); return s ? `<figure class="heroshot"><img src="${b64(s.file)}" alt="The prototype's command centre for HR leadership" width="1440" height="900"><figcaption>The command centre of the prototype, generated from the note. Chapter 5 shows every screen.</figcaption></figure>` : ''; })()}</div>
  <div class="facts">${stat('1', 'page of notes in')}${stat(F.personas, 'roles identified')}${stat(F.screens, 'prototype screens')}${stat(F.rules, 'business rules, each tested')}${stat(F.fit.total, 'SAP fit-gap rows')}${stat(F.testCases, 'test cases')}${stat(F.effort.days, `person-days, ${F.effort.months.toFixed(1)} person-months`)}${stat('~' + F.effort.weeks, 'weeks indicative duration')}</div>
  <div class="honest"><strong>How this was recorded.</strong> ${AI ? 'The factory ran with an AI connected, so the BRD, fit-gap, tests, engineering plan and proposal wording were written by the model for this requirement.' : 'The factory ran with no AI key attached, so its built-in rules engine produced the content. Every screen, button and document is the real application. With Gemini or Claude connected, the BRD, fit-gap, tests, engineering plan and proposal wording are written by the model for the specific requirement and are richer.'} A SAP consultant confirms every fit-gap row either way. Names and figures are sample data.</div>
</section>
<section class="sec over"><h2>The nine steps</h2><p class="intro">The same nine steps run for every initiative. Pick any step to jump to it, or press Present for a slide-by-slide walk-through with the arrow keys. On every screenshot, the orange numbered boxes mark a component: tap or hover a number to see what it is, and press Enlarge to zoom in.</p>${pipe}
<div class="tbl"><table><thead><tr><th>Audience</th><th>What they get</th></tr></thead><tbody><tr><td>CHRO and HR leadership</td><td>The understanding, the approach note and the prototype to react to, in plain language, with every proposed item marked.</td></tr><tr><td>BU and HR operations</td><td>The BRD and review sheet in Word, with a column for every answer.</td></tr><tr><td>SAP and delivery team</td><td>The fit-gap, test suite, engineering plan and backlog.</td></tr><tr><td>Commercial team</td><td>Scope, effort in days and person-months, team, RASIC and the proposal.</td></tr></tbody></table></div></section>
<div class="layout" style="margin-top:10px"><aside class="rail"><h4>Chapters</h4>${rail}</aside><main>${chapterHtml}
<footer>Recorded from the live AI Product Factory on ${esc(new Date(M.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))}. Sample data throughout. Rates and effort are illustrative.</footer></main></div>
</div>
<div class="sheet" id="sheet"><nav aria-label="Chapters"><h4 style="margin-bottom:6px">Chapters</h4>${sheetLinks}</nav></div>
<div class="lb" id="lb" tabindex="-1" role="dialog" aria-modal="true" aria-label="Enlarged view"><header><strong id="lbTitle"></strong><button type="button" class="pill" id="lbClose">Close</button></header><div class="body" id="lbBody"></div></div>
<div class="bottom"><button type="button" class="pill" id="prev">Back</button><span class="cnt" id="cnt"></span><button type="button" class="pill primary" id="next">Next</button><button type="button" class="pill" id="exit">Exit</button></div>`;
}

const fonts = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">';
const title = 'AI Product Factory Tour';
const page = (standalone) => `<title>${title}</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n${fonts}\n<style>${css}</style>\n${body(standalone)}\n<script>${js}</script>\n`;
// the stand-alone file needs head/body split: build it properly
const sa = page(true);
const titleTag = `<title>${title}</title>`;
const head = sa.slice(sa.indexOf(fonts), sa.indexOf('</style>') + 8);
const bodyPart = sa.slice(sa.indexOf('</style>') + 8);
fs.writeFileSync(path.join(OUT, 'tour.html'), `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${titleTag}\n<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}[hidden]{display:none!important}img{max-width:100%}</style>\n${head}\n</head>\n<body>${bodyPart}</body>\n</html>\n`);
fs.writeFileSync(path.join(OUT, 'tour.page.html'), page(false));
for (const f of ['tour.html', 'tour.page.html']) console.log(f, kb(fs.statSync(path.join(OUT, f)).size));
