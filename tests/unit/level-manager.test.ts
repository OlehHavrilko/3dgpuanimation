import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  CONTENT_SHARE,
  SEAM_END,
  LevelManager,
  type LevelEntry,
  type LevelManagerOptions,
} from '../../src/core/LevelManager';
import type { Level, LevelContext } from '../../src/core/types';

function fakeLevel(name: string): Level {
  return {
    meta: { name, scale: '1 m', description: '', unitMeters: 1, weight: 1 },
    scene: new THREE.Scene(),
    caption: '',
    init: vi.fn(),
    update: vi.fn(),
    dispose: vi.fn(),
    getTransitionTarget: () => ({ position: new THREE.Vector3(), radius: 1 }),
    getLookAt: () => new THREE.Vector3(0, 0, -1),
  };
}

function setup(count = 3, options: LevelManagerOptions = {}) {
  const created: Level[][] = Array.from({ length: count }, () => []);
  const entries: LevelEntry[] = Array.from({ length: count }, (_, i) => ({
    meta: { name: `L${i}`, scale: '1 m', description: '', unitMeters: 1, weight: 1 },
    create: () => {
      const l = fakeLevel(`L${i}`);
      created[i].push(l);
      return l;
    },
  }));
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  const ctx = {
    camera,
    view: { freeCamera: false },
    journey: { trace: null, follow: false },
  } as unknown as LevelContext;
  // Background work runs only when the test flushes it.
  const queue: (() => void)[] = [];
  const manager = new LevelManager(ctx, entries, { schedule: (fn) => queue.push(fn), ...options });
  const flush = async () => {
    while (queue.length) await queue.shift()!(); // each job is async; it may queue the next
  };
  return { manager, created, flush };
}

describe('LevelManager', () => {
  it('splits the timeline by weight and maps progress to levels', () => {
    const { manager } = setup(4);
    expect(manager.segments.map((s) => s.start)).toEqual([0, 0.25, 0.5, 0.75]);
    expect(manager.progressForLevel(2, 0.5)).toBeCloseTo(0.625);
  });

  it('holds the scroll on the last downloaded level until the next one has loaded', async () => {
    const { manager, created, flush } = setup(3);
    let loaded = false;
    const entry = manager.entries[1];
    const create = entry.create;
    entry.ready = () => loaded;
    entry.load = async () => void (loaded = true);
    entry.create = create;
    manager.setProgress(manager.progressForLevel(2, 0.5));
    const held = manager.tick(0.016, 0);
    expect(held.index).toBe(0);
    expect(held.dive).toBe(0);
    expect(created[1].length).toBe(0);
    await flush();
    await manager.whenIdle();
    expect(loaded).toBe(true);
    manager.tick(0.016, 0.016);
    expect(manager.currentIndex).toBe(2);
  });

  it('builds the level for the current progress, once', () => {
    const { manager, created } = setup();
    manager.setProgress(manager.progressForLevel(1, 0.5));
    manager.tick(0.016, 0);
    manager.tick(0.016, 0.016);
    expect(manager.currentIndex).toBe(1);
    expect(created[1].length).toBe(1);
    expect(created[1][0].init).toHaveBeenCalledTimes(1);
  });

  it('keeps the previous level built and detaches it on deactivation', () => {
    const { manager, created } = setup();
    const deactivated: string[] = [];
    manager.onDeactivate = (l) => deactivated.push(l.meta.name);
    manager.setProgress(manager.progressForLevel(0, 0.5));
    manager.tick(0.016, 0);
    manager.setProgress(manager.progressForLevel(1, 0.5));
    manager.tick(0.016, 0);
    expect(deactivated).toEqual(['L0']);
    expect(created[0][0].dispose).not.toHaveBeenCalled();
    expect(manager.cachedIndices).toEqual([0, 1]);
  });

  it('keep: 0 disposes the outgoing level on swap (cache off)', async () => {
    const { manager, created, flush } = setup(3, { keep: 0 });
    manager.setProgress(manager.progressForLevel(0, 0.5));
    manager.tick(0.016, 0);
    await flush();
    manager.setProgress(manager.progressForLevel(1, 0.5));
    manager.tick(0.016, 0);
    await flush();
    expect(created[0][0].dispose).toHaveBeenCalledTimes(1);
    expect(manager.cachedIndices).toEqual([1]);
  });

  it('prepares the neighbours in the background, next first', async () => {
    const prepared: string[] = [];
    const prepare = vi.fn(async (l: Level) => (prepared.push(l.meta.name), 5));
    const { manager, created, flush } = setup(4, { prepare });
    manager.setProgress(manager.progressForLevel(1, 0.5));
    manager.tick(0.016, 0);
    expect(manager.cachedIndices).toEqual([1]); // nothing extra on the critical path
    await flush();
    expect(prepared).toEqual(['L2', 'L0']);
    expect(manager.cachedIndices).toEqual([0, 1, 2]);

    // Crossing into a prepared neighbour re-uses it: no rebuild.
    manager.setProgress(manager.progressForLevel(2, 0.5));
    manager.tick(0.016, 0);
    expect(created[2].length).toBe(1);
  });

  it('disposes levels that fall outside the current/next/previous window', async () => {
    const { manager, created, flush } = setup(4);
    manager.setProgress(manager.progressForLevel(0, 0.5));
    manager.tick(0.016, 0);
    await flush();
    manager.setProgress(manager.progressForLevel(3, 0.5));
    manager.tick(0.016, 0);
    expect(created[0][0].dispose).toHaveBeenCalledTimes(1);
    expect(created[1][0].dispose).toHaveBeenCalledTimes(1);
    expect(manager.cachedIndices).toEqual([3]);
    await flush();
    expect(manager.cachedIndices).toEqual([2, 3]);
  });

  it('skips stale background work after the user moved on', async () => {
    const { manager, created, flush } = setup(5);
    manager.setProgress(manager.progressForLevel(0, 0.5));
    manager.tick(0.016, 0); // queues L1
    manager.setProgress(manager.progressForLevel(4, 0.5));
    manager.tick(0.016, 0);
    await flush();
    expect(created[1].length).toBe(0);
    expect(manager.cachedIndices).toEqual([3, 4]);
  });

  it('dispose() releases every cached level', async () => {
    const { manager, created, flush } = setup();
    manager.setProgress(manager.progressForLevel(1, 0.5));
    manager.tick(0.016, 0);
    await flush();
    manager.dispose();
    for (const list of created) for (const l of list) expect(l.dispose).toHaveBeenCalledTimes(1);
    expect(manager.cachedIndices).toEqual([]);
  });

  it('splits each segment into content and a dive (except the last level)', () => {
    const { manager } = setup();
    manager.setProgress(manager.progressForLevel(0, CONTENT_SHARE / 2));
    expect(manager.tick(0.016, 0)).toMatchObject({ dive: 0 });
    manager.setProgress(manager.progressForLevel(0, (1 + CONTENT_SHARE) / 2));
    const s = manager.tick(0.016, 0);
    expect(s.content).toBe(1);
    expect(s.dive).toBeCloseTo(0.5);
    manager.setProgress(manager.progressForLevel(2, 0.95));
    expect(manager.tick(0.016, 0).dive).toBe(0);
  });

  it('reveals the next level during the dive and marks the swap inside the seam as continuous', () => {
    const { manager, created } = setup(3, { keep: 0 });
    const diveAt = (d: number) => manager.progressForLevel(0, CONTENT_SHARE + (1 - CONTENT_SHARE) * d);
    manager.setProgress(diveAt(0.2));
    expect(manager.tick(0.016, 0).seam).toBe(0);
    expect(manager.seamLevel).toBeNull();

    manager.setProgress(diveAt(0.8));
    const s = manager.tick(0.016, 0);
    expect(s.seam).toBeGreaterThan(0);
    expect(manager.seamLevel).toBe(created[1][0]); // built on demand even without a cache
    expect(created[1][0].update).toHaveBeenCalledWith(0, 0.016, 0);

    manager.setProgress(diveAt((SEAM_END + 1) / 2));
    manager.tick(0.016, 0);
    manager.setProgress(manager.progressForLevel(1, 0.01));
    manager.tick(0.016, 0);
    expect(manager.currentIndex).toBe(1);
    expect(manager.lastSwapContinuous).toBe(true);
    expect(created[1].length).toBe(1); // the revealed instance is the one that becomes current
  });

  it('scrolling back up through the seam is continuous too', () => {
    const { manager } = setup(3);
    manager.setProgress(manager.progressForLevel(1, 0.01));
    manager.tick(0.016, 0);
    manager.setProgress(manager.progressForLevel(0, CONTENT_SHARE + (1 - CONTENT_SHARE) * 0.99));
    const s = manager.tick(0.016, 0);
    expect(manager.currentIndex).toBe(0);
    expect(manager.lastSwapContinuous).toBe(true);
    expect(s.seam).toBeCloseTo(1, 3);
  });

  it('a jump that skips the seam is not continuous', () => {
    const { manager } = setup(3);
    manager.setProgress(manager.progressForLevel(0, 0.5));
    manager.tick(0.016, 0);
    manager.setProgress(manager.progressForLevel(1, 0.5));
    manager.tick(0.016, 0);
    expect(manager.lastSwapContinuous).toBe(false);
  });

  it('records a profile entry per activation when a profiler is attached', () => {
    const { manager } = setup();
    const begin = vi.fn(() => ({ disposeMs: 0, buildMs: 0 }));
    manager.profiler = { begin } as never;
    manager.setProgress(manager.progressForLevel(2, 0.5));
    manager.tick(0.016, 0);
    expect(begin).toHaveBeenCalledWith(2, 'L2', false);
  });
});
