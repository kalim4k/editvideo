import * as THREE from 'three';
import { createRenderer } from '../src/render.js';
import { buildSalon, seatToi, seatClaude } from '../src/sets/salon.js';
import { buildTable, createBoard, seatToiAtTable, seatClaudeOnBooks, givePointer } from '../src/sets/table.js';
import { createToi } from '../src/characters/toi.js';
import { createClaude, EXPRESSIONS as CLAUDE_EXPR } from '../src/characters/claude.js';

const sharpGL = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
sharpGL.setPixelRatio(1);
sharpGL.shadowMap.enabled = true;
sharpGL.shadowMap.type = THREE.PCFSoftShadowMap;
sharpGL.toneMapping = THREE.ACESFilmicToneMapping;
sharpGL.outputColorSpace = THREE.SRGBColorSpace;

function studioScene() {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#dfe6ff', '#3a302c', 1.2));
  const key = new THREE.DirectionalLight('#fff4e8', 2.4);
  key.position.set(-40, 60, 70);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -50, right: 50, top: 80, bottom: -10, near: 1, far: 300 });
  const rim = new THREE.DirectionalLight('#bcd4ff', 1.2);
  rim.position.set(50, 40, -60);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.3 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(key, rim, floor);
  return scene;
}

// Framed render of a character or one of its parts, transparent background.
function sharpShot(scene, target, w, h, { fov = 28, yaw = 0.35, pitch = 0.12, pad = 1.25 } = {}) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(target);
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const half = THREE.MathUtils.degToRad(fov) / 2;
  const dist = Math.max(size.y * pad / 2 / Math.tan(half), Math.max(size.x, size.z) * pad / 2 / Math.tan(half) / (w / h)) + size.z / 2;
  const cam = new THREE.PerspectiveCamera(fov, w / h, 1, 2000);
  cam.position.set(c.x + Math.sin(yaw) * dist, c.y + Math.sin(pitch) * dist, c.z + Math.cos(yaw) * dist);
  cam.lookAt(c);
  sharpGL.setSize(w * 2, h * 2, false);
  sharpGL.setClearColor(0x000000, 0);
  sharpGL.render(scene, cam);
  return sharpGL.domElement.toDataURL();
}

const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
const card = (src, label, w) => `<div class="card"><img src="${src}"${w ? ` width="${w}"` : ''}><div class="label">${label}</div></div>`;

function sheetToi() {
  const scene = studioScene();
  const toi = createToi();
  scene.add(toi.root);

  const views = [['Face', 0], ['Trois-quarts', 0.7], ['Profil', Math.PI / 2], ['Dos', Math.PI]].map(([label, rot]) => {
    toi.root.rotation.y = rot;
    return card(sharpShot(scene, toi.root, 300, 460, { yaw: 0, pitch: 0.08, pad: 1.15 }), label, 300);
  });
  toi.root.rotation.y = 0.5;
  toi.setPose('assis');
  views.push(card(sharpShot(scene, toi.root, 300, 460, { yaw: 0, pitch: 0.15, pad: 1.25 }), 'Assis', 300));
  toi.setPose('repos');

  toi.root.rotation.y = 0.3;
  const exprLabels = { neutre: 'Neutre', content: 'Content', choque: 'Choqué', blase: 'Blasé', fatigue: 'Fatigué', enerve: 'Énervé' };
  const exprs = Object.entries(exprLabels).map(([name, label]) => {
    toi.setExpression(name);
    return card(sharpShot(scene, toi.rig.head, 200, 200, { yaw: 0, pitch: 0.05, pad: 1.2 }), label, 200);
  });
  toi.setExpression('neutre');
  for (const [label, level] of [['Bouche entrouverte', 1], ['Bouche ouverte', 2]]) {
    toi.setMouth(level);
    exprs.push(card(sharpShot(scene, toi.rig.head, 200, 200, { yaw: 0, pitch: 0.05, pad: 1.2 }), label, 200));
  }
  toi.setMouth(0);

  document.querySelector('#sheet-toi').append(el(`<div>
    <div class="kicker">FICHE PERSONNAGE · 01</div>
    <h1>Toi</h1>
    <div class="sub">Avatar 3D en cubes, style chibi (la tête fait ~40 % de la hauteur), d'après tes photos</div>
    <h2>VUES &amp; POSES</h2>
    <div class="row">${views.join('')}</div>
    <h2>EXPRESSIONS <small>+ formes de bouche pour la synchro labiale</small></h2>
    <div class="row">${exprs.join('')}</div>
  </div>`));
}

function sheetClaude() {
  const scene = studioScene();
  const claude = createClaude();
  scene.add(claude.root);
  const views = [['Face', 0], ['Trois-quarts', -0.7], ['Profil', -Math.PI / 2]].map(([label, rot]) => {
    claude.root.rotation.y = rot;
    return card(sharpShot(scene, claude.root, 330, 300, { yaw: 0, pad: 1.3 }), label, 330);
  });
  claude.root.rotation.y = -0.3;
  const exprs = Object.entries(CLAUDE_EXPR).map(([name, label]) => {
    claude.setExpression(name);
    return card(sharpShot(scene, claude.rig.face.parent, 220, 200, { yaw: 0.25, pitch: 0.05, pad: 1.15 }), label, 220);
  });
  document.querySelector('#sheet-claude').append(el(`<div>
    <div class="kicker">FICHE PERSONNAGE · 02</div>
    <h1><span>Claude</span></h1>
    <div class="sub">Comme dans les vidéos d'origine : bloc orange lisse, sourcils, 4 longues pattes. Il parle en rebondissant.</div>
    <h2>VUES</h2>
    <div class="row">${views.join('')}</div>
    <h2>EXPRESSIONS</h2>
    <div class="row">${exprs.join('')}</div>
  </div>`));
}

// ---------------------------------------------------------------- frames in the reference video style

// Helpers to render 1080x1920 frames with a subtitle, like a frame of the final video.
function mockKit(scene) {
  const renderer = createRenderer(1080, 1920);
  const shots = [];
  const camera = (pos, look, fov = 38) => {
    const c = new THREE.PerspectiveCamera(fov, 1080 / 1920, 1, 3000);
    c.position.set(...pos);
    c.lookAt(...look);
    return c;
  };
  const center = (o) => { scene.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()); };
  return {
    camera,
    center,
    // Camera in front of a character's spot (its +z); side > 0 moves it towards +x.
    faceCam(anchor, target, dist, side, up, fov = 36) {
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(anchor.getWorldQuaternion(new THREE.Quaternion()));
      return camera(target.clone().addScaledVector(fwd, dist).add(new THREE.Vector3(side, up, 0)).toArray(), target.toArray(), fov);
    },
    shoot(id, cam, text, who) {
      scene.updateMatrixWorld(true);
      renderer.render(scene, cam);
      shots.push([id, renderer.domElement.toDataURL('image/jpeg', 0.92), text, who]);
    },
    publish() {
      for (const [id, src, text, who] of shots) {
        document.querySelector(`#${id}`).append(el(`<img class="frame" src="${src}">`), el(`<div class="subtitle ${who}">${text}</div>`));
      }
    },
  };
}

function mockFrames() {
  const scene = new THREE.Scene();
  const { seats } = buildSalon(scene);
  const toi = createToi();
  seatToi(seats, toi);
  const claude = createClaude();
  seatClaude(seats, claude);
  const { camera, center, faceCam, shoot, publish } = mockKit(scene);

  // 1. Wide from behind: both in their armchairs, facing the big screen.
  toi.setExpression('fatigue');
  toi.setMouth(1);
  toi.rig.head.rotation.y = -0.25;
  shoot('plan-large', camera([0, 78, 128], [0, 44, -70], 56), 'Claude, tu peux corriger ce bug ?', 'toi');
  toi.setMouth(0);

  // 2. Insert on the screen: what Claude is working on.
  shoot('insert-ecran', camera([-50, 53, -40], [-50, 53, -144], 36), 'Ligne 10… Il manque une parenthèse.', 'claude');

  // 3. Claude close-up, turned towards you.
  claude.root.rotation.y = 0.35;
  claude.setExpression('inquiet');
  claude.setTalk(0.6);
  shoot('gros-plan-claude', faceCam(seats.claude, center(claude.root).add(new THREE.Vector3(0, -9.7, 0)), 104, -25, 9), 'Mais… ça va, toi ?', 'claude');
  claude.setTalk(0);

  // 4. Your close-up, head turned towards Claude.
  toi.rig.head.rotation.y = 0;
  toi.setExpression('blase');
  toi.setMouth(1);
  const headC = center(toi.rig.head).add(new THREE.Vector3(0, -9, 0));
  shoot('gros-plan-toi', faceCam(seats.toi, headC, 78, 20, 4), 'Je vais bien. Corrige juste.', 'toi');

  publish();
}

// The face-to-face table set: you, Claude on his books, the whiteboard used as the screen.
async function mockTable() {
  const scene = new THREE.Scene();
  const board = createBoard();
  const { board: surface, spots } = buildTable(scene, { board });
  const toi = createToi();
  seatToiAtTable(spots, toi);
  const claude = createClaude();
  seatClaudeOnBooks(spots, claude);
  const pointer = givePointer(claude);
  const { camera, center, shoot, publish } = mockKit(scene);
  const image = async (name) => createImageBitmap(await (await fetch(`../../episodes/business1/media/${name}`)).blob());
  // Point (u, v) of the board, 0..1 from its top-left corner, in world space.
  const onBoard = (u, v) => { scene.updateMatrixWorld(true); return surface.localToWorld(new THREE.Vector3((u - 0.5) * 80, (0.5 - v) * 45, 0)); };
  // Over-the-shoulder: camera on the `from` side of the line between the two, `side` units off it, looking at `at`.
  const ots = (at, from, dist, side, up, fov) => {
    const dir = from.clone().sub(at).setY(0).normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    return camera(at.clone().addScaledVector(dir, dist).addScaledVector(perp, side).add(new THREE.Vector3(0, up, 0)).toArray(), at.toArray(), fov);
  };
  const toiHead = center(toi.rig.head);
  const claudeC = center(claude.root);

  board.show(await image('claude_accueil.jpg'));
  toi.setExpression('enerve');
  toi.setMouth(2);
  toi.rig.head.rotation.y = 0.15;
  claude.setExpression('surpris');
  pointer.stick.visible = false;
  shoot('table-large', camera([66, 80, 108], [-8, 47, -14], 50), 'Claude ! Je veux gagner un million de francs CFA par mois !', 'toi');

  toi.rig.head.rotation.y = 0;
  shoot('table-toi', ots(toiHead.clone().setY(toiHead.y - 7), claudeC, 70, 16, 4, 40), 'Crée-moi un business !', 'toi');
  toi.setMouth(0);

  board.show(await image('apex.jpg'));
  pointer.stick.visible = true;
  pointer.aim(onBoard(0.55, 0.65));
  claude.setExpression('malicieux');
  claude.setTalk(0.6);
  shoot('table-claude', ots(claudeC.clone().setY(claudeC.y - 12.5), toiHead, 86, -26, 10, 40), 'Et si je te créais un jeu ?', 'claude');
  claude.setTalk(0);

  board.show(await image('adsense_accueil.jpg'));
  pointer.aim(onBoard(0.36, 0.33));
  const target = onBoard(0.5, 0.58);
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(surface.getWorldQuaternion(new THREE.Quaternion()));
  shoot('table-tableau', camera(target.clone().addScaledVector(normal, 95).toArray(), target.toArray(), 36), 'Ce mois-ci : 1 120 €.', 'claude');
  publish();
}

try {
  const only = new URLSearchParams(location.search).get('only'); // ?only=table renders just the table previews
  if (!only) {
    sheetToi();
    sheetClaude();
    mockFrames();
  }
  await mockTable();
  await document.fonts.ready;
} catch (e) {
  console.error('sheet failed:', e.stack || e);
}
window.__ready = true;
