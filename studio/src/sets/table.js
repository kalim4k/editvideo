import * as THREE from 'three';
import { std, mesh, box, rbox, floorTexture, skyTexture } from './common.js';
import { SCALE, HIP_Y } from '../characters/toi.js';

// Face-to-face set, after the "explain it like I'm five" shorts: you at a wooden table, Claude sitting on a
// stack of books in front of you, and a whiteboard on an easel that works as the screen. The board shows
// real screen recordings (Claude's chat, the game, the AdSense dashboard...). Floor at y = 0.

export const TABLE_TOP = 26;
const CHAIR_SEAT = 14;
const BOOKS = 6;
const BOARD = { w: 80, h: 45 }; // 16:9, like the recordings once the browser bar is cropped

// Whiteboard surface: shows an image (a screen-recording frame) edge to edge, plain white when empty.
export function createBoard(w = 2048, h = 1152) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  function show(image) {
    g.fillStyle = '#f7f7f4';
    g.fillRect(0, 0, w, h);
    if (image) {
      const k = Math.min(w / image.width, h / image.height);
      g.drawImage(image, (w - image.width * k) / 2, (h - image.height * k) / 2, image.width * k, image.height * k);
    }
    texture.needsUpdate = true;
  }
  show(null);
  return { texture, show };
}

// Wooden chair facing +z.
function chair() {
  const g = new THREE.Group();
  const wood = std('#8a5a36');
  g.add(mesh(rbox(20, 2, 18, 0.6), wood, [0, CHAIR_SEAT - 1, 0]));
  for (const x of [-8.5, 8.5]) for (const z of [-7.5, 7.5]) g.add(mesh(box(1.6, CHAIR_SEAT - 2, 1.6), wood, [x, (CHAIR_SEAT - 2) / 2, z]));
  for (const x of [-8.5, 8.5]) g.add(mesh(box(1.6, 12, 1.6), wood, [x, CHAIR_SEAT + 6, -7.5]));
  g.add(mesh(rbox(19, 5, 1.6, 0.6), wood, [0, CHAIR_SEAT + 9.5, -7.5]));
  return g;
}

// Whiteboard on a tripod easel, facing +z, board centre at `height`.
function easel(texture, height) {
  const g = new THREE.Group();
  const frame = mesh(rbox(BOARD.w + 4, BOARD.h + 4, 2, 0.8), std('#d9dde2', { roughness: 0.4 }), [0, height, 0]);
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.w, BOARD.h), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  surface.position.set(0, height, 1.05);
  const tray = mesh(box(BOARD.w * 0.8, 1.2, 4), std('#c9ced4'), [0, height - BOARD.h / 2 - 2.6, 2]);
  const marker = mesh(new THREE.CylinderGeometry(0.6, 0.6, 6, 8), std('#2f6fd6'), [-20, height - BOARD.h / 2 - 1.4, 2.4]);
  marker.rotation.z = Math.PI / 2;
  const wood = std('#6b4a32');
  const leg = (x, z, tiltX, tiltZ) => {
    const l = mesh(new THREE.CylinderGeometry(0.9, 0.9, height + 22, 8), wood, [x, (height + 22) / 2 - 1, z]);
    l.rotation.set(tiltX, 0, tiltZ);
    return l;
  };
  g.add(frame, surface, tray, marker, leg(-26, 0, 0, -0.1), leg(26, 0, 0, 0.1), leg(0, -12, 0.2, 0));
  return { group: g, surface };
}

export function buildTable(scene, { board = createBoard() } = {}) {
  scene.background = new THREE.Color('#e9ddca');

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), std('#ffffff', { map: floorTexture() }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const wallMat = std('#eadfcc');
  const walls = [
    mesh(box(420, 200, 4), wallMat, [0, 100, -110]),
    mesh(box(4, 200, 420), std('#e4d7c2'), [-130, 100, 0]),
    mesh(box(4, 200, 420), std('#e4d7c2'), [150, 100, 0]),
    mesh(box(420, 200, 4), wallMat, [0, 100, 150]),
  ];

  // Back wall: big window with daylight; bookshelf on the left wall; frames and a plant.
  const windowFrame = mesh(box(96, 78, 3), std('#f7f3ea'), [45, 92, -107]);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(88, 70), new THREE.MeshBasicMaterial({ map: skyTexture(), toneMapped: false }));
  glass.position.set(45, 92, -105.3);
  const mullion = [mesh(box(2, 70, 1.5), std('#f7f3ea'), [45, 92, -105]), mesh(box(88, 2, 1.5), std('#f7f3ea'), [45, 92, -105])];
  const shelfMat = std('#8a5f3c');
  const shelf = [0, 30, 60].map((y) => mesh(box(14, 3, 70), shelfMat, [-121, 40 + y, -40]));
  const bookColors = ['#c25b3c', '#3f6e9c', '#e0b54a', '#5d8a5a', '#8c4f7a', '#2f3e57'];
  for (let s = 0; s < 3; s++) for (let b = 0; b < 9; b++) {
    const h = 13 + ((b * 7 + s * 3) % 7);
    shelf.push(mesh(box(10, h, 5.6), std(bookColors[(b + s * 2) % 6]), [-120, 41.5 + s * 30 + h / 2, -66 + b * 6.6]));
  }
  const frames = [[100, 95, '#6f9fc0'], [118, 80, '#d98c5f']].map(([z, y, c]) => mesh(box(1.5, 22, 18), std(c), [148, y, z]));
  const pot = mesh(new THREE.CylinderGeometry(7, 5.5, 13, 10), std('#c7714c'), [-100, 6.5, -88]);
  const leaves = [[0, 26, 0, 11], [-6, 21, 4, 7], [6, 22, -3, 8]].map(([x, y, z, r]) =>
    mesh(new THREE.IcosahedronGeometry(r, 0), std('#4f8a4a', { flatShading: true }), [-100 + x, y, -88 + z]));
  const rug = mesh(rbox(150, 0.8, 110, 0.4), std('#2f4a6b'), [0, 0.4, 5]);

  // Table with a few props, as in the reference.
  const wood = std('#a06b42');
  const table = [
    mesh(rbox(112, 2.5, 60, 0.8), wood, [0, TABLE_TOP - 1.25, 0]),
    ...[[-52, -26], [52, -26], [-52, 26], [52, 26]].map(([x, z]) => mesh(box(3, TABLE_TOP - 2.5, 3), std('#7a5032'), [x, (TABLE_TOP - 2.5) / 2, z])),
    mesh(new THREE.CylinderGeometry(2.4, 2.1, 5.5, 14), std('#f2ede4'), [18, TABLE_TOP + 2.75, -14]),
    mesh(new THREE.CylinderGeometry(2.2, 2.2, 6, 12), std('#2f5f57'), [-40, TABLE_TOP + 3, 14]),
    mesh(rbox(16, 1.2, 11, 0.3), std('#e98aa6'), [10, TABLE_TOP + 0.6, 12]),
  ];
  for (const [dx, c] of [[-0.6, '#d94a3a'], [0.6, '#3a6fd9'], [0, '#e8c34a']]) {
    const pen = mesh(new THREE.CylinderGeometry(0.35, 0.35, 9, 6), std(c), [-40 + dx, TABLE_TOP + 7, 14 + dx]);
    pen.rotation.z = dx * 0.3;
    table.push(pen);
  }

  // Claude's books, his spot and yours, turned towards each other.
  const claudeSpot = new THREE.Group();
  claudeSpot.position.set(-16, TABLE_TOP, -8);
  const toiSpot = new THREE.Group();
  toiSpot.position.set(42, 0, 38);
  const face = (a, b) => Math.atan2(b.position.x - a.position.x, b.position.z - a.position.z);
  claudeSpot.rotation.y = face(claudeSpot, toiSpot);
  toiSpot.rotation.y = face(toiSpot, claudeSpot);
  [['#4f8a4a', 0.06], ['#7b4f9c', -0.05]].forEach(([c, r], i) => {
    const book = mesh(rbox(28, BOOKS / 2, 22, 0.5), std(c), [0, BOOKS / 4 + (i * BOOKS) / 2, 0]);
    book.rotation.y = r;
    claudeSpot.add(book);
  });
  toiSpot.add(chair());

  const { group: easelGroup, surface } = easel(board.texture, 72);
  easelGroup.position.set(-50, 0, -50);
  easelGroup.rotation.y = 0.55;

  // Bright daylight from the window, a soft key on your face from Claude's side.
  const hemi = new THREE.HemisphereLight('#fff6ea', '#9c7a5c', 1.5);
  const sun = new THREE.DirectionalLight('#fff0d8', 2.2);
  sun.position.set(90, 190, -170);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -160, right: 160, top: 160, bottom: -120, near: 1, far: 600 });
  sun.shadow.bias = -0.0004;
  const fill = new THREE.DirectionalLight('#e6eeff', 0.8);
  fill.position.set(160, 90, 160);
  const faceKey = new THREE.DirectionalLight('#fff2e2', 1.1);
  faceKey.position.set(-120, 110, -60);

  scene.add(floor, ...walls, windowFrame, glass, ...mullion, ...shelf, ...frames, pot, ...leaves, rug, ...table,
    claudeSpot, toiSpot, easelGroup, hemi, sun, fill, faceKey);
  return { board: surface, spots: { claude: claudeSpot, toi: toiSpot } };
}

// You on the chair, legs under the table.
export function seatToiAtTable(spots, toi) {
  toi.setPose('assis');
  toi.root.position.set(0, CHAIR_SEAT - (HIP_Y - 1.6) * SCALE, -2.5);
  spots.toi.add(toi.root);
}

// Claude sitting on his books, little legs over the edge.
export function seatClaudeOnBooks(spots, claude) {
  claude.setSeated(true);
  claude.root.position.set(0, BOOKS, -2);
  spots.claude.add(claude.root);
}

// A thin pointer held in Claude's side nub; aim(point) turns it towards a point of the board (world space).
export function givePointer(claude, length = 34) {
  const geometry = new THREE.CylinderGeometry(0.3, 0.45, length, 8);
  geometry.rotateX(Math.PI / 2).translate(0, 0, length / 2);
  const stick = new THREE.Mesh(geometry, std('#f1e3c6'));
  stick.castShadow = true;
  stick.position.set(14, 9.5, 1);
  claude.rig.body.add(stick);
  return {
    stick,
    aim(point) { stick.parent.updateWorldMatrix(true, false); stick.lookAt(point); },
  };
}
