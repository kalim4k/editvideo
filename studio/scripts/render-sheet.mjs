// Renders the character sheets (sheets/sheet.html) to PNG files in ../personnages/.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.resolve(ROOT, '..', 'personnages');
// Chrome: CHROME_PATH if set, else the first one installed (the Windows PC, then Linux machines).
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => p && fs.existsSync(p));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };

export function serve(root) {
  const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const hidden = path.relative(root, file).split(path.sep).some((part) => part.startsWith('.')); // never serve .env
    if (!file.startsWith(root) || hidden || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

export function launch() {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: process.platform === 'win32'
      ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
      : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'], // no GPU on cloud machines
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve(path.resolve(ROOT, '..'));
  const browser = await launch();
  const page = await browser.newPage();
  page.on('console', (m) => console.log('[page]', m.text()));
  page.on('pageerror', (e) => console.log('[error]', e.message));
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${server.address().port}/studio/sheets/sheet.html${process.argv[2] ? `?only=${process.argv[2]}` : ''}`);
  await page.waitForFunction('window.__ready === true', { timeout: 180000 });
  for (const [id, name] of [['sheet-toi', 'fiche_toi'], ['sheet-claude', 'fiche_claude'], ['plan-large', 'apercu_1_plan_large'], ['insert-ecran', 'apercu_2_ecran'], ['gros-plan-claude', 'apercu_3_gros_plan_claude'], ['gros-plan-toi', 'apercu_4_gros_plan_toi'],
    ['table-large', 'apercu_table_1_large'], ['table-toi', 'apercu_table_2_toi'], ['table-claude', 'apercu_table_3_claude'], ['table-tableau', 'apercu_table_4_tableau']]) {
    if (process.argv[2] && !id.startsWith(process.argv[2])) continue;
    await (await page.$(`#${id}`)).screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log('saved', `personnages/${name}.png`);
  }
  await browser.close();
  server.close();
}
