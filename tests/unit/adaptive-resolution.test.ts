import { describe, expect, it } from 'vitest';
import { AdaptiveResolution } from '../../src/app/AdaptiveResolution';

const run = (a: AdaptiveResolution, fps: number, seconds: number) => {
  const changes: number[] = [];
  for (let t = 0; t < seconds; t += 1 / fps) {
    const r = a.step(1 / fps);
    if (r !== null) changes.push(r);
  }
  return changes;
};

describe('AdaptiveResolution', () => {
  it('steps down after sustained low fps and never below the floor', () => {
    const a = new AdaptiveResolution(1.5, () => 1.5, true);
    const changes = run(a, 30, 60);
    expect(changes.length).toBeGreaterThan(1);
    expect(Math.min(...changes)).toBeGreaterThanOrEqual(0.6);
  });

  it('does not react to a single slow frame (a level swap)', () => {
    const a = new AdaptiveResolution(1.5, () => 1.5, true);
    run(a, 60, 3);
    expect(a.step(0.1)).toBeNull();
    expect(run(a, 60, 3)).toEqual([]);
  });

  it('recovers slowly up to the ceiling when smooth again', () => {
    const a = new AdaptiveResolution(0.8, () => 1.2, true);
    const changes = run(a, 60, 120);
    expect(changes.length).toBeGreaterThan(0);
    expect(Math.max(...changes)).toBeLessThanOrEqual(1.2);
  });

  it('does nothing when disabled (?quality=high) or hidden', () => {
    const a = new AdaptiveResolution(1.5, () => 1.5, false);
    expect(run(a, 20, 30)).toEqual([]);
    const b = new AdaptiveResolution(1.5, () => 1.5, true);
    for (let i = 0; i < 1000; i++) expect(b.step(1 / 20, true)).toBeNull();
  });
});
