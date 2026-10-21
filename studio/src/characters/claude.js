import * as THREE from 'three';

// Claude as in the reference shorts: a smooth orange block with brows, highlighted eyes, side nubs and
// four long legs. Not pixelated: only the user's character is. Units match toi.js (toi is 60 tall).
export const COLORS = {
  body: '#dc7a40',
  brow: '#b4572c',
  eye: '#2a120a',
  shine: '#f3d9cc',
  blush: '#f2897a',
};

const B = { w: 25, h: 21, d: 19, legs: 11 };

export const EXPRESSIONS = {
  neutre: 'Neutre',
  content: 'Content',
  surpris: 'Surpris',
  blase: 'Blasé',
  inquiet: 'Inquiet',
  malicieux: 'Malicieux',
  endormi: 'Endormi',
};

const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.78, flatShading: true });

function block(w, h, d, color, [x, y, z]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// Returns the rigged mascot, feet at y = 0, facing +z.
export function createClaude() {
  const root = new THREE.Group();
  root.name = 'claude';

  // Body pivots at its bottom so talking can squash/stretch it.
  const body = new THREE.Group();
  body.position.y = B.legs;
  body.add(block(B.w, B.h, B.d, COLORS.body, [0, B.h / 2, 0]));
  for (const s of [-1, 1]) {
    const nub = block(4, 5, 5, COLORS.body, [s * (B.w / 2 + 1.6), B.h * 0.45, 1]);
    nub.rotation.z = s * 0.25;
    body.add(nub);
  }

  const legs = [-8.5, -3, 3, 8.5].map((x) => {
    const hip = new THREE.Group();
    hip.position.set(x, B.legs, 0);
    hip.add(block(3.4, B.legs, 3.4, COLORS.body, [0, -B.legs / 2, 0]));
    root.add(hip);
    return hip;
  });

  const fz = B.d / 2 + 0.15, eyeY = B.h * 0.55;
  const face = new THREE.Group();
  face.position.set(0, eyeY, fz);
  body.add(face);
  const eyes = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.position.set(s * 4.2, 0, 0);
    g.add(block(1.9, 3.8, 0.5, COLORS.eye, [0, 0, 0]));
    g.add(block(0.55, 0.75, 0.3, COLORS.shine, [-0.4, 1.1, 0.25]));
    face.add(g);
    return g;
  });
  const arcs = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.position.set(s * 4.2, 0.3, 0);
    for (const k of [-1, 1]) {
      const stroke = block(1.9, 0.6, 0.5, COLORS.eye, [k * 0.7, 0, 0]);
      stroke.rotation.z = -k * 0.65;
      g.add(stroke);
    }
    face.add(g);
    return g;
  });
  const brows = [-1, 1].map((s) => {
    const b = block(4, 1.2, 1.2, COLORS.brow, [s * 4.2, 3.6, 0.3]);
    face.add(b);
    return b;
  });
  const blush = [-1, 1].map((s) => {
    const b = block(2.6, 1.1, 0.25, COLORS.blush, [s * 6.6, -2.6, 0.1]);
    face.add(b);
    return b;
  });
  root.add(body);

  // Per expression: eye height scale, eye y offset, brow raise, brow tilt (inner up > 0), happy arcs, blush.
  const SHAPES = {
    neutre: { eye: 1, eyeY: 0, raise: 0, tilt: 0 },
    content: { arcs: true, raise: 0.8, tilt: 0, blush: true },
    surpris: { eye: 1.25, eyeY: 0.2, raise: 1.6, tilt: 0 },
    blase: { eye: 0.45, eyeY: -0.9, raise: -1.1, tilt: 0 },
    inquiet: { eye: 1, eyeY: 0, raise: 0.6, tilt: 0.35 },
    malicieux: { eye: 0.7, eyeY: -0.4, raise: 0, tilt: 0, asym: true, blush: true },
    endormi: { eye: 0.15, eyeY: -1.2, raise: -0.6, tilt: 0 },
  };

  let blinking = false;
  let current = 'neutre';
  function apply() {
    const p = SHAPES[current];
    eyes.forEach((e) => {
      e.visible = !p.arcs;
      e.scale.y = blinking && !p.arcs ? 0.12 : (p.eye ?? 1);
      e.position.y = p.eyeY ?? 0;
    });
    arcs.forEach((a) => { a.visible = !!p.arcs; });
    brows.forEach((b, i) => {
      const s = i === 0 ? -1 : 1;
      b.position.y = 3.6 + p.raise + (p.asym ? (i === 0 ? 1.2 : -0.6) : 0);
      b.rotation.z = -s * p.tilt;
    });
    blush.forEach((b) => { b.visible = !!p.blush; });
  }

  let baseY = B.legs;
  apply();
  return {
    root,
    rig: { body, legs, face },
    setExpression(name) { current = name; apply(); },
    setBlink(on) { blinking = on; apply(); },
    // Speaking: a little squash and bounce driven by voice loudness (0..1).
    setTalk(level) {
      body.scale.set(1 + level * 0.03, 1 - level * 0.05, 1 + level * 0.03);
      body.position.y = baseY + level * 0.8;
    },
    // Seated: body rests on the cushion (root at cushion height), legs stretched out in front.
    setSeated(on) {
      baseY = on ? 0 : B.legs;
      body.position.y = baseY;
      legs.forEach((hip) => {
        hip.position.y = on ? 1.7 : B.legs;
        hip.position.z = on ? B.d / 2 - 2 : 0;
        hip.rotation.x = on ? -1.2 : 0; // forward and a little down, over the cushion edge
      });
    },
  };
}
