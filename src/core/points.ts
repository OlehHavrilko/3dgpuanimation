import * as THREE from 'three';

/** Pixels per world unit at distance 1 — multiply by size / viewDistance for attenuated point sprites. */
export function pointScale(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) {
  const h = renderer.domElement.height;
  return h / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
}
