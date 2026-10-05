import * as THREE from 'three';
import type { Level, LevelContext, LevelMeta } from './types';
import { clamp, easeInOutSine, smoothstep } from './math';
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
 * target, finished off by a short green/white flash.
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

  private cache = new Map<number, Slot>();
  private preparing: Promise<void> | null = null;
  private readonly keep: number;
  private readonly prepare?: (level: Level) => Promise<number>;
  private readonly schedule: (fn: () => void) => void;
  private progress = 0;
  private flashPulse = 0;
  private built = false;
  private readonly tmpDir0 = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpLook = new THREE.Vector3();
  private readonly tmpBase = new THREE.Vector3();
  private readonly tmpFocus = new THREE.Vector3();

  constructor(
    private ctx: LevelContext,
    readonly entries: LevelEntry[],
    private flashEl: HTMLElement,
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
    // Skip the flash on the very first build.
    this.flashPulse = this.built ? 1 : 0;
    this.built = true;
    this.onSwap?.(index, slot.level);
    this.prepareNeighbours();
  }

  /** Dispose built levels outside [index - keep, index + keep]. */
  private evict(index: number) {
    for (const [i, slot] of this.cache) {
      if (Math.abs(i - index) > this.keep) {
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
    const level = this.current!;
    const seg = this.segments[index];
    const local = clamp((p - seg.start) / (seg.end - seg.start));
    const isLast = index === this.entries.length - 1;

    const content = isLast ? local : clamp(local / CONTENT_SHARE);
    const dive = isLast ? 0 : clamp((local - CONTENT_SHARE) / (1 - CONTENT_SHARE));

    level.update(content, dt, time);

    const cam = this.ctx.camera;
    let focusDist = cam.position.distanceTo(level.getFocus?.() ?? level.getLookAt());

    if (dive > 0 && !this.ctx.view.freeCamera) {
      focusDist = this.applyDive(level, dive);
    }

    // Flash: scroll-driven ramp at the end of a dive and at the start of a level
    // (so it is symmetric when scrolling backwards) + a time-based pop on swap.
    this.flashPulse = Math.max(0, this.flashPulse - dt / FLASH_SECONDS);
    const flashOut = isLast ? 0 : smoothstep(0.72, 1, dive) * 0.9;
    const flashIn = index === 0 ? 0 : (1 - smoothstep(0, ARRIVAL, local)) * 0.9;
    const pulse = this.flashPulse * this.flashPulse * (3 - 2 * this.flashPulse);
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
