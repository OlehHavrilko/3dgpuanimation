import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CONTENT_SHARE, LevelManager, type LevelEntry } from '../../src/core/LevelManager';
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

function setup(count = 3) {
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
  const flash = { style: { opacity: '' } } as unknown as HTMLElement;
  const manager = new LevelManager(ctx, entries, flash);
  return { manager, created };
}

describe('LevelManager', () => {
  it('splits the timeline by weight and maps progress to levels', () => {
    const { manager } = setup(4);
    expect(manager.segments.map((s) => s.start)).toEqual([0, 0.25, 0.5, 0.75]);
    expect(manager.progressForLevel(2, 0.5)).toBeCloseTo(0.625);
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

  it('disposes the outgoing level when crossing a boundary (after onBeforeDispose)', () => {
    const { manager, created } = setup();
    const order: string[] = [];
    manager.onBeforeDispose = (l) => order.push(`before:${l.meta.name}`);
    manager.setProgress(manager.progressForLevel(0, 0.5));
    manager.tick(0.016, 0);
    const first = created[0][0];
    (first.dispose as ReturnType<typeof vi.fn>).mockImplementation(() => order.push('dispose:L0'));
    manager.setProgress(manager.progressForLevel(1, 0.5));
    manager.tick(0.016, 0);
    expect(order).toEqual(['before:L0', 'dispose:L0']);
    expect(manager.currentIndex).toBe(1);
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

  it('records a profile entry per activation when a profiler is attached', () => {
    const { manager } = setup();
    const begin = vi.fn(() => ({ disposeMs: 0, buildMs: 0 }));
    manager.profiler = { begin } as never;
    manager.setProgress(manager.progressForLevel(2, 0.5));
    manager.tick(0.016, 0);
    expect(begin).toHaveBeenCalledWith(2, 'L2', false);
  });
});
