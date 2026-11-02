/**
 * One command for the whole tour: drive the running app, read the numbers, build the HTML.
 *   npm run dev            (in another terminal; add the AI key to .env first for the AI version, then TOUR_AI=1)
 *   npm run demo:tour
 * Writes demo-tour/out/tour.html (stand-alone) and tour.page.html (for publishing as a page).
 */
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const OUT = path.resolve(process.env.TOUR_OUT || 'demo-tour/out');
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', env: { ...process.env, TOUR_OUT: OUT } });
run('node', [path.join(__dirname, 'capture.cjs')]);
const m = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
const project = m.downloads.find((d) => d.kind === 'project');
if (!project) throw new Error('The capture did not produce the project backup file.');
run('npx', ['tsx', path.join(__dirname, 'facts.ts'), path.join(OUT, 'downloads', project.file), path.join(OUT, 'facts.json')]);
run('node', [path.join(__dirname, 'build.cjs')]);
