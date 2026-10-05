import * as THREE from 'three';
import type { Level, LevelContext, LevelMeta, TransitionTarget } from './types';
import { CameraRig, type CameraKey } from './CameraRig';
import { disposeObject } from './dispose';

/**
 * Convenience base for levels: owns a scene, a camera rig, and generic disposal.
 * Subclasses implement build() / animate() and declare their camera keys.
 */
export abstract class BaseLevel implements Level {
  abstract readonly meta: LevelMeta;
  readonly scene = new THREE.Scene();
  caption = '';
  bloom = 1;
  bokeh = 1.5;

  protected rig!: CameraRig;
  protected readonly lookAt = new THREE.Vector3();
  /** Near / far planes in local units. */
  protected near = 0.1;
  protected far = 1000;
  protected fov = 40;

  constructor(protected ctx: LevelContext) {}

  protected abstract build(): void;
  protected abstract cameraKeys(): CameraKey[];
  protected abstract animate(t: number, dt: number, time: number): void;
  abstract getTransitionTarget(): TransitionTarget;

  init() {
    this.scene.background = new THREE.Color(0x04070a);
    this.scene.environment = this.ctx.envMap;
    this.rig = new CameraRig(this.cameraKeys());
    this.build();
  }

  update(t: number, dt: number, time: number) {
    const cam = this.ctx.camera;
    const fov = fovForAspect(this.fov, cam.aspect);
    if (cam.near !== this.near || cam.far !== this.far || cam.fov !== fov) {
      cam.near = this.near;
      cam.far = this.far;
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    this.rig.apply(cam, t);
    this.lookAt.copy(this.rig.look);
    this.animate(t, dt, time);
  }

  getLookAt() {
    return this.lookAt;
  }

  getFocus() {
    return this.lookAt;
  }

  dispose() {
    disposeObject(this.scene, new Set([this.ctx.envMap]));
    this.scene.clear();
  }
}

/**
 * Camera paths are framed for landscape screens. On narrower (portrait) screens widen the
 * vertical FOV so the horizontal FOV stays what it would be at a 1.3 aspect ratio.
 */
export function fovForAspect(fov: number, aspect: number) {
  const ref = 1.3;
  if (aspect >= ref) return fov;
  const h = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) * ref);
  const v = 2 * Math.atan(Math.tan(h / 2) / aspect);
  return Math.min(THREE.MathUtils.radToDeg(v), 80);
}

/**
 * Patch a standard material so InstancedMesh instances can glow individually via a
 * per-instance `aGlow` float attribute (0..n) multiplied by glowColor.
 */
export function makeInstanceGlow<T extends THREE.MeshStandardMaterial>(
  material: T,
  glowColor: THREE.ColorRepresentation,
): T {
  const color = new THREE.Color(glowColor);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGlowColor = { value: color };
    shader.vertexShader =
      'attribute float aGlow;\nvarying float vGlow;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGlow = aGlow;');
    shader.fragmentShader =
      'uniform vec3 uGlowColor;\nvarying float vGlow;\n' +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance += uGlowColor * vGlow;',
      );
  };
  material.customProgramCacheKey = () => 'instance-glow';
  return material;
}

/** Attach a zeroed per-instance glow attribute to an InstancedMesh's geometry. */
export function addGlowAttribute(mesh: THREE.InstancedMesh) {
  const attr = new THREE.InstancedBufferAttribute(new Float32Array(mesh.count), 1);
  attr.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute('aGlow', attr);
  return attr;
}
