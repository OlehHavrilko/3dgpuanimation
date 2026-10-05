import { describe, expect, it } from 'vitest';
import {
  SMS,
  SMS_ENABLED,
  classifyBlock,
  fusedOffMask,
  smCenterLocal,
  traceWaypoints,
} from '../../src/levels/die/floorplan';

const mask = fusedOffMask();

describe('GB202 floorplan', () => {
  it('fuses off exactly 22 of 192 SMs, deterministically', () => {
    expect(SMS).toBe(192);
    expect(mask.filter((v) => v > 0).length).toBe(SMS - SMS_ENABLED);
    expect(Array.from(fusedOffMask())).toEqual(Array.from(mask));
  });

  it('classifies an SM centre as that SM, and as its GPC when zoomed out', () => {
    const [x, y] = smCenterLocal(2, 1, 0, 3);
    const sm = classifyBlock(x, y, true, mask);
    expect(sm?.kind).toBe('sm');
    const gpc = classifyBlock(x, y, false, mask);
    expect(gpc).toMatchObject({ kind: 'gpc', gpc: 8 });
  });

  it('finds the hub and both L2 halves in the central band', () => {
    expect(classifyBlock(0, 0, true, mask)?.kind).toBe('hub');
    expect(classifyBlock(6, 0, true, mask)).toMatchObject({ kind: 'l2', east: true });
    expect(classifyBlock(-6, 0, true, mask)).toMatchObject({ kind: 'l2', east: false });
  });

  it('returns null outside the die', () => {
    expect(classifyBlock(40, 0, true, mask)).toBeNull();
  });

  it('numbers all 16 memory controllers 1..16 exactly once', () => {
    const seen = new Set<number>();
    for (let chip = 0; chip < 16; chip++) {
      const [x, y] = traceWaypoints(chip, mask).mc;
      const b = classifyBlock(x, y, false, mask);
      expect(b?.kind).toBe('mc');
      if (b?.kind === 'mc') seen.add(b.index);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });

  it('a trace from chip n lands on controller n+1, then L2, a GPC and an enabled SM', () => {
    for (let chip = 0; chip < 16; chip++) {
      const w = traceWaypoints(chip, mask);
      expect(classifyBlock(...w.mc, false, mask)).toMatchObject({ kind: 'mc', index: chip + 1 });
      expect(classifyBlock(...w.l2, false, mask)?.kind).toBe('l2');
      expect(classifyBlock(...w.gpc, false, mask)?.kind).toBe('gpc');
      expect(classifyBlock(...w.sm, true, mask)).toMatchObject({ kind: 'sm', off: false });
    }
  });
});
