import * as THREE from 'three';

// Content shown on screens in the sets (what Claude is working on), drawn on canvases.

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const CODE = [
  [['kw', 'import'], ['', ' { tasks } '], ['kw', 'from'], ['str', ' "./tasks.js"'], ['', ';']],
  [['kw', 'const'], ['', ' root = document.body;']],
  [],
  [['kw', 'function'], ['fn', ' render'], ['', '(list) {']],
  [['', '  list.'], ['fn', 'forEach'], ['', '(task => {']],
  [['kw', '    const'], ['', ' row = document']],
  [['', '      .'], ['fn', 'createElement'], ['', '('], ['str', '"li"'], ['', ');']],
  [['', '    row.textContent = task.title;']],
  [['', '    root.'], ['fn', 'appendChild'], ['', '(row);']],
  [['', '  }']], // the bug: "});" expected
  [['', '}']],
  [],
  [['fn', 'render'], ['', '(tasks);']],
];
const SYNTAX = { kw: '#569cd6', str: '#ce9178', fn: '#dcdcaa', '': '#d4d4d4' };
const ERROR_LINE = 10;

// VS Code on the left, DevTools console on the right.
// typed: characters added at the end of the faulty line; fixed: the error is gone (flash 1..0 fades the green).
function drawCode(g, W, H, { typed = '', fixed = false, cursor = false, flash = 0 } = {}) {
  g.fillStyle = '#1e1e1e'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#323233'; g.fillRect(0, 0, W, 44);
  g.fillStyle = '#cccccc'; g.font = '22px Segoe UI'; g.fillText('Visual Studio Code', 90, 30);
  g.fillStyle = '#333333'; g.fillRect(0, 44, 64, H - 80);
  g.fillStyle = '#252526'; g.fillRect(64, 44, 1100, 52);
  g.fillStyle = '#1e1e1e'; g.fillRect(64, 44, 180, 52);
  g.fillStyle = '#e8c86a'; g.font = 'bold 22px Consolas'; g.fillText('JS', 84, 78);
  g.fillStyle = '#ffffff'; g.font = '22px Segoe UI'; g.fillText(fixed ? 'app.js' : 'app.js ●', 120, 78);
  const top = 140, lh = 46, errY = top + (ERROR_LINE - 1) * lh;
  if (!fixed) {
    g.fillStyle = 'rgba(244, 71, 71, 0.18)'; g.fillRect(64, errY - 32, 1100, lh);
  } else if (flash > 0) {
    g.fillStyle = `rgba(80, 200, 120, ${0.3 * flash})`; g.fillRect(64, errY - 32, 1100, lh);
  }
  g.font = '30px Consolas';
  let cursorX = 0;
  CODE.forEach((tokens, i) => {
    const y = top + i * lh;
    g.fillStyle = '#858585'; g.fillText(String(i + 1).padStart(2, ' '), 84, y);
    let x = 150;
    for (const [kind, text] of i === ERROR_LINE - 1 ? [...tokens, ['', typed]] : tokens) {
      g.fillStyle = SYNTAX[kind];
      g.fillText(text, x, y);
      x += g.measureText(text).width;
    }
    if (i === ERROR_LINE - 1) cursorX = x;
  });
  if (cursor) { g.fillStyle = '#aeafad'; g.fillRect(cursorX + 1, errY - 26, 3, 34); }
  if (!fixed) {
    g.strokeStyle = '#f44747'; g.lineWidth = 3; g.beginPath();
    for (let x = 150; x < 220; x += 10) g.lineTo(x, errY + 8 + ((x / 10) % 2 ? 4 : -2));
    g.stroke();
  }
  g.fillStyle = '#181818'; g.fillRect(64, 760, 1100, 244);
  g.fillStyle = '#e7e7e7'; g.font = 'bold 22px Segoe UI'; g.fillText('TERMINAL', 90, 800);
  g.font = '26px Consolas';
  g.fillStyle = '#cccccc'; g.fillText('> npm run dev', 90, 850);
  g.fillStyle = '#89d185'; g.fillText('VITE', 90, 892); g.fillStyle = '#cccccc'; g.fillText('ready in 218 ms', 170, 892);
  if (fixed) { g.fillStyle = '#89d185'; g.fillText('✓ page reload  src/app.js', 90, 934); }
  g.fillStyle = '#007acc'; g.fillRect(0, H - 36, W, 36);
  g.fillStyle = '#ffffff'; g.font = '20px Segoe UI'; g.fillText('main*   JavaScript', 24, H - 11); g.fillText('UTF-8   LF', 1000, H - 11);
  // DevTools
  g.fillStyle = '#242424'; g.fillRect(1180, 44, W - 1180, H - 80);
  g.fillStyle = '#9aa0a6'; g.font = '28px Segoe UI'; g.fillText('Elements', 1210, 100);
  g.fillStyle = '#8ab4f8'; g.fillText('Console', 1370, 100); g.fillRect(1362, 116, 116, 4);
  if (!fixed) {
    g.fillStyle = '#3c1d1f'; g.fillRect(1196, 150, W - 1212, 190);
    g.strokeStyle = '#f28b82'; g.lineWidth = 3; g.beginPath(); g.arc(1232, 192, 16, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(1222, 182); g.lineTo(1242, 202); g.moveTo(1242, 182); g.lineTo(1222, 202); g.stroke();
    g.fillStyle = '#f28b82'; g.font = '28px Consolas';
    g.fillText('Uncaught SyntaxError:', 1266, 202);
    g.fillText('missing ) after', 1266, 248);
    g.fillText('argument list', 1266, 292);
  } else {
    g.fillStyle = '#7fd68f'; g.font = '28px Consolas';
    g.fillText('✓ 0 erreur', 1220, 200);
  }
}

// Wraps text into lines of at most maxWidth (current font).
function wrap(g, text, maxWidth) {
  const rows = [''];
  for (const word of text.split(' ')) {
    const row = rows.at(-1) ? `${rows.at(-1)} ${word}` : word;
    if (rows.at(-1) && g.measureText(row).width > maxWidth) rows.push(word);
    else rows[rows.length - 1] = row;
  }
  return rows;
}

// A plain dark-mode browser on a search page (no real brand), the query being typed.
// Everything sits in a narrow centred column so a vertical close-up can read it.
function drawSearch(g, W, H, { query = '', typed = 0, cursor = false, suggestions = [] } = {}) {
  g.fillStyle = '#202124'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#35363a'; g.fillRect(0, 0, W, 104);
  g.fillStyle = '#202124'; g.beginPath(); g.roundRect(20, 10, 340, 46, [12, 12, 0, 0]); g.fill();
  g.fillStyle = '#e8eaed'; g.font = '22px Segoe UI'; g.fillText('Nouvel onglet', 50, 42);
  g.fillStyle = '#202124'; g.beginPath(); g.roundRect(150, 62, W - 300, 34, 17); g.fill();
  g.fillStyle = '#9aa0a6'; g.font = '20px Segoe UI'; g.fillText('recherche', 180, 86);

  const colW = 720, x0 = (W - colW) / 2;
  g.textAlign = 'center';
  g.fillStyle = '#8ab4f8'; g.font = 'bold 76px Segoe UI';
  g.fillText('Recherche', W / 2, 300);
  g.textAlign = 'left';

  const shown = query.slice(0, typed);
  g.font = '46px Segoe UI';
  const rows = wrap(g, shown, colW - 120);
  const top = 360, lh = 60, boxH = 44 + rows.length * lh;
  g.fillStyle = '#303134';
  g.beginPath(); g.roundRect(x0, top, colW, boxH, suggestions.length ? [36, 36, 0, 0] : 36); g.fill();
  g.strokeStyle = '#9aa0a6'; g.lineWidth = 5;
  g.beginPath(); g.arc(x0 + 50, top + 50, 14, 0, Math.PI * 2); g.moveTo(x0 + 60, top + 60); g.lineTo(x0 + 72, top + 72); g.stroke();
  g.fillStyle = '#e8eaed';
  rows.forEach((row, i) => g.fillText(row, x0 + 96, top + 68 + i * lh));
  if (cursor) g.fillRect(x0 + 100 + g.measureText(rows.at(-1)).width, top + 28 + (rows.length - 1) * lh, 4, 52);

  if (suggestions.length) {
    const sTop = top + boxH;
    g.fillStyle = '#303134';
    g.beginPath(); g.roundRect(x0, sTop, colW, 20 + suggestions.length * 64, [0, 0, 36, 36]); g.fill();
    g.fillStyle = '#5f6368'; g.fillRect(x0 + 24, sTop, colW - 48, 2);
    suggestions.forEach((sug, i) => {
      const y = sTop + 52 + i * 64;
      g.strokeStyle = '#9aa0a6'; g.lineWidth = 4;
      g.beginPath(); g.arc(x0 + 50, y - 10, 11, 0, Math.PI * 2); g.moveTo(x0 + 58, y - 2); g.lineTo(x0 + 67, y + 7); g.stroke();
      let k = 0;
      while (k < sug.length && sug[k] === shown[k]) k++;
      g.font = '32px Segoe UI';
      const prefixW = g.measureText(sug.slice(0, k)).width;
      g.fillStyle = '#bdc1c6'; g.fillText(sug.slice(0, k), x0 + 96, y);
      g.font = 'bold 32px Segoe UI';
      g.fillStyle = '#e8eaed'; g.fillText(sug.slice(k), x0 + 96 + prefixW, y);
    });
  }
}

const DRAW = { code: drawCode, search: drawSearch };

// A screen whose content can change during a scene: set({ mode: 'code' | 'search', ...state }).
export function createScreen(w = 1760, h = 1040) {
  let key = '';
  const texture = canvasTexture(w, h, () => {});
  const g = texture.image.getContext('2d');
  return {
    texture,
    set(state) {
      const k = JSON.stringify(state);
      if (k === key) return;
      key = k;
      g.save();
      DRAW[state.mode](g, w, h, state);
      g.restore();
      texture.needsUpdate = true;
    },
  };
}

// Static screen with the bug (character sheets, previews).
export function screenTexture() {
  const s = createScreen();
  s.set({ mode: 'code' });
  return s.texture;
}
