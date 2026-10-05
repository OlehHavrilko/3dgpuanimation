import type * as THREE from 'three';

/** Shared services handed to every level. Owned by the app, never disposed by a level. */
export interface LevelContext {
  renderer: THREE.WebGLRenderer;
  /** Single camera shared by all levels; each level drives it in its own local units. */
  camera: THREE.PerspectiveCamera;
  /** PMREM environment map shared across scenes (do not dispose from a level). */
  envMap: THREE.Texture;
}

export interface LevelMeta {
  /** Display name, e.g. "Graphics card". */
  name: string;
  /** Representative scale label, e.g. "30 cm". */
  scale: string;
  /** One-line description shown under the name. */
  description: string;
  /** How many metres one local scene unit represents (drives the live field-of-view readout). */
  unitMeters: number;
  /** Relative share of the scroll timeline. */
  weight: number;
}

export interface TransitionTarget {
  /** World-space centre (in this level's units) the camera dives into. */
  position: THREE.Vector3;
  /** Approximate radius of the target object; the dive ends well inside this radius. */
  radius: number;
  /** Optional unit direction (target -> camera) the dive should finish on. */
  approach?: THREE.Vector3;
}

/** Common interface for every scale level. */
export interface Level {
  readonly meta: LevelMeta;
  readonly scene: THREE.Scene;
  /** Build geometry and materials. Called once right before the level becomes active. */
  init(): void;
  /**
   * Advance to local content time t in [0, 1]. The level positions the shared camera.
   * dt / time are wall-clock seconds for continuous motion (spinning fans, electrons...).
   */
  update(t: number, dt: number, time: number): void;
  /** Free all GPU resources. The level instance is discarded afterwards. */
  dispose(): void;
  /** What the camera dives into to reach the next level. */
  getTransitionTarget(): TransitionTarget;
  /** Point the camera is currently looking at (used to start the dive smoothly). */
  getLookAt(): THREE.Vector3;
  /** Optional world-space point to keep in depth-of-field focus. */
  getFocus?(): THREE.Vector3;
  /** Short contextual caption for the current t ("Heat pipes: 6 × 8 mm"...). */
  caption: string;
  /** Bloom intensity multiplier for this level. */
  bloom?: number;
  /** Depth of field bokeh scale for this level (0 disables). */
  bokeh?: number;
}

export type LevelFactory = (ctx: LevelContext) => Level;
