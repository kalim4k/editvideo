import * as THREE from 'three';
import { createRenderer } from '../src/render.js';
import { buildSalon, seatToi, seatClaude } from '../src/sets/salon.js';
import { buildTable, createBoard, seatToiAtTable, seatClaudeOnBooks, givePointer } from '../src/sets/table.js';
import { createScreen } from '../src/sets/ecran.js';
import { createToi } from '../src/characters/toi.js';
import { createClaude } from '../src/characters/claude.js';

// Plays an episode timeline (episodes/<ep>/timeline.json, made by tools/episode.py) frame by frame.
// window.renderFrame(f) draws frame f (set, characters, subtitle) and returns it as a data URL.

const W = 1080, H = 1920;
const ep = new URLSearchParams(location.search).get('ep');
const tl = await (await fetch(`../../episodes/${ep}/timeline.json`)).json();

const scene = new THREE.Scene();
const toi = createToi();
const claude = createClaude();
const renderer = createRenderer(W, H);
const out = document.createElement('canvas');
out.width = W;
out.height = H;
const center = (o) => { scene.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()); };
const smooth = (u) => u * u * (3 - 2 * u);

// ---------------------------------------------------------------- sets
// Each set gives its shots, where the characters look for each target ({ yaw, pitch } for your head, a yaw for
// Claude's body) and an update(t, direction) for what changes in the set (screen, whiteboard, pointer).
// Shots are { pos, look, fov, push } (push = fraction of the distance travelled, a slow push-in) or
// { at(u) => { pos, look }, fov } for moving shots, u going 0..1 over the shot.

// Camera in front of a character's spot (its +z); side > 0 moves it towards +x.
function faceCam(anchor, target, dist, side, up) {
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(anchor.getWorldQuaternion(new THREE.Quaternion()));
  return { pos: target.clone().addScaledVector(fwd, dist).add(new THREE.Vector3(side, up, 0)).toArray(), look: target.toArray() };
}

// Over the shoulder: on the `from` side of the line between the two, `side` units off it, looking at `at`.
function ots(at, from, dist, side, up) {
  const dir = from.clone().sub(at).setY(0).normalize();
  const perp = new THREE.Vector3(-dir.z, 0, dir.x);
  return { pos: at.clone().addScaledVector(dir, dist).addScaledVector(perp, side).add(new THREE.Vector3(0, up, 0)).toArray(), look: at.toArray() };
}

// Plays the board timeline (images, or recording frames matching the time) on a surface made by createBoard().
// Returns show(t) => true while some media is on.
function mediaPlayer(surface) {
  let shown = '';
  return async (t) => {
    const ev = tl.board?.findLast((e) => e.t <= t);
    if (!ev) return false;
    const src = ev.image ?? `${ev.frames}/${String(Math.min(ev.count, Math.floor((t - ev.t) * tl.fps) + 1)).padStart(5, '0')}.jpg`;
    if (src !== shown) {
      shown = src;
      const bitmap = await createImageBitmap(await (await fetch(`../../episodes/${ep}/${src}`)).blob());
      surface.show(bitmap);
      bitmap.close();
    }
    return true;
  };
}

// A shot looking straight at a point (u, v) of a flat screen (0..1 from its top-left corner), panning from
// u[0], v[0] to u[1], v[1] during the shot.
function screenShot(toWorld, normal, [u0, u1], [v0, v1], dist, fov) {
  return {
    fov,
    at(k) {
      const look = toWorld(THREE.MathUtils.lerp(u0, u1, k), THREE.MathUtils.lerp(v0, v1, k));
      return { pos: look.clone().addScaledVector(normal, dist).toArray(), look: look.toArray() };
    },
  };
}

function salonSet() {
  const screen = createScreen();
  const media = createBoard();
  const showMedia = mediaPlayer(media);
  const { seats, display } = buildSalon(scene, { screen: screen.texture });
  const onScreen = (u, v) => display.localToWorld(new THREE.Vector3((u - 0.5) * 152, (0.5 - v) * 86, 0));
  const normal = new THREE.Vector3(0, 0, 1);
  seatToi(seats, toi);
  seatClaude(seats, claude);
  const claudeLow = center(claude.root).add(new THREE.Vector3(0, -9.7, 0)); // frames Claude above the subtitle
  const toiHead = center(toi.rig.head);

  function screenAt(t) {
    const ev = tl.screen.findLast((e) => e.t <= t);
    const typed = ev.times ? ev.times.filter((x) => x <= t).length : 0;
    const blink = Math.floor(t * 2.4) % 2 === 0;
    if (ev.mode === 'code') {
      const fixed = ev.fixedAt != null && t >= ev.fixedAt;
      const typing = ev.times && typed < ev.times.length;
      const flash = fixed ? Math.round(Math.max(0, 1 - (t - ev.fixedAt) / 1.2) * 20) / 20 : 0;
      return { mode: 'code', typed: (ev.typed || '').slice(0, typed), fixed, cursor: !fixed && (typing || blink), flash };
    }
    const done = typed >= ev.query.length;
    return {
      mode: 'search', query: ev.query, typed, cursor: !done || blink,
      suggestions: done && t >= ev.times.at(-1) + 0.35 ? ev.suggestions : [],
    };
  }

  return {
    shots: {
      large: { pos: [0, 78, 128], look: [0, 44, -70], fov: 56, push: 0.05 },
      ecran: { pos: [-50, 53, -40], look: [-50, 53, -144], fov: 36, push: 0.05 },
      claude: { ...faceCam(seats.claude, claudeLow, 104, -25, 9), fov: 36, push: 0.06 },
      toi: { ...faceCam(seats.toi, toiHead.clone().setY(toiHead.y - 9), 78, 20, 4), fov: 36, push: 0.05 },
      'toi-serre': { ...faceCam(seats.toi, toiHead.clone().setY(toiHead.y - 5), 66, 15, 3), fov: 36, push: 0.02 },
      recherche: { pos: [0, 66, 44], look: [0, 66, -144], fov: 36, push: 0.04 },
      // Inserts on recordings shown on the screen.
      prompt: screenShot(onScreen, normal, [0.47, 0.6], [0.47, 0.47], 95, 36),
      jeu: screenShot(onScreen, normal, [0.27, 0.5], [0.4, 0.5], 125, 36),
      rapports: screenShot(onScreen, normal, [0.33, 0.37], [0.4, 0.4], 105, 36),
      'claude-ui': screenShot(onScreen, normal, [0.42, 0.44], [0.22, 0.22], 120, 36),
    },
    looks: {
      toi: { claude: { yaw: -0.5, pitch: 0 }, ecran: { yaw: 0, pitch: 0 } },
      claude: { toi: 0.35, ecran: 0 },
    },
    rest: { toiLook: 'ecran', claudeLook: 'ecran' },
    async update(t) {
      const on = await showMedia(t);
      display.material.map = on ? media.texture : screen.texture;
      if (!on) screen.set(screenAt(t));
    },
  };
}

function tableSet() {
  const board = createBoard();
  const { board: surface, spots } = buildTable(scene, { board });
  seatToiAtTable(spots, toi);
  seatClaudeOnBooks(spots, claude);
  const pointer = givePointer(claude);
  const toiHead = center(toi.rig.head);
  const claudeC = center(claude.root);
  // Point (u, v) of the board, 0..1 from its top-left corner, in world space; normal = out of the board.
  const onBoard = (u, v) => surface.localToWorld(new THREE.Vector3((u - 0.5) * 80, (0.5 - v) * 45, 0));
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(surface.getWorldQuaternion(new THREE.Quaternion()));
  const boardShot = (u, v, dist, fov) => screenShot(onBoard, normal, u, v, dist, fov);

  const showBoard = mediaPlayer(board);

  return {
    shots: {
      large: { pos: [66, 80, 108], look: [-8, 47, -14], fov: 50, push: 0.04 },
      toi: { ...ots(toiHead.clone().setY(toiHead.y - 7), claudeC, 70, 16, 4), fov: 40, push: 0.05 },
      'toi-serre': { ...ots(toiHead.clone().setY(toiHead.y - 4), claudeC, 54, 12, 3), fov: 40, push: 0.02 },
      claude: { ...ots(claudeC.clone().setY(claudeC.y - 15), toiHead, 94, -28, 10), fov: 40, push: 0.05 },
      jeu: boardShot([0.5, 0.5], [0.66, 0.63], 165, 40),
      adsense: boardShot([0.36, 0.52], [0.58, 0.58], 95, 36),
    },
    looks: {
      toi: { claude: { yaw: 0, pitch: 0 }, tableau: { yaw: -0.1, pitch: -0.25 } },
      claude: { toi: 0, tableau: 0.5 },
    },
    rest: { toiLook: 'claude', claudeLook: 'toi' },
    async update(t, d) {
      await showBoard(t);
      pointer.stick.visible = !!d.pointer.to;
      if (d.pointer.to) {
        const u = smooth(THREE.MathUtils.clamp((t - d.pointer.t) / 0.35, 0, 1));
        const from = d.pointer.from ?? d.pointer.to;
        scene.updateMatrixWorld(true);
        pointer.aim(onBoard(THREE.MathUtils.lerp(from[0], d.pointer.to[0], u), THREE.MathUtils.lerp(from[1], d.pointer.to[1], u)));
      }
    },
  };
}

const set = tl.set === 'table' ? tableSet() : salonSet();
scene.updateMatrixWorld(true);

// ---------------------------------------------------------------- shots

const camera = new THREE.PerspectiveCamera(40, W / H, 1, 3000);
const shots = tl.shots.map((s, i) => ({ ...set.shots[s.name], start: s.t, end: tl.shots[i + 1]?.t ?? tl.duration }));

function placeCamera(shot, t) {
  const u = smooth(THREE.MathUtils.clamp((t - shot.start) / (shot.end - shot.start), 0, 1));
  const { pos, look } = shot.at ? shot.at(u) : shot;
  const target = new THREE.Vector3(...look);
  camera.position.copy(new THREE.Vector3(...pos).lerp(target, (shot.push || 0) * u));
  camera.fov = shot.fov;
  camera.aspect = W / H;
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- direction (expressions, looks, pointer, blinks)

function directionAt(t) {
  const s = { toi: 'neutre', claude: 'neutre', claudeAt: -1, pointer: { to: null, from: null, t: -1 } };
  for (const k of ['toiLook', 'claudeLook']) s[k] = { to: set.rest[k], from: set.rest[k], t: -1 };
  for (const e of tl.events) {
    if (e.t > t) break;
    if (e.toi) s.toi = e.toi;
    if (e.claude && e.claude !== s.claude) { s.claude = e.claude; s.claudeAt = e.t; }
    for (const k of ['toiLook', 'claudeLook']) {
      if (e[k] && e[k] !== s[k].to) s[k] = { to: e[k], from: s[k].to, t: e.t > 0 ? e.t : -1 };
    }
    if ('pointer' in e) s.pointer = { to: e.pointer, from: s.pointer.to, t: e.t };
  }
  return s;
}

// Head / body turn towards the current target, eased over 0.35 s.
function turn(look, t, values, pick = (v) => v) {
  const u = smooth(THREE.MathUtils.clamp((t - look.t) / 0.35, 0, 1));
  return THREE.MathUtils.lerp(pick(values[look.from]), pick(values[look.to]), u);
}

function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function blinkTimes(seed) {
  const r = rng(seed), out = [];
  for (let t = 0.8 + r() * 1.5; t < tl.duration; t += 2.2 + r() * 2.3) out.push(t);
  return out;
}
const blinks = { toi: blinkTimes(7), claude: blinkTimes(11) };
const blinking = (who, t) => blinks[who].some((b) => t >= b && t < b + 0.13);

// "z" letters rising over Claude's head while he sleeps (expression "endormi" and not talking).
function createZzz() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  g.font = '900 104px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 14;
  g.strokeStyle = '#ffffff';
  g.strokeText('z', 64, 60);
  g.fillStyle = '#2f3e57';
  g.fillText('z', 64, 60);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const letters = [0, 1, 2].map(() => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, toneMapped: false }));
    claude.root.add(sprite);
    return sprite;
  });
  return (t, on) => letters.forEach((s, i) => {
    const u = (t / 2.4 + i / 3) % 1;
    s.visible = on;
    s.position.set(-9 - 7 * u + 1.2 * Math.sin(u * 7), 21 + 9 * u, 10); // up and out from the top corner, inside close-ups
    s.scale.setScalar(2.5 + 3.5 * u);
    s.material.opacity = Math.min(1, u * 6, (1 - u) * 3);
  });
}
const zzz = createZzz();
const claudeTalks = (t) => tl.lines.some((l) => l.who === 'claude' && t > l.start - 0.2 && t < l.end + 0.2);

async function animate(t, f) {
  const d = directionAt(t);
  const env = (who, k) => tl.env[who][Math.max(0, f - k)] || 0;

  toi.setExpression(d.toi);
  toi.setBlink(blinking('toi', t));
  const voice = env('toi', 0);
  toi.setMouth(voice > 0.62 ? 2 : voice > 0.22 ? 1 : 0);
  toi.rig.head.rotation.set(
    0.05 * voice + turn(d.toiLook, t, set.looks.toi, (v) => v.pitch),
    turn(d.toiLook, t, set.looks.toi, (v) => v.yaw),
    0.015 * Math.sin(t * 1.3),
  );

  claude.setExpression(d.claude);
  claude.setBlink(blinking('claude', t));
  claude.setTalk(env('claude', 0) * 0.75 + env('claude', 1) * 0.25);
  const asleep = d.claude === 'endormi';
  claude.rig.body.scale.y *= 1 + (asleep ? 0.025 : 0.008) * Math.sin(t * Math.PI * (asleep ? 0.4 : 0.5)); // breathing
  claude.rig.body.rotation.x = asleep ? 0.14 : 0; // dozing, tipped forward
  const jolt = d.claude === 'surpris' ? Math.max(0, 1 - (t - d.claudeAt) / 0.3) : 0; // startled hop
  claude.rig.body.position.y += 2.2 * Math.sin(jolt * Math.PI);
  zzz(t, asleep && !claudeTalks(t));
  claude.root.rotation.y = turn(d.claudeLook, t, set.looks.claude);
  claude.rig.legs.forEach((hip, i) => { hip.rotation.x = -1.2 + (asleep ? 0 : 0.1 * Math.sin(t * Math.PI * 1.1 + i * 1.7)); }); // dangling legs

  await set.update(t, d);
}

// ---------------------------------------------------------------- subtitles (agentpoly style)

const SUB = { top: 1150, size: 46, lineHeight: 55, maxWidth: 900, colors: { toi: '#fdf7f8', claude: '#f79a67' } };

// The subtitle on screen at time t: a line is split in chunks (tools/episode.py); the last chunk stays a little
// after the voice, until the next line or the next cut.
function subtitleAt(t) {
  for (const [i, ln] of tl.lines.entries()) {
    const subs = ln.subs ?? [{ text: ln.text, start: ln.start, end: ln.end }];
    const stop = Math.min(ln.end + 0.5, (tl.lines[i + 1]?.start ?? Infinity) - 0.1, tl.shots.find((s) => s.t > ln.end)?.t ?? Infinity);
    for (const [k, sub] of subs.entries()) {
      const from = (k ? sub.start : ln.start) - 0.1;
      const to = subs[k + 1] ? subs[k + 1].start - 0.1 : stop;
      if (t >= from && t < to) return { text: sub.text, who: ln.who, from, punch: ln.punch };
    }
  }
  return null;
}

// Punch lines ("Silence !", "Plus vite !"): big yellow capitals in the middle of the frame, popping in.
function drawPunch(ctx, t, sub) {
  const u = THREE.MathUtils.clamp((t - sub.from) / 0.12, 0, 1);
  const text = sub.text.toUpperCase();
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 128;
  ctx.font = `800 ${size}px Poppins`;
  while (ctx.measureText(text).width > 960 && size > 60) ctx.font = `800 ${(size -= 4)}px Poppins`;
  ctx.translate(W / 2, SUB.top - 40);
  ctx.scale(1.35 - 0.35 * smooth(u), 1.35 - 0.35 * smooth(u));
  ctx.rotate(-0.04);
  ctx.globalAlpha = u;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 18; ctx.strokeStyle = '#111';
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = '#ffd23c';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// Call-to-action card ({ title, sub }) from the latest "card" event, sliding up from the bottom.
function drawCard(ctx, t) {
  const ev = tl.events.findLast((e) => e.t <= t && 'card' in e);
  if (!ev?.card) return;
  const u = smooth(THREE.MathUtils.clamp((t - ev.t) / 0.3, 0, 1));
  const y = 1300 + (1 - u) * 260, w = 920, h = ev.card.sub ? 250 : 170; // under the subtitle, clear of the faces
  ctx.save();
  ctx.globalAlpha = u;
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#ffd23c';
  ctx.beginPath(); ctx.roundRect((W - w) / 2, y, w, h, 36); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#111';
  ctx.font = '800 84px Poppins';
  ctx.fillText(ev.card.title, W / 2, y + 92);
  if (ev.card.sub) { ctx.font = '600 44px Inter'; ctx.fillText(ev.card.sub, W / 2, y + 190); }
  // a bouncing arrow pointing down to the comments
  const ay = y + h + 40 + Math.abs(Math.sin(t * 5)) * 22;
  ctx.fillStyle = '#ffd23c'; ctx.strokeStyle = '#111'; ctx.lineWidth = 8; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(W / 2 - 50, ay); ctx.lineTo(W / 2 + 50, ay); ctx.lineTo(W / 2, ay + 60); ctx.closePath();
  ctx.stroke(); ctx.fill();
  ctx.restore();
}

function drawSubtitle(ctx, t) {
  const sub = subtitleAt(t);
  if (!sub) return;
  if (sub.punch) return drawPunch(ctx, t, sub);
  ctx.save();
  ctx.font = `600 ${SUB.size}px Inter`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const words = sub.text.split(' ');
  const width = (ws) => ctx.measureText(ws.join(' ')).width;
  let rows = [];
  if (width(words) <= SUB.maxWidth) rows = [sub.text];
  else { // two balanced rows when they fit, else greedy
    let best = null;
    for (let k = 1; k < words.length; k++) {
      const w = Math.max(width(words.slice(0, k)), width(words.slice(k)));
      if (w <= SUB.maxWidth && (!best || w < best.w)) best = { k, w };
    }
    if (best) rows = [words.slice(0, best.k).join(' '), words.slice(best.k).join(' ')];
    else for (const w of words) {
      const last = rows.at(-1);
      if (last && ctx.measureText(`${last} ${w}`).width <= SUB.maxWidth) rows[rows.length - 1] = `${last} ${w}`;
      else rows.push(w);
    }
  }
  ctx.globalAlpha = THREE.MathUtils.clamp((t - sub.from) / 0.08, 0, 1);
  rows.forEach((row, r) => {
    const y = SUB.top + SUB.lineHeight * (r + 0.5);
    // Soft dark rim: the rooms are bright, the reference rooms were dark.
    ctx.lineJoin = 'round'; ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,0.62)';
    ctx.strokeText(row, W / 2, y);
    for (const [color, blur, dy] of [['rgba(0,0,0,0.7)', 6, 2], ['rgba(0,0,0,0.8)', 2, 0]]) {
      ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.shadowOffsetY = dy;
      ctx.fillStyle = SUB.colors[sub.who];
      ctx.fillText(row, W / 2, y);
    }
  });
  ctx.restore();
}

// ---------------------------------------------------------------- frames

window.renderFrame = async (f, type = 'image/png') => {
  const t = f / tl.fps;
  await animate(t, f);
  placeCamera(shots.findLast((s) => s.start <= t) || shots[0], t);
  renderer.render(scene, camera);
  const ctx = out.getContext('2d');
  ctx.drawImage(renderer.domElement, 0, 0);
  drawSubtitle(ctx, t);
  drawCard(ctx, t);
  return out.toDataURL(type, 0.95);
};

await document.fonts.load(`600 ${SUB.size}px Inter`);
await document.fonts.load('800 100px Poppins');
window.__info = { frames: tl.frames, fps: tl.fps, duration: tl.duration };
window.__ready = true;
