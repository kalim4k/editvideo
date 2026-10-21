import * as THREE from 'three';

// Stable pseudo-random value in [0,1) per voxel, so the "pixel" texture never flickers between frames.
export function hash3(x, y, z) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

const key = (x, y, z) => `${x},${y},${z}`;

// A set of unit voxels in integer grid coordinates. Each part of a character is one VoxelModel
// built into one InstancedMesh, positioned relative to its joint (pivot) so it can rotate.
export class VoxelModel {
  constructor() {
    this.voxels = new Map();
  }

  set(x, y, z, color, tag) {
    this.voxels.set(key(x, y, z), { x, y, z, color, tag });
  }

  // Fill a box [x0,x0+w) x [y0,y0+h) x [z0,z0+d). `color` may be a function (x,y,z) => color | null.
  box(x0, y0, z0, w, h, d, color, tag) {
    for (let x = x0; x < x0 + w; x++)
      for (let y = y0; y < y0 + h; y++)
        for (let z = z0; z < z0 + d; z++) {
          const c = typeof color === 'function' ? color(x, y, z) : color;
          if (c) this.set(x, y, z, c, tag);
        }
  }

  has(x, y, z) {
    return this.voxels.has(key(x, y, z));
  }

  // Builds the mesh. Hidden interior voxels are skipped. `pivot` is in grid coordinates.
  build({ pivot = [0, 0, 0], jitter = 0.07, roughness = 0.85, castShadow = true } = {}) {
    const visible = [...this.voxels.values()].filter(({ x, y, z }) =>
      !(this.has(x + 1, y, z) && this.has(x - 1, y, z) && this.has(x, y + 1, z) &&
        this.has(x, y - 1, z) && this.has(x, y, z + 1) && this.has(x, y, z - 1)));

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ roughness, metalness: 0, flatShading: true });
    const mesh = new THREE.InstancedMesh(geometry, material, visible.length);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;

    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const index = new Map();
    visible.forEach((v, i) => {
      m.makeTranslation(v.x + 0.5 - pivot[0], v.y + 0.5 - pivot[1], v.z + 0.5 - pivot[2]);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, shade(c, v.color, v.x, v.y, v.z, jitter));
      index.set(key(v.x, v.y, v.z), i);
    });
    mesh.instanceColor.needsUpdate = true;

    // Recolor voxels in place (facial expressions, blinks, mouth shapes).
    mesh.userData.paint = (x, y, z, color) => {
      const i = index.get(key(x, y, z));
      if (i === undefined) return;
      mesh.setColorAt(i, shade(c, color, x, y, z, jitter));
      mesh.instanceColor.needsUpdate = true;
    };
    return mesh;
  }
}

function shade(target, color, x, y, z, jitter) {
  target.set(color);
  const k = 1 + (hash3(x, y, z) - 0.5) * 2 * jitter;
  return target.multiplyScalar(k);
}

// Wraps a mesh in a group placed at the joint, so rotating the group rotates the part around it.
export function joint(mesh, pivot) {
  const g = new THREE.Group();
  g.position.set(...pivot);
  g.add(mesh);
  return g;
}
