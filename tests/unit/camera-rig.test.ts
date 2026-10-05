import { describe, expect, it } from 'vitest';
import { CameraRig } from '../../src/core/CameraRig';

describe('CameraRig', () => {
  const rig = new CameraRig([
    { t: 0, pos: [0, 0, 10], look: [0, 0, 0] },
    { t: 0.5, pos: [10, 0, 0], look: [1, 0, 0] },
    { t: 1, pos: [0, 10, 0], look: [0, 1, 0] },
  ]);

  it('passes exactly through its keys', () => {
    const r = (v: number[]) => v.map((x) => Math.round(x * 1e6) / 1e6 + 0);
    expect(r(rig.evaluate(0).pos.toArray())).toEqual([0, 0, 10]);
    expect(r(rig.evaluate(0.5).pos.toArray())).toEqual([10, 0, 0]);
    expect(r(rig.evaluate(1).look.toArray())).toEqual([0, 1, 0]);
  });

  it('clamps outside [0, 1]', () => {
    expect(rig.evaluate(-1).pos.distanceTo(rig.evaluate(0).pos)).toBe(0);
    expect(rig.evaluate(2).pos.distanceTo(rig.evaluate(1).pos)).toBe(0);
  });

  it('moves continuously (no jumps between nearby t)', () => {
    let prev = rig.evaluate(0).pos.clone();
    for (let t = 0.01; t <= 1; t += 0.01) {
      const p = rig.evaluate(t).pos;
      expect(p.distanceTo(prev)).toBeLessThan(1);
      prev = p.clone();
    }
  });
});
