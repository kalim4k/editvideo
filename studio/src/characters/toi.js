import * as THREE from 'three';
import { VoxelModel, hash3, joint } from '../voxel.js';

// Palette sampled from the reference photos, lifted slightly so near-black clothes still read in 3D.
export const COLORS = {
  skin: '#6e4636',
  skinShadow: '#533327',
  hair: '#1a1615',
  hairLight: '#2a2320',
  fade: '#3e2a22',
  brow: '#1a1210',
  eye: '#0f0a09',
  white: '#f5efe6',
  lips: '#47261f',
  mouthIn: '#24100d',
  teeth: '#efe9df',
  blush: '#8c4a44',
  nose: '#5a372a',
  lid: '#452a20',
  bag: '#57352f',
  sweat: '#7fc4e8',
  sweater: '#2e2e34',
  sweaterAlt: '#29292f',
  rib: '#222227',
  collar: '#3a3a42',
  pants: '#212126',
  shoe: '#19191d',
  sole: '#3e3e46',
  lace: '#2e2e34',
};

// Chibi voxel character (head ~40 % of the height), rendered in plain 3D like the rest of the scene.
// The model is ~34 voxels tall; SCALE sizes it next to Claude and the furniture.
export const SCALE = 1.3;
// Seated: legs forward from the hip joints (HIP_Y voxels above the feet), back against the backrest.
export const HIP_Y = 10;
export const BACK_DEPTH = 3;

// Head grid: x -7..6 (col = x+7), y 20..32 (row = 32-y), z -6..6, face on z = 6.
const HEAD = { x0: -7, y0: 20, z0: -6, w: 14, h: 13, d: 13 };
const FACE_Z = HEAD.z0 + HEAD.d - 1;
const FACE_ROWS = [4, 11]; // rows repainted by expressions
const col = (x) => x - HEAD.x0;
const row = (y) => HEAD.y0 + HEAD.h - 1 - y;

// Face pixel art, rows 4..11. '.' keeps the base skin.
// b brow, e eye, w eye highlight, l lid, g eye bag, k blush, n nose, m lips, o open mouth, t teeth, s sweat drop
export const EXPRESSIONS = {
  neutre: [
    '..............',
    '..bbb....bbb..',
    '...ew....ew...',
    '...ee....ee...',
    '...ee....ee...',
    '..kk..nn..kk..',
    '......mm......',
    '..............',
  ],
  content: [
    '..bbb....bbb..',
    '..............',
    '..............',
    '...ee....ee...',
    '..e..e..e..e..',
    '.kk...nn...kk.',
    '.....m..m.....',
    '......mm......',
  ],
  choque: [
    '..bbb....bbb..',
    '.............s',
    '...ew....ew..s',
    '...ee....ee...',
    '...ee....ee...',
    '......nn......',
    '......oo......',
    '......oo......',
  ],
  blase: [
    '..............',
    '..............',
    '..bbb....bbb..',
    '...ll....ll...',
    '...ee....ee...',
    '......nn......',
    '.....mmmm.....',
    '..............',
  ],
  fatigue: [
    '..............',
    '....b....b....',
    '..bb......bb..',
    '...ll....ll...',
    '...ee....ee...',
    '...gg.nn.gg...',
    '......mm......',
    '..............',
  ],
  enerve: [
    '..............',
    '..bb......bb..',
    '....b....b....',
    '...ew....ew...',
    '...ee....ee...',
    '......nn......',
    '......mm......',
    '.....m..m.....',
  ],
};

// Mouth shapes for lip sync (rows 10..11), level 1 = small open, 2 = wide open.
const MOUTHS = {
  1: ['......oo......', '..............'],
  2: ['.....mttm.....', '......oo......'],
};

const PIXEL = {
  b: COLORS.brow, e: COLORS.eye, w: COLORS.white, l: COLORS.lid, g: COLORS.bag, k: COLORS.blush,
  n: COLORS.nose, m: COLORS.lips, o: COLORS.mouthIn, t: COLORS.teeth, s: COLORS.sweat,
};

const hairPixel = (x, y, z) => (hash3(x, y, z) > 0.78 ? COLORS.hairLight : COLORS.hair);

// Fade: hair gets sparser over `rows` rows below `start`, randomly so it doesn't look like a checkerboard.
function fade(x, y, z, r, start, rows) {
  const p = 1 - (r - start + 1) / (rows + 1);
  return hash3(x * 3.1, y * 1.7, z * 2.3) < p ? COLORS.hair : COLORS.fade;
}

function headBase(x, y, z) {
  const c = col(x), r = row(y);
  const x1 = HEAD.x0 + HEAD.w - 1, y1 = HEAD.y0 + HEAD.h - 1;
  const edgeX = x === HEAD.x0 || x === x1, edgeZ = z === HEAD.z0 || z === FACE_Z;
  if ((edgeX && edgeZ) || (y === HEAD.y0 && (edgeX || edgeZ))) return null; // rounded corners and jaw
  if (y === y1) return hairPixel(x, y, z);
  if (z === FACE_Z) {
    if (r <= 2) return hairPixel(x, y, z);
    if (r === 3 && (c <= 1 || c >= 12)) return COLORS.hair; // crisp line-up at the temples
    if (r === 4 && (c === 1 || c === 12)) return COLORS.hair;
    return COLORS.skin;
  }
  if (z === HEAD.z0) {
    if (r <= 6) return hairPixel(x, y, z);
    if (r <= 9) return fade(x, y, z, r, 7, 3); // low fade on the nape
    return COLORS.skin;
  }
  if (edgeX) {
    if (r <= 3) return hairPixel(x, y, z);
    if (r <= 6) return fade(x, y, z, r, 4, 3);
    return COLORS.skin;
  }
  return y === HEAD.y0 ? COLORS.skinShadow : COLORS.skin;
}

// A layer of hair on top of the head, inset by `inset`, with ragged edges so the dome reads organic.
function hairLayer(inset, ragged) {
  const x0 = HEAD.x0 + inset, x1 = HEAD.x0 + HEAD.w - 1 - inset, z0 = HEAD.z0 + inset, z1 = FACE_Z - inset;
  return (x, y, z) => {
    const ex = x === x0 || x === x1, ez = z === z0 || z === z1;
    if (ex && ez) return null;
    if ((ex || ez) && hash3(x, y, z) < ragged) return null;
    return hairPixel(x, y, z);
  };
}

function buildHead() {
  const v = new VoxelModel();
  v.box(HEAD.x0, HEAD.y0, HEAD.z0, HEAD.w, HEAD.h, HEAD.d, headBase);
  // Short cut: flush on the sides (the fade is painted on the head), a little volume on top.
  v.box(HEAD.x0 + 1, HEAD.y0 + HEAD.h, HEAD.z0 + 1, HEAD.w - 2, 1, HEAD.d - 2, hairLayer(1, 0.25));
  v.box(HEAD.x0 + 2, HEAD.y0 + HEAD.h + 1, HEAD.z0 + 2, HEAD.w - 4, 1, HEAD.d - 4, hairLayer(2, 0.35));
  v.box(-8, 24, 0, 1, 3, 2, COLORS.skin); // ears, tucked under the hair shell
  v.box(7, 24, 0, 1, 3, 2, COLORS.skin);
  return v;
}

const knit = (x, y) => ((x + y) % 3 === 0 ? COLORS.sweaterAlt : COLORS.sweater);

function buildTorso() {
  const v = new VoxelModel();
  v.box(-5, 10, -3, 10, 9, 6, (x, y, z) => {
    if (y === 10) return x % 2 === 0 ? COLORS.rib : COLORS.sweater; // ribbed hem
    const collarRing = y === 18 && x >= -3 && x < 3 && z >= -2;
    const collarDip = y === 17 && z === 2 && x >= -2 && x < 2;
    if (collarRing || collarDip) return COLORS.collar;
    return knit(x, y);
  });
  v.box(-2, 19, -2, 4, 1, 4, COLORS.skinShadow); // neck
  return v;
}

function buildArm(x0) {
  const v = new VoxelModel();
  v.box(x0, 11, -1, 3, 8, 3, (x, y) => (y === 11 ? COLORS.rib : knit(x, y)));
  v.box(x0, 9, -1, 3, 2, 3, COLORS.skin);
  return v;
}

function buildLeg(x0) {
  const v = new VoxelModel();
  v.box(x0, 2, -2, 4, 8, 4, COLORS.pants);
  v.box(x0, 0, -2, 4, 2, 5, (x, y, z) => {
    if (y === 0) return COLORS.sole;
    if (z >= 0 && z <= 1 && x > x0 && x < x0 + 3) return COLORS.lace;
    return COLORS.shoe;
  });
  return v;
}

// Pose angles in radians: arms [x, y, z] (x < 0 raises forward), legs x, lean of the upper body.
export const POSES = {
  repos: { armR: [0, 0, -0.14], armL: [0, 0, 0.14], leg: 0, lean: 0 },
  assis: { armR: [-0.35, 0, -0.12], armL: [-0.35, 0, 0.12], leg: -1.45, lean: -0.06 },
};

// Returns the rigged character. Units: 1 = one voxel (before SCALE), feet at y = 0, facing +z.
export function createToi() {
  const root = new THREE.Group();
  root.name = 'toi';
  root.scale.setScalar(SCALE);

  const head = buildHead().build({ pivot: [0, 20, 0.5] });
  const torso = buildTorso().build({ pivot: [0, 10, 0] });
  const armR = buildArm(-8).build({ pivot: [-6.5, 18.5, 0.5] });
  const armL = buildArm(5).build({ pivot: [6.5, 18.5, 0.5] });
  const legR = buildLeg(-5).build({ pivot: [-3, 10, 0] });
  const legL = buildLeg(1).build({ pivot: [3, 10, 0] });

  const hips = joint(torso, [0, 10, 0]);
  const rig = {
    hips,
    head: joint(head, [0, 10, 0.5]),
    armR: joint(armR, [-6.5, 8.5, 0.5]),
    armL: joint(armL, [6.5, 8.5, 0.5]),
    legR: joint(legR, [-3, 10, 0]),
    legL: joint(legL, [3, 10, 0]),
  };
  hips.add(rig.head, rig.armR, rig.armL);
  root.add(hips, rig.legR, rig.legL);

  const state = { expression: 'neutre', mouth: 0, blink: false };
  const paint = head.userData.paint;

  function repaint() {
    const grid = [...EXPRESSIONS[state.expression]];
    if (state.mouth) {
      grid[6] = MOUTHS[state.mouth][0];
      grid[7] = MOUTHS[state.mouth][1];
    }
    const eyesOpen = grid[4][3] === 'e'; // "^ ^" happy eyes have nothing to blink
    for (let r = FACE_ROWS[0]; r <= FACE_ROWS[1]; r++) {
      let line = grid[r - FACE_ROWS[0]];
      if (state.blink && eyesOpen && r >= 6 && r <= 8) line = r === 8 ? '...ee....ee...' : line.replace(/[ewl]/g, '.');
      for (let c = 0; c < HEAD.w; c++) {
        const x = c + HEAD.x0, y = HEAD.y0 + HEAD.h - 1 - r;
        paint(x, y, FACE_Z, PIXEL[line[c]] || headBase(x, y, FACE_Z));
      }
    }
  }

  function setPose(name) {
    const p = POSES[name];
    rig.armR.rotation.set(...p.armR);
    rig.armL.rotation.set(...p.armL);
    rig.legR.rotation.x = rig.legL.rotation.x = p.leg;
    hips.rotation.x = p.lean;
  }

  repaint();
  setPose('repos');
  return {
    root,
    rig,
    setExpression(name) { state.expression = name; repaint(); },
    setMouth(level) { state.mouth = level; repaint(); },
    setBlink(on) { state.blink = on; repaint(); },
    setPose,
  };
}
