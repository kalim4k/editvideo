import * as THREE from 'three';
import { screenTexture } from './ecran.js';
import { std, mesh, box, rbox, floorTexture, skyTexture } from './common.js';
import { SCALE, HIP_Y } from '../characters/toi.js';

// Bright living room: two armchairs side by side facing a big wall screen that shows what Claude is
// working on. Floor at y = 0, the screen is towards -z.

// Armchair facing +z, floor at y = 0, seat cushion top at SEAT_HEIGHT.
export const SEAT_HEIGHT = 12;
function armchair(innerWidth, color, shade) {
  const g = new THREE.Group();
  const fabric = std(color), cushion = std(shade), wood = std('#6b4a32');
  const W = innerWidth + 14;
  for (const x of [-W / 2 + 3, W / 2 - 3]) for (const z of [-10, 6]) g.add(mesh(box(2.4, 3, 2.4), wood, [x, 1.5, z]));
  g.add(mesh(rbox(W, 7, 20, 1.5), fabric, [0, 6.5, -2]));
  g.add(mesh(rbox(innerWidth + 0.6, 3, 15.5, 1.2), cushion, [0, SEAT_HEIGHT - 1.5, 1.7]));
  g.add(mesh(rbox(W, 28, 6, 2.2), fabric, [0, 17, -9]));
  for (const s of [-1, 1]) g.add(mesh(rbox(7, 18, 20, 2.2), fabric, [s * (innerWidth / 2 + 3.5), 12, -2]));
  return g;
}

export function buildSalon(scene, { screen = screenTexture() } = {}) {
  scene.background = new THREE.Color('#e9ddca');

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(500, 420), std('#ffffff', { map: floorTexture() }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 20;
  floor.receiveShadow = true;
  const wallMat = std('#eadfcc');
  const walls = [
    mesh(box(500, 220, 4), wallMat, [0, 110, -152]),
    mesh(box(500, 220, 4), wallMat, [0, 110, 170]),
    mesh(box(4, 220, 420), std('#e4d7c2'), [-222, 110, 20]),
    mesh(box(4, 220, 420), std('#e4d7c2'), [222, 110, 20]),
  ];
  const skirting = mesh(box(500, 5, 2), std('#f5efe4'), [0, 2.5, -149.5]);

  // TV wall: dark panel, big screen, low wooden console.
  const panel = mesh(box(190, 120, 2), std('#34404a'), [0, 66, -149]);
  const bezel = mesh(box(158, 92, 4), std('#121418', { roughness: 0.4 }), [0, 64, -146]);
  const display = new THREE.Mesh(new THREE.PlaneGeometry(152, 86), new THREE.MeshBasicMaterial({ map: screen, toneMapped: false }));
  display.position.set(0, 64, -143.9);
  const console_ = mesh(rbox(130, 14, 26, 1), std('#7a5436'), [0, 7, -132]);
  const consoleDoors = [-32, 32].map((x) => mesh(box(60, 9, 0.6), std('#6a4830'), [x, 7, -118.8]));

  // Rug, coffee table, plant, floor lamp.
  const rug = mesh(rbox(130, 0.8, 90, 0.4), std('#2f4a6b'), [0, 0.4, -10]);
  const rugBorder = mesh(rbox(120, 0.9, 80, 0.4), std('#3f5f86'), [0, 0.45, -10]);
  const table = [mesh(rbox(50, 2.5, 22, 1), std('#8a5f3c'), [0, 11, -55]), ...[[-22, -63], [22, -63], [-22, -47], [22, -47]].map(([x, z]) => mesh(box(2, 10, 2), std('#6b4a32'), [x, 5, z]))];
  const mug = mesh(new THREE.CylinderGeometry(1.8, 1.6, 4, 12), std('#f2ede4'), [-8, 14.3, -52]);
  const pot = mesh(new THREE.CylinderGeometry(6, 4.5, 11, 10), std('#c7714c'), [-68, 5.5, -18]);
  const leaves = [[0, 22, 0, 9], [-5, 18, 3, 6], [5, 19, -2, 7]].map(([x, y, z, r]) => mesh(new THREE.IcosahedronGeometry(r, 0), std('#4f8a4a', { flatShading: true }), [-68 + x, y, -18 + z]));
  const lampPole = mesh(new THREE.CylinderGeometry(0.8, 0.8, 70, 8), std('#2b2b2b'), [62, 35, -22]);
  const lampShade = mesh(new THREE.CylinderGeometry(7, 10, 11, 14, 1, true), std('#f3e2c0', { side: THREE.DoubleSide, emissive: '#ffdca0', emissiveIntensity: 0.35 }), [62, 72, -22]);
  const lampBase = mesh(new THREE.CylinderGeometry(6, 6, 1.5, 14), std('#2b2b2b'), [62, 0.8, -22]);

  // Back wall (seen in close-ups): window with daylight, bookshelf, frames.
  const windowFrame = mesh(box(70, 80, 3), std('#f7f3ea'), [-90, 95, 167]);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(62, 72), new THREE.MeshBasicMaterial({ map: skyTexture(), toneMapped: false }));
  glass.position.set(-90, 95, 165.3);
  glass.rotation.y = Math.PI;
  const shelfMat = std('#8a5f3c');
  const shelf = [mesh(box(80, 4, 14), shelfMat, [60, 60, 161]), mesh(box(80, 4, 14), shelfMat, [60, 92, 161])];
  const bookColors = ['#c25b3c', '#3f6e9c', '#e0b54a', '#5d8a5a', '#8c4f7a', '#2f3e57'];
  for (let s = 0; s < 2; s++) for (let b = 0; b < 10; b++) {
    const h = 14 + ((b * 7 + s * 3) % 7);
    shelf.push(mesh(box(5.2, h, 10), std(bookColors[(b + s * 2) % 6]), [28 + b * 6.5, 62 + s * 32 + h / 2, 160]));
  }
  const frames = [[-20, 110, '#d98c5f'], [10, 118, '#6f9fc0']].map(([x, y, c]) => mesh(box(18, 24, 1.5), std(c), [x, y, 167]));

  // Two armchairs side by side, slightly turned towards the screen.
  const seats = {};
  const place = (name, chair, x, rotY) => {
    const anchor = new THREE.Group();
    anchor.position.set(x, 0, 0);
    anchor.rotation.y = rotY;
    anchor.add(chair);
    seats[name] = anchor;
    scene.add(anchor);
  };
  place('toi', armchair(24, '#2e6e6a', '#3a8279'), -25, Math.PI - 0.15);
  place('claude', armchair(28, '#2e6e6a', '#3a8279'), 25, Math.PI + 0.15);

  // Bright daylight from the window side, soft fill, cool glow from the screen, warm lamp.
  const hemi = new THREE.HemisphereLight('#fff6ea', '#9c7a5c', 1.5);
  const sun = new THREE.DirectionalLight('#fff0d8', 2.3);
  sun.position.set(-160, 190, 110);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -220, right: 220, top: 200, bottom: -120, near: 1, far: 700 });
  sun.shadow.bias = -0.0004;
  const fill = new THREE.DirectionalLight('#e6eeff', 0.7);
  fill.position.set(120, 90, -160);
  const faceKey = new THREE.DirectionalLight('#fff2e2', 1.3); // lights the faces from the screen side
  faceKey.position.set(40, 120, -200);
  const screenGlow = new THREE.PointLight('#a8c8ff', 2500, 0, 2);
  screenGlow.position.set(0, 60, -120);
  const lamp = new THREE.PointLight('#ffc890', 2500, 0, 2);
  lamp.position.set(62, 70, -22);

  scene.add(floor, ...walls, skirting, panel, bezel, display, console_, ...consoleDoors, rug, rugBorder, ...table, mug, pot, ...leaves,
    lampPole, lampShade, lampBase, windowFrame, glass, ...shelf, ...frames, hemi, sun, fill, faceKey, screenGlow, lamp);
  return { display, seats };
}

// Sits the user's character in its armchair: thighs on the cushion, legs out over the edge,
// the big head just clear of the backrest.
export function seatToi(seats, toi) {
  toi.setPose('assis');
  toi.root.position.set(0, SEAT_HEIGHT - (HIP_Y - 1.6) * SCALE, 2);
  seats.toi.add(toi.root);
}

// Sits Claude in his armchair: body on the cushion, little legs stretched out.
export function seatClaude(seats, claude) {
  claude.setSeated(true);
  claude.root.position.set(0, SEAT_HEIGHT, 3.5);
  seats.claude.add(claude.root);
}
