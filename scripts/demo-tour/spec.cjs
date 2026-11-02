/**
 * The tour's script: the requirement, the flow through the app, and for every screen what to say and which components to point at.
 * Targets: btn:Name  text:Words  css:selector  lbl:Label  ph:Placeholder  up:N:target (ancestor)  union:a||b  rect:x,y,w,h
 */
const path = require('path');
const MAT = path.resolve(__dirname, '../../demo-tour/materials');
const fs = require('fs');

const BRIEF = `Goal: Make every new joiner productive on day one and cut the time HR operations spend chasing documents, approvals and system access.
Journey: Offer Accepted → Pre-boarding → Day-1 Ready → First 90 Days → Confirmed
Who does what: Recruiters release the offer and hand over the candidate, HR operations verify documents and create the employee record, IT provisions laptops and accounts, hiring managers plan the first 90 days, employees complete their tasks, HR business partners confirm probation.
Stakeholders / parties: Recruiters, HR operations, IT service desk, hiring managers, new joiners, HR business partners, payroll team.
Pain points: Joining formalities run over email and spreadsheets; IT access is often not ready on day one; payroll gets joiner data late and corrects it later; nobody can see which joiners are stuck.
Rules: A joiner cannot be activated without verified documents; Cost centre and position must exist before the employee record is created; IT access requests are raised automatically when the employee record is created; Probation confirmation needs the hiring manager and the HR business partner; Joiner data sent to payroll cannot be changed without a recorded reason.
KPIs: Joiners fully ready on day one; Days from offer accepted to employee record; Joiner satisfaction at day 30; Payroll corrections per joiner.
Integrations: SAP SuccessFactors Recruiting, SAP S/4HANA cost centres and positions, Payroll, Identity and access management, E-signature.`;

const CSV = `Task,Owner,Done when,Common problem
Verify identity and education documents,HR Operations,All documents checked,Documents arrive in pieces over email
Create employee record,HR Operations,Record saved with cost centre and position,Cost centre not yet approved
Raise laptop and access request,IT Service Desk,Ticket closed,Raised late so access is not ready on day one
Share joiner data with payroll,Payroll Team,Data accepted,Corrected later after payroll runs
Plan first 90 days,Hiring Manager,Plan shared with joiner,No visibility for HR
Confirm probation,HR Business Partner,Confirmation letter issued,Reminders go by email and are missed
`;

const product = { name: 'Joiner Onboarding', unit: 'Human Resources', platform: 'SAP SuccessFactors Employee Central and Onboarding', person: 'Vineeth' };
const files = () => {
  fs.mkdirSync(MAT, { recursive: true });
  fs.writeFileSync(path.join(MAT, 'HR_Onboarding_Requirement_Note.txt'), `Joiner Onboarding: requirement note\nFrom HR Business Partners and HR Operations.\n\n${BRIEF.split('\n').join('\n\n')}\n`);
  return [path.join(MAT, 'HR_Onboarding_Requirement_Note.txt')];
};

const run = (name, fn) => ({ name, run: fn });
const S = (shot) => ({ shot });
const wait = (c, ms) => (c.AI ? ms * 6 : ms);
const clickBtn = async (p, name, opts = {}) => { const b = p.getByRole('button', { name }).filter({ visible: true }).first(); await b.waitFor({ timeout: opts.timeout ?? 30000 }); await b.click(); };

const flow = [];
const add = (...xs) => flow.push(...xs);

// ───────────────────────── 1. Start
add(run('start', async ({ p, sleep }) => {
  const nameBox = p.locator('input[placeholder^="e.g. priya"]');
  if (await nameBox.count()) { await nameBox.fill(product.person); await p.keyboard.press('Enter'); await sleep(600); }
  await p.locator('input[placeholder^="e.g. Unified"]').fill(product.name);
  await p.locator('input[placeholder^="e.g. Commercial"]').fill(product.unit);
  await p.getByRole('button', { name: /Package implementation/ }).click();
  await p.getByLabel('Platform').fill(product.platform);
  await p.locator('input[type=file][accept*="pdf"]').setInputFiles(files());
  await sleep(2500);
}));
add(S({
  id: 'create', chapter: 'start', scroll: 'text:PRODUCT INITIATIVE', offset: 150, title: 'Start with whatever the business already has',
  lead: 'Name the initiative, choose what is being delivered (here an SAP SuccessFactors implementation, not a new application) and drop in whatever exists: notes, emails, slides, Word, Excel or PDF. One short requirement note is the only input this whole walkthrough uses.',
  value: 'Nothing has to be tidy. The factory reads the files itself and says plainly if one could not be read. Even a one-line idea is enough to begin; documents make every later step sharper.',
  pins: [
    { at: 'rect:24,84,1400,34', label: 'Nine steps, one flow', note: 'Every initiative moves through the same nine steps, from raw material to a priced proposal. The step you are on is highlighted; finished steps show a tick.' },
    { at: 'union:ph:e.g. Unified||ph:e.g. Commercial', label: 'Name and business unit', note: 'Who this is for. It travels into every document the factory writes.' },
    { at: 'union:btn:New application||btn:Package implementation', label: 'What is being delivered', note: 'A new application built for the business, or a package platform the business has already chosen. This single choice changes the whole pack.' },
    { at: 'css:input[list="delivery-platforms"]', label: 'Any platform, in your words', note: 'Type SAP S/4HANA, SuccessFactors, Oracle, Salesforce, ServiceNow or anything else. The factory works from the name you type.' },
    { at: 'css:div.border-dashed', label: 'Drop the material here', note: 'Word, PowerPoint, Excel, PDF, text, CSV, screenshots. Messy is fine.' },
    { at: 'up:4:text:HR_Onboarding_Requirement_Note.txt', label: 'Each file is checked', note: 'You see whether it was read and how much text the AI will see. The eye icon shows exactly that text.' },
    { at: 'btn:Understand Business', label: 'One click', note: 'Reads everything and builds the business understanding.' },
    { at: 'btn:AI tokens', label: 'Your AI budget', note: 'Every AI click is counted per person and per project. More in the last chapter.' },
    { at: 'union:btnx:Export||btnx:Import||btn:New Initiative', label: 'Keep it, move it, restart', note: 'Export saves the whole project as one file, Import loads it again on another machine, New Initiative starts a clean one.' },
  ],
}));

// ───────────────────────── 2. Understanding
add(run('understand', async (c) => {
  const { p, sleep } = c; await clickBtn(p, /Understand Business/i);
  await p.getByText('Business Understanding', { exact: true }).first().waitFor({ timeout: 300000 }); await sleep(wait(c, 2500));
}));
add(S({
  id: 'understanding-top', chapter: 'understand', hideBanner: false, title: 'The factory reads it back to you',
  lead: 'In under a minute the factory turns the material into a structured picture: who is involved, what the product must do, which rules apply and what is still unclear. Everything the business said is marked CONFIRMED. Everything the factory proposed from how comparable organisations work is marked INFERRED, so a proposal can never pass as a decision.',
  value: 'This is the page the BU reads first: if the picture is wrong, it is cheap to correct here, before any document exists.',
  pins: [
    { at: 'text:No AI key is set up', label: 'Who answered, always shown', note: 'Every AI step says who answered: the AI (and which model), a saved earlier answer, or the built-in engine as here. If the AI is busy, this banner offers Retry.' },
    { at: 'up:2:text:Industry benchmark applied', label: 'Predicted, and labelled', note: 'When the input is thin, the factory fills gaps from how comparable organisations do it, and marks every such item so the business can confirm, correct or remove it.' },
    { at: 'text:sources analyzed', label: 'What it read', note: 'How many files were analysed.' },
    { at: 'up:2:text:SYNTHESIZED EXECUTIVE SUMMARY', label: 'Summary in plain English', note: 'Goal, process, who does what, today’s problems and how success is measured, rewritten from the business’s own words.' },
    { at: 'btn:Clarifications', label: 'Open questions', note: 'Everything the factory could not settle from the material, split by who must answer.' },
    { at: 'btn:Proceed to Product Definition', label: 'Next step', note: 'Generates the Business Requirements Document.' },
  ],
}));
add(S({
  id: 'understanding-questions', chapter: 'understand', scroll: 'text:CLARIFICATIONS: BU TEAM', offset: 130, title: 'Questions go to the right people',
  lead: 'The factory writes down what it could not decide. Business questions are in plain language for the BU team. Data, interface and security questions go to the BA and technical team. Each can be answered here or copied into an email.',
  value: 'Questions are never buried in a document. Each carries a severity, so the blockers are visible from day one.',
  pins: [
    { at: 'up:3:text:1. BU Clarifications', label: 'For the business', note: 'Business flow, rules, journeys and KPIs, with no technical words.' },
    { at: 'up:3:text:2. BA & Tech Team Concerns', label: 'For BA and technology', note: 'Data design, interfaces, architecture, security and limits.' },
    { at: 'text:HIGH: MISSING LOGIC', label: 'Severity tag', note: 'Blocker, High or Medium, with the reason: missing logic, contradiction, permission gap.' },
    { at: 'text:Answer / copy for email', label: 'Answer or send', note: 'Answer inline, or copy the whole list for the owner as an email.' },
    { at: 'text:Manage Q&A in Modal', label: 'Work through them', note: 'A focused pop-up to answer one by one.' },
  ],
}));
add(S({
  id: 'understanding-model', chapter: 'understand', scroll: 'text:IDENTIFIED PERSONAS', offset: 130, title: 'Roles, modules and screens it understood',
  lead: 'Below the questions the factory lists every role, product module and screen it identified, each with its confidence and its evidence line. The BA can open the evidence to see exactly which sentence of which file a item came from.',
  value: 'Traceability: nothing in the later documents is anonymous. You can always ask where an item came from.',
  pins: [
    { at: 'up:2:text:IDENTIFIED PERSONAS', label: 'Roles', note: 'Ten roles found: the ones named in the note plus operations lead, platform administrator and an independent auditor that comparable processes need.' },
    { at: 'up:2:text:PRODUCT MODULES', label: 'Modules', note: 'The process stages grouped into delivery modules.' },
    { at: 'up:2:text:IDENTIFIED SCREENS', label: 'Screens', note: 'The screens users will work in, derived from the process.' },
    { at: 'textx:INFERRED', label: 'Confidence badge', note: 'CONFIRMED, INFERRED, AMBIGUOUS or MISSING, on every item.' },
    { at: 'text:Evidence:', label: 'Evidence link', note: 'Click to see the source text behind an item.' },
  ],
}));

add(run('evidence-open', async ({ p, sleep }) => { await p.getByRole('button', { name: /Evidence:/ }).filter({ visible: true }).first().click(); await sleep(900); }));
add(S({ id: 'evidence-modal', chapter: 'understand', top: false, hideBanner: false }));
add(run('evidence-close', async ({ p, sleep }) => { await p.locator('button:has-text("Dismiss")').last().click(); await sleep(600); }));

// ───────────────────────── 3. BRD
add(run('to-brd', async (c) => { const { p, sleep } = c; await clickBtn(p, /Proceed to Product Definition/); await p.getByText('Official Business Requirements Document', { exact: false }).first().waitFor({ timeout: 600000 }); await sleep(wait(c, 2000)); }));
add(S({
  id: 'brd-top', chapter: 'brd', title: 'The Business Requirements Document, ready for review',
  lead: 'One click turns the understanding into a formal BRD: objective, problems, scope, process, roles, journeys, screens, rules, data, integrations and quality targets. Every item still carries its confidence, so the BU can see at a glance what they said and what was proposed.',
  value: 'The BRD is a draft for sign-off, not a finished contract: the sign-off buttons make that explicit.',
  pins: [
    { at: 'text:Draft Specification', label: 'Status', note: 'Draft until the business signs off.' },
    { at: 'union:btnx:Edit||btnx:Approve', label: 'Actions', note: 'Edit the BRD, open the Approach Note or Test Suite, lock the baseline and notify the BU, or approve.' },
    { at: 'up:1:btn:Executive Overview', label: 'One BRD, many views', note: 'Executive overview, solution approach, the SAP fit-gap, personas, screens, rules, data, integrations, governance, versions and tests.' },
    { at: 'btn:Fit-Gap', label: 'SAP fit-gap tab', note: 'Appears because this is a package implementation. Chapter 4.' },
    { at: 'btn:Copy Full BRD to Clipboard', label: 'Copy it out', note: 'The whole document as text, for email or a ticket.' },
    { at: 'btn:Approve BRD & Build Prototype', label: 'Approve and build', note: 'Locks the baseline and unlocks the prototype.' },
  ],
}));
add(S({
  id: 'brd-body', chapter: 'brd', scroll: 'text:BUSINESS REQUIREMENTS DOCUMENT', offset: 150, title: 'It reads like a document, not a form',
  lead: 'The BRD opens with a numbered contents list and then runs section by section: executive summary, problem statement and success measures, scope and modules, process and lifecycle, roles and security access, journeys, requirements per screen, business rules, data dictionary, validations, integrations and non-functional requirements.',
  value: 'The BU’s own words are kept: goals, pain points, rules and KPIs from the note appear as written, marked as stated by the business.',
  pins: [
    { at: 'text:BUSINESS REQUIREMENTS DOCUMENT', label: 'Formal document', note: 'Version, date and a document ID.' },
    { at: 'up:2:text:Executive Summary & Business Objectives', label: 'Numbered contents', note: 'Twelve sections, so every reader finds their part.' },
  ],
}));

const tab = (id, name, extra = {}) => [
  run('tab-' + id, async ({ p, sleep }) => { await p.getByRole('button', { name }).filter({ visible: true }).first().click(); await sleep(1800); }),
  S({ id, chapter: extra.chapter || 'brd', scroll: 'btn:' + (extra.scrollBtn || name), offset: 140, ...extra.shot }),
];
add(...tab('brd-overview', 'Executive Overview'));
add(...tab('brd-approach', 'Solution Approach Note'));
add(...tab('fitgap-top', 'Fit-Gap', { chapter: 'fitgap', scrollBtn: 'Fit-Gap' }));
add(S({ id: 'fitgap-rows', chapter: 'fitgap', scroll: 'text:Development objects', offset: 150 }));
add(...tab('brd-personas', 'Personas & Journeys'));
add(...tab('brd-screens', 'Screens & UI Topology'));
add(...tab('brd-rules', 'Business Rules Engine'));
add(...tab('brd-data', 'Data Model & Fields'));
add(...tab('brd-integrations', 'Integrations & APIs'));
add(...tab('brd-governance', 'Governance & Risks'));
add(...tab('brd-tests', 'Use Cases & Tests'));

// ───────────────────────── 5. Approve, prototype
add(run('approve', async ({ p, sleep }) => { await clickBtn(p, /Approve BRD & Build Prototype/); await sleep(1500); }));
add(S({ id: 'approved', chapter: 'prototype' }));
add(run('launch', async (c) => { const { p, sleep } = c; await clickBtn(p, /Launch Prototype/); await p.getByText('Application view').first().waitFor({ timeout: 600000 }); await sleep(wait(c, 2500)); }));
add(S({ id: 'proto-app', chapter: 'prototype' }));
add(run('open-doc', async ({ p, sleep }) => { await p.locator('tbody tr').first().click(); await sleep(1200); }));
add(S({ id: 'proto-doc', chapter: 'prototype', scroll: 'text:Joiner Onboarding details', offset: 330 }));
add(run('screen-dashboard', async ({ p, sleep }) => { await p.getByText('Joiner Onboarding Command', { exact: false }).first().click(); await sleep(1500); }));
add(S({ id: 'proto-dashboard', chapter: 'prototype' }));
add(run('screen-360', async ({ p, sleep }) => { await p.getByText('Joiner Onboarding 360').first().click(); await sleep(1500); }));
add(S({ id: 'proto-360', chapter: 'prototype' }));
add(run('screen-form', async ({ p, sleep }) => { await p.getByText('New Offer Accepted').first().click(); await sleep(1500); }));
add(S({ id: 'proto-form', chapter: 'prototype' }));
add(run('form-invalid', async ({ p, sleep }) => {
  const tFld = p.getByLabel(/^Title/).first(); await tFld.fill('ab'); await tFld.blur();
  const eFld = p.getByLabel(/^Contact email/).first(); await eFld.fill('not-an-email'); await eFld.blur(); await sleep(700);
}));
add(S({ id: 'proto-form-error', chapter: 'prototype', scroll: 'text:Step 1', offset: 220 }));
add(run('role-switch', async ({ p, sleep }) => {
  const sel = p.getByRole('combobox').first(); const o = await sel.locator('option').allInnerTexts();
  await sel.selectOption({ label: o.find((t) => /Auditor/.test(t)) || o[o.length - 1] }); await sleep(1000);
  await p.getByText('Day-1 Ready', { exact: true }).first().click(); await sleep(800); await p.locator('tbody tr').first().click(); await sleep(1000);
}));
add(S({ id: 'proto-role', chapter: 'prototype', scroll: 'text:Joiner Onboarding details', offset: 330 }));
add(run('data-view', async ({ p, sleep }) => { await p.getByRole('button', { name: /Data & schema/ }).click(); await sleep(1200); }));
add(S({ id: 'proto-schema', chapter: 'prototype' }));
add(run('back-app', async ({ p, sleep }) => { await p.getByRole('button', { name: /Application view/ }).click(); await sleep(800); await p.getByRole('button', { name: /Design tools/ }).click(); await sleep(900); }));
add(S({ id: 'proto-design', chapter: 'prototype' }));
add(run('change', async ({ p, sleep }) => { await p.getByRole('button', { name: /Design tools/ }).click().catch(() => {}); await p.getByRole('button', { name: /Request Change/ }).first().click(); await sleep(1200); }));
add(S({ id: 'change-modal', chapter: 'change' }));
const step = (name) => run('goto-' + name, async ({ p, sleep }) => { await p.getByRole('button', { name: new RegExp(name) }).filter({ visible: true }).first().click(); await sleep(1800); });

// ───────────────────────── change impact
add(run('change-analyze', async (c) => {
  const { p, sleep } = c;
  await p.locator('textarea').last().fill('Add a background-verification vendor step before Pre-boarding, and let the hiring manager see the verification status on the joiner record.');
  await clickBtn(p, /Analyze Impact/); await p.getByText('Synthesized Impact Matrix').first().waitFor({ timeout: 300000 }); await sleep(wait(c, 1200));
}));
add(S({ id: 'change-result', chapter: 'change' }));
add(run('change-close', async ({ p, sleep }) => { await p.getByRole('button', { name: /Cancel \/ Dismiss|Close|Dismiss/ }).last().click().catch(() => p.keyboard.press('Escape')); await sleep(700); }));

// ───────────────────────── service blueprint
add(step('Service Blueprint'));
add(run('blueprint-sim', async ({ p, sleep }) => { for (let i = 0; i < 2; i++) { await p.getByRole('button', { name: /Simulate Step/ }).click(); await sleep(700); } }));
add(S({ id: 'blueprint', chapter: 'blueprint' }));
add(run('blueprint-kpi', async ({ p, sleep }) => { await p.getByRole('button', { name: /KPI Commitments/ }).click(); await sleep(900); }));
add(S({ id: 'blueprint-kpi', chapter: 'blueprint' }));

// ───────────────────────── QA
add(step('Use Cases & QA'));
add(S({ id: 'qa-top', chapter: 'qa' }));
add(run('qa-matrix', async ({ p, sleep }) => { await p.getByRole('button', { name: /Scenario Coverage Matrix/ }).click(); await sleep(900); }));
add(S({ id: 'qa-matrix', chapter: 'qa', scroll: 'btn:Scenario Coverage Matrix', offset: 130 }));
add(run('qa-cases', async ({ p, sleep }) => { await p.getByRole('button', { name: /Executable Test Cases/ }).click(); await sleep(900); }));
add(S({ id: 'qa-cases', chapter: 'qa', scroll: 'btn:Executable Test Cases', offset: 130 }));
add(run('qa-bdd', async ({ p, sleep }) => { await p.getByRole('button', { name: /Automated BDD Feature/ }).click(); await sleep(900); }));
add(S({ id: 'qa-bdd', chapter: 'qa', scroll: 'btn:Automated BDD Feature', offset: 130 }));

// ───────────────────────── engineering
add(step('Interactive Prototype'));
add(run('eng-open', async (c) => { const { p, sleep } = c; await clickBtn(p, /Engineering Pkg/); await p.getByText('Autonomous Engineering Handoff').first().waitFor({ timeout: 600000 }); await sleep(wait(c, 2500)); }));
add(S({ id: 'eng-top', chapter: 'engineering' }));
add(S({ id: 'eng-plan', chapter: 'engineering', scroll: 'text:Architecture', offset: 140 }));
add(run('eng-api-open', async ({ p, sleep }) => { const r = p.locator('text=/API contracts \\(/').filter({ visible: true }).first(); await r.scrollIntoViewIfNeeded(); await sleep(300); const row = r.locator('xpath=ancestor::*[contains(@class,"rounded")][1]').locator('tbody tr, [role=row], li').first(); if (await row.count()) await row.click().catch(() => {}); await sleep(600); }));
add(S({ id: 'eng-api', chapter: 'engineering', scroll: 'text:API contracts (', offset: 140 }));
add(S({ id: 'eng-backlog', chapter: 'engineering', scroll: 'text:Backlog (', offset: 140 }));

// ───────────────────────── proposal
add(step('Proposal & SOW'));
add(S({ id: 'prop-scope', chapter: 'proposal' }));
add(run('prop-confirm', async ({ p, sleep }) => {
  await p.getByPlaceholder('Approved by (name, role)').fill('CHRO and HR Business Partner lead'); await p.getByPlaceholder('Approved on (date)').fill('2 Nov 2026');
  await p.getByRole('button', { name: /Confirm this is the BU-approved scope/ }).scrollIntoViewIfNeeded(); await p.getByRole('button', { name: /Confirm this is the BU-approved scope/ }).click(); await sleep(900);
}));
add(S({ id: 'prop-confirmed', chapter: 'proposal', scroll: 'bottom' }));
add(run('prop-effort', async ({ p, sleep }) => { await p.getByRole('button', { name: /2\. Effort/ }).click(); await sleep(900); }));
add(S({ id: 'prop-effort', chapter: 'proposal', scroll: 'btn:2. Effort', offset: 150 }));
add(run('prop-cost', async ({ p, sleep }) => { await p.getByRole('button', { name: /3\. Cost/ }).click(); await sleep(900); }));
add(S({ id: 'prop-cost', chapter: 'proposal', scroll: 'btn:3. Cost', offset: 150 }));
add(run('prop-rasic', async ({ p, sleep }) => { await p.getByRole('button', { name: /4\. RASIC/ }).click(); await sleep(900); }));
add(S({ id: 'prop-rasic', chapter: 'proposal', scroll: 'btn:4. RASIC', offset: 150 }));
add(run('prop-doc', async ({ p, sleep }) => { await p.getByRole('button', { name: /5\. Proposal/ }).click(); await sleep(1200); }));
add(S({ id: 'prop-doc', chapter: 'proposal', scroll: 'btn:5. Proposal', offset: 150 }));

// ───────────────────────── governance
add(run('usage-open', async ({ p, sleep }) => { await p.evaluate(() => window.scrollTo(0, 0)); await p.getByRole('button', { name: /AI tokens/ }).click(); await sleep(1200); }));
add(S({ id: 'usage', chapter: 'control', top: false }));
add(run('usage-close', async ({ p, sleep }) => { await p.keyboard.press('Escape'); await p.mouse.click(700, 500).catch(() => {}); await sleep(500); }));

// ───────────────────────── downloads (the real files)
const download = (name, label, file) => run('dl-' + file, async (c) => {
  const { p, sleep, OUT, manifest } = c;
  await p.getByRole('button', { name: /Interactive Prototype/ }).filter({ visible: true }).first().click(); await sleep(1500);
  const btn = p.getByRole('button', { name }).filter({ visible: true }).first();
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 180000 }), btn.click()]);
  const dir = path.join(OUT, 'downloads'); fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, dl.suggestedFilename()); await dl.saveAs(target);
  manifest.downloads.push({ label, file: path.basename(target), size: fs.statSync(target).size, kind: file });
  await sleep(500);
});
add(download(/BU demo pack/, 'BU demo pack', 'bu-pack'));
add(download(/All docs \(Word\)/, 'All documents as Word', 'word-pack'));
add(download(/Export prototype/, 'Stand-alone prototype', 'prototype'));
add(run('dl-project', async (c) => {
  const { p, sleep, OUT, manifest } = c;
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.getByRole('button', { name: /^Export$/ }).first().click()]);
  const dir = path.join(OUT, 'downloads'); const target = path.join(dir, dl.suggestedFilename()); await dl.saveAs(target);
  manifest.downloads.push({ label: 'Project backup', file: path.basename(target), size: fs.statSync(target).size, kind: 'project' }); await sleep(300);
}));
add(run('state', async ({ p, OUT }) => { const st = await p.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage)))); fs.writeFileSync(path.join(OUT, 'localstorage.json'), st); }));

// ───────────────────────── the documents to show (page found by its text)
const docs = [
  { id: 'doc-brd', file: 'bu-2-Business-Requirements-Document.docx', match: /Business Requirements Document/, page: 1, title: 'Business Requirements Document', caption: 'Page 1: about this document, objective, problems, success measures, roles. Items the factory proposed are marked "Proposed: please confirm".' },
  { id: 'doc-brd-fitgap', file: 'bu-2-Business-Requirements-Document.docx', match: /meets the requirements \(fit-gap\)/, title: 'BRD: the SAP fit-gap', caption: 'The fit-gap is part of the BRD the BU receives. No effort or money in it.' },
  { id: 'doc-approach', file: 'bu-3-Solution-Approach-Note.docx', match: /Solution Approach Note/, page: 1, title: 'Solution Approach Note', caption: 'Summary, problems, solution, choices, phases, risks and the decisions the business must take.' },
  { id: 'doc-review', file: 'bu-4-Review-Sheet.docx', match: /Review Sheet/, page: 1, title: 'Review Sheet', caption: 'The sheet the BU fills in: numbered questions with an empty answer column, assumptions to confirm, and every proposed item with Keep, Change or Remove.' },
  { id: 'doc-tests', file: 'word-4-Test-Suite.docx', match: /Test Suite/, page: 1, title: 'Test Suite (Word)', caption: 'Use cases, scenarios and test cases with test data, for the QA team.' },
  { id: 'doc-tests-matrix', file: 'word-4-Test-Suite.docx', match: /Scenario matrix/, title: 'Test suite: scenario matrix', caption: 'Wide tables switch to landscape automatically.' },
  { id: 'doc-eng', file: 'word-5-Engineering-Plan.docx', match: /Engineering Plan/, page: 1, title: 'Engineering Plan (Word)', caption: 'Architecture, services, API contracts, events, quality targets, security, backlog, risks.' },
  { id: 'doc-prop', file: 'word-6-Proposal.docx', match: /Proposal/, page: 1, title: 'Proposal (Word)', caption: 'Summary, background, objectives, approach and deliverables for the approved scope.' },
  { id: 'doc-prop-months', file: 'word-6-Proposal.docx', match: /Effort in person-months/, title: 'Proposal: effort in person-months', caption: 'Effort by activity, functional and technical, in days and person-months.' },
  { id: 'doc-prop-team', file: 'word-6-Proposal.docx', match: /Team and cost/, title: 'Proposal: team and cost', caption: 'Days, rate and cost per role. The price is days times rate.' },
  { id: 'doc-prop-rasic', file: 'word-6-Proposal.docx', match: /Responsibility matrix \(RASIC\)/, title: 'Proposal: RASIC chart', caption: 'Who is responsible, accountable, supports, is consulted and informed for every activity.' },
];
const phone = [
  { id: 'phone-proto', open: 'prototype', title: 'The prototype opens on a phone', lead: 'One file, no install. Menu, search, role and work queue fit the screen.' },
  { id: 'phone-proto-menu', open: 'prototype', title: 'Menu by module', lead: 'The same screens, grouped by module, behind the menu button.', do: async ({ p, sleep }) => { await p.touchscreen.tap(50, 129); await sleep(900); } },
  { id: 'phone-proto-doc', open: 'prototype', title: 'A joiner, with its workflow', lead: 'Open a joiner and move it to the next stage, with the status steps and the rules, on the phone.', do: async ({ p, sleep }) => { await p.locator('tbody tr').first().tap(); await sleep(1000); await p.evaluate(() => window.scrollTo(0, 200)); await sleep(500); } },
];
module.exports = { product, BRIEF, flow, add, S, run, wait, clickBtn, files, docs, phone };
