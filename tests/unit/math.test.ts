import { describe, expect, it } from 'vitest';
import { clamp, formatMeters, mulberry32, powerOfTen, range, smoothstep } from '../../src/core/math';
import { route45 } from '../../src/core/canvas';
import { fovForAspect } from '../../src/core/BaseLevel';

describe('scale formatting', () => {
  it('formats lengths with SI prefixes', () => {
    expect(formatMeters(0.3)).toBe('30.0 cm');
    expect(formatMeters(0.0123)).toBe('1.23 cm');
    expect(formatMeters(1e-5)).toBe('10.0 µm');
    expect(formatMeters(5e-8)).toBe('50.0 nm');
    expect(formatMeters(2e-10)).toBe('2.00 Å');
    expect(formatMeters(9e-11)).toBe('90.0 pm');
  });

  it('gives the order of magnitude of every level label', () => {
    expect(['30 cm', '10 cm', '5 cm', '1 cm', '10 µm', '50 nm', '2 nm', '0.2 nm'].map(powerOfTen)).toEqual([
      '10⁻¹ m',
      '10⁻¹ m',
      '10⁻² m',
      '10⁻² m',
      '10⁻⁵ m',
      '10⁻⁸ m',
      '10⁻⁹ m',
      '10⁻¹⁰ m',
    ]);
  });
});

describe('easing helpers', () => {
  it('clamps and maps ranges', () => {
    expect(clamp(2)).toBe(1);
    expect(range(5, 0, 10)).toBe(0.5);
    expect(smoothstep(0, 1, 0)).toBe(0);
    expect(smoothstep(0, 1, 1)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5);
  });

  it('PRNG is deterministic (procedural layouts are stable across rebuilds)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('PCB routing', () => {
  it('routes with a 45° segment and ends exactly at the target', () => {
    const pts = route45(0, 0, 10, 4);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1]).toEqual([10, 4]);
    const [, b, c] = pts;
    expect(Math.abs(c[0] - b[0])).toBeCloseTo(Math.abs(c[1] - b[1]));
  });
});

describe('portrait framing', () => {
  it('keeps landscape FOV and widens portrait FOV, capped at 80°', () => {
    expect(fovForAspect(40, 16 / 9)).toBe(40);
    expect(fovForAspect(40, 0.5)).toBeGreaterThan(40);
    expect(fovForAspect(40, 0.1)).toBe(80);
  });
});
