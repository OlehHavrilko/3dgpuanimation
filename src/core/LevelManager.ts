import * as THREE from 'three';
import type { Level, LevelContext, LevelMeta } from './types';
import { clamp, easeInOutSine, smoothstep } from './math';
import { SeamMap } from './seam';
import type { LevelProfiler } from './LevelProfiler';

export interface LevelEntry {
  meta: LevelMeta;
  create: (ctx: LevelContext) => Level;
}

interface Segment {
  start: number;
  end: number;
}

/** Fraction of each (non-final) level segment spent on content; the rest is the dive. */
export const CONTENT_SHARE = 0.84;
/** Scroll window (in local t) at the start of a level over which it settles (DOF eases in). */
const ARRIVAL = 0.05;
/** Dive progress over which the next scale is revealed inside the current one. */
export const SEAM_START = 0.45;
export const SEAM_END = 0.97;

export interface FrameState {
  index: number;
  /** Local segment progress 0..1 (content + dive). */
  local: number;
  /** Content progress handed to the level, 0..1. */
  content: number;
  /** Dive progress 0..1 (0 while in content). */
  dive: number;
  /** How much of the next scale is revealed (0..1) during the dive; 1 = the frame is the next level. */
  seam: number;
  /** 0 right at the start of a level, 1 once it has settled (ARRIVAL window). */
  arrival: number;
  /** Visible width at the focus distance, in metres. */
  fovMeters: number;
}

/** A built level kept around for re-use. */
interface Slot {
  level: Level;
  /** Background preparation (shader compile + GPU upload) finished. */
  prepared: boolean;
  warmupMs: number;
}

export interface LevelManagerOptions {
  /** Neighbours kept alive on each side of the current level (current/next/previous = 1). */
  keep?: number;
  /** Compile + upload a built level off the critical path; resolves with the time it took (ms). */
  prepare?: (level: Level) => Promise<number>;
  /** Run background work when the main thread is idle. */
  schedule?: (fn: () => void) => void;
}

const idle = (fn: () => void) => {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void })
    .requestIdleCallback;
  if (ric) ric(fn, { timeout: 500 });
  else setTimeout(fn, 30);
};

/**
 * Powers-of-Ten scene orchestrator.
 *
 * Every level lives in its own THREE.Scene with local units (cm, mm, nm, Å...), which keeps
 * float precision sane at every scale. The current level and its neighbours (previous / next)
 * are kept built; neighbours are built and warmed up (shaders compiled, buffers uploaded) in
 * idle time, so crossing a boundary is a swap, not a rebuild. Levels outside that window are
 * disposed. The last slice of each segment is a camera dolly into the level's transition
 * target; during it the next level is drawn "inside" the target from a camera mapped through
 * a SeamMap, and at the end of the dive both cameras coincide, so the swap is not a cut.
 */
export class LevelManager {
  readonly segments: Segment[];
  current: Level | null = null;
  currentIndex = -1;
  onSwap: ((index: number, level: Level) => void) | null = null;
  /** The outgoing level stops being current (it may stay cached): detach anything shared from it. */
  onDeactivate: ((level: Level) => void) | null = null;
  /** Optional instrumentation of every activation. */
  profiler: LevelProfiler | null = null;
  /** The last swap happened inside the seam (adjacent levels, end of dive / start of content). */
  lastSwapContinuous = false;
  /** Camera for the next level while it is revealed during a dive (see syncSeamCamera). */
  readonly seamCamera = new THREE.PerspectiveCamera();
  /** State returned by the last tick (diagnostics, tests). */
  lastState: FrameState | null = null;
  /** Next level being revealed this frame, or null. */
  seamLevel: Level | null = null;

  private cache = new Map<number, Slot>();
  private preparing: Promise<void> | null = null;
  private readonly keep: number;
  private readonly prepare?: (level: Level) => Promise<number>;
  private readonly schedule: (fn: () => void) => void;
  private progress = 0;
  private lastProgress = -1;
  private readonly seamMap = new SeamMap();
  private readonly seamLook = new THREE.Vector3();
  private readonly seamPos = new THREE.Vector3();
  private readonly seamQuat = new THREE.Quaternion();
  private seamNear = 0.1;
  private seamFar = 1000;
  private seamDist = 1;
  private seamFovMeters = 0;
  /** Camera pose at the very end of the current level's dive. */
  private readonly endPos = new THREE.Vector3();
  private readonly endQuat = new THREE.Quaternion();
  private readonly endCam = new THREE.PerspectiveCamera();
  private readonly tmpDir0 = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpLook = new THREE.Vector3();
  private readonly tmpBase = new THREE.Vector3();
  private readonly tmpFocus = new THREE.Vector3();

  constructor(
    private ctx: LevelContext,
    readonly entries: LevelEntry[],
    options: LevelManagerOptions = {},
  ) {
    this.keep = options.keep ?? 1;
    this.prepare = options.prepare;
    this.schedule = options.schedule ?? idle;
    const total = entries.reduce((s, e) => s + e.meta.weight, 0);
    let acc = 0;
    this.segments = entries.map((e) => {
      const start = acc / total;
      acc += e.meta.weight;
      return { start, end: acc / total };
    });
  }

  setProgress(p: number) {
    this.progress = clamp(p);
  }

  getProgress() {
    return this.progress;
  }

  /** Global progress at which a level's content starts (plus a small offset into its arrival window). */
  progressForLevel(index: number, local = ARRIVAL + 0.01) {
    const s = this.segments[index];
    return s.start + (s.end - s.start) * local;
  }

  private indexFor(p: number) {
    for (let i = 0; i < this.segments.length; i++) {
      if (p < this.segments[i].end) return i;
    }
    return this.segments.length - 1;
  }

  /** Levels currently built (for tests / diagnostics). */
  get cachedIndices() {
    return [...this.cache.keys()].sort((a, b) => a - b);
  }

  /** Resolves when no background preparation is running. */
  async whenIdle() {
    while (this.preparing) await this.preparing;
  }

  private build(index: number): Slot {
    const level = this.entries[index].create(this.ctx);
    level.init();
    const slot: Slot = { level, prepared: false, warmupMs: 0 };
    this.cache.set(index, slot);
    return slot;
  }

  private activate(index: number) {
    this.lastSwapContinuous = this.isSeamSwap(this.currentIndex, index);
    const cached = this.cache.get(index);
    const rec = this.profiler?.begin(index, this.entries[index].meta.name, !!cached);
    let t = performance.now();
    if (this.current) this.onDeactivate?.(this.current);
    this.evict(index);
    if (rec) rec.disposeMs = performance.now() - t;
    t = performance.now();
    const slot = cached ?? this.build(index);
    if (rec) {
      rec.buildMs = cached ? 0 : performance.now() - t;
      rec.warmupMs = slot.warmupMs;
    }
    this.current = slot.level;
    this.currentIndex = index;
    this.onSwap?.(index, slot.level);
    this.prepareNeighbours();
  }

  /**
   * Crossing between adjacent levels with both the previous and the current frame inside the
   * seam (end of A's dive / start of B's content): the frames match, so no cover is needed.
   */
  private isSeamSwap(from: number, to: number) {
    if (from < 0 || Math.abs(to - from) !== 1 || this.lastProgress < 0) return false;
    const a = Math.min(from, to);
    const seg = this.segments[a];
    const len = seg.end - seg.start;
    const lo = seg.start + len * (CONTENT_SHARE + (1 - CONTENT_SHARE) * SEAM_END);
    const next = this.segments[a + 1];
    const hi = next.start + (next.end - next.start) * ARRIVAL;
    const inSeam = (p: number) => p >= lo && p <= hi;
    return inSeam(this.lastProgress) && inSeam(this.progress);
  }

  /** Dispose built levels outside [index - keep, index + max(keep, 1)] (the next level is needed for the seam). */
  private evict(index: number) {
    for (const [i, slot] of this.cache) {
      if (i < index - this.keep || i > index + Math.max(this.keep, 1)) {
        slot.level.dispose();
        this.cache.delete(i);
      }
    }
  }

  /** Build + warm the neighbours in idle time, nearest first, next before previous. */
  private prepareNeighbours() {
    if (this.preparing) return; // the running loop re-checks the window when it finishes
    const wanted: number[] = [];
    for (let d = 1; d <= this.keep; d++) wanted.push(this.currentIndex + d, this.currentIndex - d);
    const todo = wanted.find((i) => i >= 0 && i < this.entries.length && !this.cache.get(i)?.prepared);
    if (todo === undefined) return;
    this.preparing = new Promise<void>((resolve) => {
      this.schedule(async () => {
        try {
          // The user may have moved on while we waited for idle time.
          if (Math.abs(todo - this.currentIndex) <= this.keep && todo !== this.currentIndex) {
            const slot = this.cache.get(todo) ?? this.build(todo);
            if (!slot.prepared && this.prepare) slot.warmupMs = await this.prepare(slot.level);
            slot.prepared = true;
          }
        } finally {
          this.preparing = null;
          resolve();
          // A swap during preparation may have pushed this level out of the window.
          this.evict(this.currentIndex);
          this.prepareNeighbours();
        }
      });
    });
  }

  tick(dt: number, time: number): FrameState {
    const p = this.progress;
    const index = this.indexFor(p);
    if (index !== this.currentIndex) this.activate(index);
    this.lastProgress = p;
    const level = this.current!;
    const seg = this.segments[index];
    const local = clamp((p - seg.start) / (seg.end - seg.start));
    const isLast = index === this.entries.length - 1;

    const content = isLast ? local : clamp(local / CONTENT_SHARE);
    const dive = isLast ? 0 : clamp((local - CONTENT_SHARE) / (1 - CONTENT_SHARE));

    level.update(content, dt, time);

    const cam = this.ctx.camera;
    let focusDist = cam.position.distanceTo(level.getFocus?.() ?? level.getLookAt());

    const diving = dive > 0 && !this.ctx.view.freeCamera;
    this.seamLevel = null;
    let seam = 0;
    if (diving) {
      // The next level's first frame decides where this dive ends (physically the same view).
      const next = this.peekNext(index + 1, dt, time);
      const endDist = (this.seamDist * next.meta.unitMeters) / level.meta.unitMeters;
      focusDist = this.applyDive(level, dive, endDist);
      const target = level.getTransitionTarget();
      this.seamMap.set(target.position, this.endPos, this.endQuat, this.seamLook, this.seamPos, this.seamQuat);
      // Reveal the next scale inside the dive target.
      seam = smoothstep(SEAM_START, SEAM_END, dive);
      if (seam > 0) this.seamLevel = next;
    }

    let fovMeters =
      2 * focusDist * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * cam.aspect * level.meta.unitMeters;
    // Equal by construction at the end of the dive; the blend only covers a clamped dive.
    if (seam > 0)
      fovMeters = Math.exp(Math.log(fovMeters) + (Math.log(this.seamFovMeters) - Math.log(fovMeters)) * seam);

    const arrival = index === 0 ? 1 : smoothstep(0, ARRIVAL, local);
    this.lastState = { index, local, content, dive, seam, arrival, fovMeters };
    return this.lastState;
  }

  /**
   * Build (if needed) and advance the next level at its first content frame, with the shared
   * camera temporarily swapped for the seam camera; records that first-frame pose.
   */
  private peekNext(next: number, dt: number, time: number): Level {
    const slot = this.cache.get(next) ?? this.build(next);
    const level = slot.level;
    const main = this.ctx.camera;
    const cam = this.seamCamera;
    cam.aspect = main.aspect;
    cam.up.copy(main.up);
    this.ctx.camera = cam;
    try {
      level.update(0, dt, time);
    } finally {
      this.ctx.camera = main;
    }
    this.seamLook.copy(level.getLookAt());
    this.seamNear = cam.near;
    this.seamFar = cam.far;
    this.seamDist = Math.max(cam.position.distanceTo(this.seamLook), 1e-9);
    this.seamFovMeters =
      2 * this.seamDist * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * cam.aspect * level.meta.unitMeters;
    this.seamPos.copy(cam.position);
    this.seamQuat.copy(cam.quaternion);
    return level;
  }

  /**
   * Place the seam camera for this frame from the final shared camera (call after anything that
   * still moves the camera, e.g. parallax). Near/far scale with the mapping so depth precision
   * holds while the next level is still far away.
   */
  syncSeamCamera() {
    if (!this.seamLevel) return;
    const main = this.ctx.camera;
    const cam = this.seamCamera;
    this.seamMap.apply(main.position, main.quaternion, cam.position, cam.quaternion);
    const ratio = Math.max(1, cam.position.distanceTo(this.seamLook) / this.seamDist);
    cam.near = this.seamNear * ratio;
    cam.far = this.seamFar * ratio;
    cam.aspect = main.aspect;
    if (main.view?.enabled) {
      const v = main.view;
      cam.setViewOffset(v.fullWidth, v.fullHeight, v.offsetX, v.offsetY, v.width, v.height);
    } else if (cam.view) {
      cam.clearViewOffset();
    }
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  /**
   * Dolly the camera from the level's final pose into its transition target, ending `endDist`
   * from it (never pulling back). Returns the focus distance.
   */
  private applyDive(level: Level, k: number, endDist: number) {
    const cam = this.ctx.camera;
    const target = level.getTransitionTarget();
    const base = this.tmpBase.copy(cam.position);
    const look0 = this.tmpLook.copy(level.getLookAt());

    const d0 = Math.max(base.distanceTo(target.position), 1e-6);
    const d1 = Math.min(endDist, d0);
    const e = easeInOutSine(k);
    // Logarithmic dolly: constant zoom rate, the classic Powers-of-Ten feel.
    const d = d0 * Math.pow(d1 / d0, e);

    const dir0 = this.tmpDir0.copy(base).sub(target.position).normalize();
    const dir = this.tmpDir.copy(dir0);
    if (target.approach) {
      dir.lerp(target.approach, smoothstep(0, 0.8, k));
      if (dir.lengthSq() < 1e-6) dir.copy(target.approach);
      dir.normalize();
    }

    cam.position.copy(target.position).addScaledVector(dir, d);
    look0.lerp(target.position, smoothstep(0, 0.55, k));
    cam.lookAt(look0);

    // Where this dive ends (k = 1): the pose the seam maps onto the next level's first frame.
    const endDir = target.approach ?? dir0;
    this.endCam.up.copy(cam.up);
    this.endCam.position.copy(target.position).addScaledVector(endDir, d1);
    this.endCam.lookAt(target.position);
    this.endPos.copy(this.endCam.position);
    this.endQuat.copy(this.endCam.quaternion);

    const nearWanted = Math.min(cam.near, d * 0.02);
    if (nearWanted < cam.near) {
      cam.near = nearWanted;
      cam.updateProjectionMatrix();
    }
    this.tmpFocus.copy(target.position);
    return d;
  }

  /** World point to keep in DOF focus for the current frame. */
  getFocusPoint(state: FrameState): THREE.Vector3 | null {
    const level = this.current;
    if (!level) return null;
    if (state.dive > 0 && !this.ctx.view.freeCamera) return this.tmpFocus;
    return level.getFocus?.() ?? level.getLookAt();
  }

  /** Dispose every cached level except the current one (e.g. after a WebGL context restore), then re-prepare. */
  dropCache() {
    for (const [i, slot] of this.cache) {
      if (i === this.currentIndex) continue;
      slot.level.dispose();
      this.cache.delete(i);
    }
    this.prepareNeighbours();
  }

  dispose() {
    for (const slot of this.cache.values()) slot.level.dispose();
    this.cache.clear();
    this.current = null;
  }
}
