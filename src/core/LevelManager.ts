import * as THREE from 'three';
import type { Level, LevelContext, LevelMeta } from './types';
import { clamp, easeInOutSine, smoothstep } from './math';

export interface LevelEntry {
  meta: LevelMeta;
  create: (ctx: LevelContext) => Level;
}

export interface LevelManagerOptions {
  /** How many inactive levels to keep alive for instant scrubbing (0 disables). */
  sceneCache: number;
  /** Build + shader-compile the next level during the dive so the swap is instant. */
  prebuild: boolean;
}

interface Segment {
  start: number;
  end: number;
}

/** Fraction of each (non-final) level segment spent on content; the rest is the dive. */
export const CONTENT_SHARE = 0.84;
/** Scroll window (in local t) over which a new level fades in from the flash. */
const ARRIVAL = 0.05;
/** Duration of the time-based flash crossfade on every scene swap. */
const FLASH_SECONDS = 0.3;

export interface FrameState {
  index: number;
  /** Local segment progress 0..1 (content + dive). */
  local: number;
  /** Content progress handed to the level, 0..1. */
  content: number;
  /** Dive progress 0..1 (0 while in content). */
  dive: number;
  /** Visible width at the focus distance, in metres. */
  fovMeters: number;
}

/**
 * Powers-of-Ten scene orchestrator.
 *
 * Every level lives in its own THREE.Scene with local units (cm, mm, nm, Å...).
 * Only one level exists at a time: crossing a segment boundary disposes the old
 * level and builds the new one, which keeps float precision sane at every scale.
 * The last slice of each segment is a camera dolly into the level's transition
 * target, finished off by a short green/white flash that hides the swap.
 */
export class LevelManager {
  readonly segments: Segment[];
  current: Level | null = null;
  currentIndex = -1;
  onSwap: ((index: number, level: Level) => void) | null = null;
  /** Fired right before the outgoing level is disposed. */
  onBeforeDispose: ((level: Level) => void) | null = null;

  private progress = 0;
  private flashPulse = 0;
  private built = false;
  /** Inactive levels kept alive, most-recently-used last. */
  private pool = new Map<number, Level>();
  private order: number[] = [];
  private readonly tmpDir0 = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpLook = new THREE.Vector3();
  private readonly tmpBase = new THREE.Vector3();
  private readonly tmpFocus = new THREE.Vector3();

  constructor(
    private ctx: LevelContext,
    readonly entries: LevelEntry[],
    private flashEl: HTMLElement,
    private options: LevelManagerOptions = { sceneCache: 0, prebuild: false },
  ) {
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

  /** Global progress at which a level's content starts (plus a small offset past the arrival flash). */
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

  private activate(index: number) {
    if (this.current) {
      this.onBeforeDispose?.(this.current);
      // Recycle instead of disposing when the cache has room, so scrubbing back is instant.
      this.retain(this.currentIndex, this.current);
      this.current = null;
    }
    const level = this.takeFromPool(index) ?? this.build(index);
    this.current = level;
    this.currentIndex = index;
    // Skip the flash on the very first build.
    this.flashPulse = this.built ? 1 : 0;
    this.built = true;
    this.onSwap?.(index, level);
  }

  private build(index: number): Level {
    const level = this.entries[index].create(this.ctx);
    level.init();
    return level;
  }

  private takeFromPool(index: number): Level | null {
    const level = this.pool.get(index);
    if (!level) return null;
    this.pool.delete(index);
    this.order = this.order.filter((i) => i !== index);
    return level;
  }

  private retain(index: number, level: Level) {
    const max = this.options.sceneCache;
    if (max <= 0) {
      level.dispose();
      return;
    }
    this.pool.set(index, level);
    this.order.push(index);
    while (this.order.length > max) {
      const evict = this.order.shift()!;
      const stale = this.pool.get(evict);
      this.pool.delete(evict);
      stale?.dispose();
    }
  }

  /**
   * While the camera is dollying into the next scale, build that level off-screen and
   * let the driver compile its shaders (`compileAsync`, via KHR_parallel_shader_compile)
   * so the swap does not stall on a few hundred ms of geometry + program setup.
   */
  private maybePrebuild(index: number, dive: number) {
    if (!this.options.prebuild || this.options.sceneCache <= 0) return;
    if (this.ctx.view.freeCamera || dive <= 0.35) return;
    const next = index + 1;
    if (next >= this.entries.length || this.pool.has(next)) return;
    const level = this.build(next);
    this.retain(next, level);
    void this.ctx.renderer.compileAsync(level.scene, this.ctx.camera).catch(() => {});
  }

  tick(dt: number, time: number): FrameState {
    const p = this.progress;
    const index = this.indexFor(p);
    if (index !== this.currentIndex) this.activate(index);
    const level = this.current!;
    const seg = this.segments[index];
    const local = clamp((p - seg.start) / (seg.end - seg.start));
    const isLast = index === this.entries.length - 1;

    const content = isLast ? local : clamp(local / CONTENT_SHARE);
    const dive = isLast ? 0 : clamp((local - CONTENT_SHARE) / (1 - CONTENT_SHARE));

    level.update(content, dt, time);
    this.maybePrebuild(index, dive);

    const cam = this.ctx.camera;
    let focusDist = cam.position.distanceTo(level.getFocus?.() ?? level.getLookAt());

    if (dive > 0 && !this.ctx.view.freeCamera) {
      focusDist = this.applyDive(level, dive);
    }

    // Flash: scroll-driven ramp at the end of a dive and at the start of a level
    // (so it is symmetric when scrolling backwards) + a time-based pop on swap.
    // Kept subtle now that the frame dissolve carries the actual transition: the green
    // should read as light bloom over the cut, not as an opaque wipe.
    this.flashPulse = Math.max(0, this.flashPulse - dt / FLASH_SECONDS);
    const flashOut = isLast ? 0 : smoothstep(0.72, 1, dive) * 0.42;
    const flashIn = index === 0 ? 0 : (1 - smoothstep(0, ARRIVAL, local)) * 0.42;
    const pulse = this.flashPulse * this.flashPulse * (3 - 2 * this.flashPulse) * 0.4;
    this.flashEl.style.opacity = Math.max(flashOut, flashIn, pulse).toFixed(3);

    const fovMeters =
      2 * focusDist * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * cam.aspect * level.meta.unitMeters;

    return { index, local, content, dive, fovMeters };
  }

  /** Dolly the camera from the level's final pose into its transition target. Returns focus distance. */
  private applyDive(level: Level, k: number) {
    const cam = this.ctx.camera;
    const target = level.getTransitionTarget();
    const base = this.tmpBase.copy(cam.position);
    const look0 = this.tmpLook.copy(level.getLookAt());

    const d0 = Math.max(base.distanceTo(target.position), 1e-6);
    // Finish with the target ~3x larger than the frame.
    const d1 = (target.radius * 0.35) / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const e = easeInOutSine(k);
    // Logarithmic dolly: constant zoom rate, the classic Powers-of-Ten feel.
    const d = d0 * Math.pow(Math.min(d1, d0) / d0, e);

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

  /** Forget cached scenes (used after a WebGL context restore: their GPU state is gone). */
  dropPool() {
    this.pool.forEach((level) => level.dispose());
    this.pool.clear();
    this.order = [];
  }

  dispose() {
    this.current?.dispose();
    this.current = null;
    this.dropPool();
  }
}
