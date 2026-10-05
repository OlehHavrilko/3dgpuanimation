import type * as THREE from 'three';

/** Shared services handed to every level. Owned by the app, never disposed by a level. */
export interface LevelContext {
  renderer: THREE.WebGLRenderer;
  /** Single camera shared by all levels; each level drives it in its own local units. */
  camera: THREE.PerspectiveCamera;
  /** PMREM environment map shared across scenes (do not dispose from a level). */
  envMap: THREE.Texture;
  /** Shared view state. freeCamera = Explore mode: the user drives the camera, levels must not. */
  view: { freeCamera: boolean };
  /** Cross-level story state that survives scene swaps. */
  journey: Journey;
  /** Fly to another scale (scrolls there, passing through each dive). */
  go: (levelIndex: number) => void;
  /** Start a signal trace from GDDR7 chip n; runs on levelIndex (jumping there if needed). */
  trace: (chip: number, levelIndex: number) => void;
}

export interface Journey {
  /** Signal trace in progress: which GDDR7 chip (0..15) the data comes from. */
  trace: { chip: number } | null;
  /** Guided "follow the electron" tour is running. */
  follow: boolean;
}

/** A button shown in the inspector for an entity (e.g. "Trace signal"). */
export interface EntityAction {
  label: string;
  run: () => void;
}

/** Human-facing metadata for anything the user can hover or select. */
export interface EntityInfo {
  title: string;
  /** Category line, e.g. "Memory · GDDR7". */
  kind: string;
  /** Label/value rows for the inspector. The first two also appear in the hover tooltip. */
  specs?: [string, string][];
  /** One or two sentences of context for the inspector. */
  note?: string;
  /** Extra inspector buttons for this entity. */
  actions?: EntityAction[];
}

/** A resolved hover/selection target. */
export interface PickHit {
  /** Stable key so the UI can tell when the target changes. */
  key: string;
  info: EntityInfo;
  /** World-space bounds (level units): used for the bracket, spotlight and camera focus. */
  box: THREE.Box3;
  /** The scene object behind it (kept solid when X-Ray isolates the selection). */
  object?: THREE.Object3D;
}

/** Something in a level the raycaster may hit. */
export interface Pickable {
  object: THREE.Object3D;
  /** Turn a raycast intersection into an entity; null to let the ray pass. */
  resolve: (hit: THREE.Intersection) => PickHit | null;
  /** Higher wins over nearer lower-priority hits (e.g. a nucleus inside a cloud proxy). */
  priority?: number;
}

/** Interactive controls a level exposes in Explore mode. */
export type LevelControl =
  | {
      kind: 'slider';
      label: string;
      min: number;
      max: number;
      step: number;
      value: number;
      format?: (v: number) => string;
      onInput: (v: number) => void;
    }
  | {
      kind: 'choice';
      label: string;
      options: string[];
      value: string;
      onChange: (v: string) => void;
    }
  | {
      /** Live value refreshed a few times per second (temperatures, currents...). */
      kind: 'readout';
      label: string;
      get: () => string;
    };

/** Lumped thermal model for a level (illustrative, not measured). */
export interface ThermalSpec {
  nodes: {
    id: string;
    label: string;
    objects: THREE.Object3D[];
    /** Heat capacity, J/K (sets how fast it warms). */
    capacity: number;
    /** Heat input in W at 100 % load. */
    power?: number;
    /** Conductance to ambient air, W/K (scaled by fan speed if fanCooled). */
    toAir?: number;
    fanCooled?: boolean;
    /** Draw see-through (outer shells), so hot parts inside stay visible. */
    ghost?: boolean;
    /** Show in the live readout. */
    readout?: boolean;
  }[];
  /** [a, b, conductance W/K] */
  links: [string, string, number][];
  /** Node that throttles when it passes 90 °C. */
  throttleNode?: string;
  /**
   * Forced air for the Thermal view: air is pulled in over each inlet (a fan), driven down
   * (-Y) through the `through` node (the fin stack) and leaves below it, warming on the way.
   */
  airflow?: {
    inlets: THREE.Object3D[];
    /** Inlet radius, level units. */
    radius: number;
    through: string;
  };
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
  /** Hoverable / selectable objects. */
  pickables?: Pickable[];
  /** Explore-mode controls (built once in init). */
  controls?: LevelControl[];
  /** Explore mode toggled: levels reset any control overrides when it turns off. */
  onExploreChange?(active: boolean): void;
  /** Explore view mode changed (Normal / X-Ray / Section / Thermal). */
  onViewModeChange?(mode: string): void;
  /** Section-plane normal for this level (the side it points to is cut away). */
  sectionNormal?: [number, number, number];
  /** Thermal model; levels without one do not offer the Thermal view. */
  thermal?: ThermalSpec;
  /** Signal-trace waypoints for this level when journey.trace is set. */
  tracePlan?(): PickHit[] | null;
  /** Where the followed electron is at content time t (level units), or null if hidden. */
  followPoint?(t: number, out: THREE.Vector3): THREE.Vector3 | null;
  /** Narration while following the electron through this level. */
  followCaption?: string;
}

export type LevelFactory = (ctx: LevelContext) => Level;
