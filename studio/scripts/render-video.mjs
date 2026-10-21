// Renders an episode to episodes/<ep>/<ep>.mp4 (1080x1920, 30 fps, voices + sound from mix.wav).
//   node scripts/render-video.mjs <ep>                     full video
//   node scripts/render-video.mjs <ep> --stills=1,4.5,9    only these instants (seconds) -> episodes/<ep>/stills/
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { serve, launch } from './render-sheet.mjs';

const PROJECT = path.resolve(import.meta.dirname, '..', '..');
const [ep, ...opts] = process.argv.slice(2);
const stills = opts.find((o) => o.startsWith('--stills='))?.slice(9).split(',');
const dir = path.join(PROJECT, 'episodes', ep);

const server = await serve(PROJECT);
const browser = await launch();
const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[error]', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/studio/video/episode.html?ep=${encodeURIComponent(ep)}`);
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
const info = await page.evaluate(() => window.__info);
const frame = async (f) => {
  const url = await page.evaluate((n) => window.renderFrame(n), f);
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
};

if (stills) {
  fs.mkdirSync(path.join(dir, 'stills'), { recursive: true });
  for (const s of stills) {
    const file = path.join(dir, 'stills', `t${s}.png`);
    fs.writeFileSync(file, await frame(Math.round(parseFloat(s) * info.fps)));
    console.log('saved', path.relative(PROJECT, file));
  }
} else {
  const out = path.join(dir, `${ep}.mp4`), tmp = path.join(dir, `${ep}.partial.mp4`); // a failed render never replaces a good video
  const ff = spawn('ffmpeg', [
    '-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(info.fps), '-c:v', 'png', '-i', '-',
    '-i', path.join(dir, 'mix.wav'), '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', tmp,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let f = 0; f < info.frames; f++) {
    if (!ff.stdin.write(await frame(f))) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 30 === 0) console.log(`frame ${f}/${info.frames}  ${((Date.now() - t0) / (f + 1)).toFixed(0)} ms/frame`);
  }
  ff.stdin.end();
  const code = await new Promise((r) => ff.on('close', r));
  if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
  fs.renameSync(tmp, out);
  console.log('saved', path.relative(PROJECT, out), `in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
await browser.close();
server.close();
