import * as THREE from 'three';
import { QUALITY } from './quality';

/**
 * Pixels per world unit at distance 1 — multiply by size / viewDistance for attenuated point
 * sprites. The device tier's `pointBudget` scales every sprite down on weaker GPUs, where the
 * additive point clouds are fill-rate bound.
 */
export function pointScale(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) {
  const h = renderer.domElement.height;
  return (h / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) * QUALITY.pointBudget;
}
