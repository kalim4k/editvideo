import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture } from './ecran.js';

// Building blocks shared by the sets. Units: the user's character is ~44 tall standing.

export const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });

export function mesh(geometry, material, [x, y, z]) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const rbox = (w, h, d, r = 1.5) => new RoundedBoxGeometry(w, h, d, 3, r);

export function floorTexture() {
  const t = canvasTexture(256, 256, (g) => {
    const tones = ['#c08f62', '#b5845a', '#c99a6c', '#b98a5e'];
    for (let i = 0; i < 8; i++) {
      g.fillStyle = tones[i % 4]; g.fillRect(0, i * 32, 256, 32);
      g.fillStyle = '#8f6643'; g.fillRect(0, i * 32 + 31, 256, 1); g.fillRect((i * 97) % 256, i * 32, 1, 31);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 5);
  return t;
}

export function skyTexture() {
  return canvasTexture(128, 160, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#9fd0ff'); grad.addColorStop(1, '#e8f4ff');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(40, 50, 26, 10, 0, 0, 7); g.ellipse(70, 46, 22, 12, 0, 0, 7); g.fill();
    g.fillStyle = '#7fae6a'; g.fillRect(0, 130, w, 30);
  });
}
