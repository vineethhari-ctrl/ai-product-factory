/**
 * Builds the Spares demo videos from slides.json + narration.json ({ id: "text" }) with a natural local voice (Piper, no network at run time):
 *   laptop: 1920x1080, the screen as captured     phone: 1080x1920, the SAME laptop screen zoomed 1.5x and panned left / centre / right so every field is readable
 *   PIPER_MODEL=<.onnx> TOUR_OUT=<dir> node scripts/demo-tour/spares-video.cjs
 */
const fs = require('fs'), path = require('path'), { execFileSync, spawnSync } = require('child_process');
const OUT = path.resolve(process.env.TOUR_OUT || 'demo-tour/spares'); const MODEL = process.env.PIPER_MODEL;
const slides = JSON.parse(fs.readFileSync(path.join(OUT, 'slides.json'), 'utf8')); const NARR = JSON.parse(fs.readFileSync(path.join(OUT, 'narration.json'), 'utf8'));
const W = path.join(OUT, 'build'); fs.rmSync(W, { recursive: true, force: true }); fs.mkdirSync(W, { recursive: true });
const run = (c, a) => execFileSync(c, a, { stdio: ['ignore', 'pipe', 'inherit'] }).toString();
const dur = (f) => parseFloat(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]));
const items = slides.filter((s) => NARR[s.id]).map((s, i) => ({ ...s, n: i, text: NARR[s.id] }));
for (const it of items) {
  it.wav = path.join(W, `v${it.n}.wav`); const r = spawnSync('python3.13', ['-m', 'piper', '-m', MODEL, '--length-scale', '1.05', '-f', it.wav], { input: it.text, stdio: ['pipe', 'ignore', 'inherit'] });
  if (r.status !== 0) throw new Error('piper failed'); it.d = Math.max(3.2, dur(it.wav) + 0.7); console.log('voice', it.id, it.d.toFixed(1));
}
const label = (txt, size, color, w, font) => { const f = path.join(W, 'l' + Math.random().toString(36).slice(2) + '.png'); run('convert', ['-size', `${w}x`, '-background', 'none', '-fill', color, '-font', font, '-pointsize', String(size), '-gravity', 'West', `caption:${txt}`, f]); return f; };
function film(kind) {
  const frames = [], auds = [];
  for (const it of items) {
    if (kind === 'laptop') {
      const f = path.join(W, `L${it.n}.png`); const t = label(it.title, 30, '#ffffff', 1500, 'DejaVu-Sans-Bold');
      run('convert', [it.file, '-resize', '1920x1080!', '(', '-size', '1920x70', 'xc:#0d1b2eDD', ')', '-gravity', 'South', '-composite', t, '-gravity', 'SouthWest', '-geometry', '+40+16', '-composite', f]); frames.push([f, it.d]);
    } else {
      const xs = [0, 600, 1200], d = it.d / 3;
      xs.forEach((x, k) => { const f = path.join(W, `P${it.n}-${k}.png`); const t = label(it.title, 40, '#ffffff', 960, 'DejaVu-Sans-Bold');
        run('convert', [it.file, '-resize', '1920x1080!', '-crop', `720x1080+${x}+0`, '+repage', '-resize', '1080x', '-background', '#0d1b2e', '-gravity', 'Center', '-extent', '1080x1920', t, '-gravity', 'NorthWest', '-geometry', '+60+50', '-composite', f]); frames.push([f, d]); });
    }
    auds.push(path.join(W, `a-${kind}${it.n}.wav`)); run('ffmpeg', ['-y', '-loglevel', 'error', '-i', it.wav, '-af', 'apad', '-t', String(it.d), '-ar', '44100', '-ac', '1', auds[auds.length - 1]]);
  }
  const lst = path.join(W, kind + '.txt'), al = path.join(W, kind + 'a.txt');
  fs.writeFileSync(lst, frames.map(([f, d]) => `file '${f}'\nduration ${d.toFixed(3)}`).join('\n') + `\nfile '${frames[frames.length - 1][0]}'\n`); fs.writeFileSync(al, auds.map((a) => `file '${a}'`).join('\n'));
  const sil = path.join(W, kind + '.mp4'), aud = path.join(W, kind + '.wav'), out = path.join(OUT, kind === 'laptop' ? 'Spares-Demo-Laptop.mp4' : 'Spares-Demo-Phone.mp4');
  const size = kind === 'laptop' ? '1920:1080' : '1080:1920';
  run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-vf', `fps=25,format=yuv420p,scale=${size}`, '-c:v', 'libx264', '-crf', '24', sil]);
  run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', al, '-c', 'copy', aud]);
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', sil, '-i', aud, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', out]);
  console.log(kind, out, Math.round(fs.statSync(out).size / 1048576 * 10) / 10, 'MB', Math.round(dur(out)), 's');
}
film('laptop'); film('phone');
