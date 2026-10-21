import * as THREE from 'three';

// The renderer used for every frame: anti-aliased, soft shadows, filmic tone mapping.
export function createRenderer(width, height) {
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(width, height, false);
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.outputColorSpace = THREE.SRGBColorSpace;
  return r;
}
