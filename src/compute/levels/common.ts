import * as THREE from 'three';
import { addGlowAttribute, makeInstanceGlow } from '../../core/BaseLevel';

/** Key + rim + fill, the studio look of the main descent (green NVIDIA-ish rim). */
export function studioLights(scene: THREE.Scene, scale: number, rimColor: THREE.ColorRepresentation = 0x76b900) {
  scene.add(new THREE.HemisphereLight(0xe8eef5, 0x040506, 0.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(1.2 * scale, 2.4 * scale, 1.5 * scale);
  scene.add(key);
  const rim = new THREE.DirectionalLight(rimColor, 0.55);
  rim.position.set(-1.6 * scale, 0.6 * scale, -1.4 * scale);
  scene.add(rim);
}

/** Device-scale lighting as on the FinFET level: dark background, a little fog, glows carry the frame. */
export function deviceLights(scene: THREE.Scene, scale: number, fogDensity: number) {
  scene.background = new THREE.Color(0x020405);
  scene.fog = new THREE.FogExp2(0x020405, fogDensity);
  scene.environmentIntensity = 0.35;
  scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x050806, 0.18));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(0.6 * scale, 1 * scale, 0.9 * scale);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x4a78ff, 0.9);
  fill.position.set(-1 * scale, 0.15 * scale, 0.3 * scale);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0x76b900, 0.8);
  rim.position.set(-0.6 * scale, 0.4 * scale, -0.9 * scale);
  scene.add(rim);
}

/** A box by centre and size. */
export interface Box {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export function setBox(mesh: THREE.InstancedMesh, i: number, b: Box) {
  mesh.setMatrixAt(i, _m.compose(_p.set(b.x, b.y, b.z), _q, _s.set(b.w, b.h, b.d)));
}

/**
 * Many boxes in one draw call, each with its own glow (`glow.setX(i, v)`, then needsUpdate) and
 * optionally its own colour. The glow colour is added on top of the lit surface.
 */
export function glowBoxes(
  boxes: Box[],
  material: THREE.MeshStandardMaterial,
  glowColor: THREE.ColorRepresentation,
  colors?: THREE.ColorRepresentation[],
) {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    makeInstanceGlow(material, glowColor),
    boxes.length,
  );
  const c = new THREE.Color();
  boxes.forEach((b, i) => {
    setBox(mesh, i, b);
    if (colors) mesh.setColorAt(i, c.set(colors[i]));
  });
  return { mesh, glow: addGlowAttribute(mesh) };
}

/** Additive halo material for a glowing marker (the number moving through the datapath). */
export function haloMaterial(color: THREE.ColorRepresentation) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}
