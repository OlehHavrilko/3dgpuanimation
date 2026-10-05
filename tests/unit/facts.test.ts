import { describe, expect, it } from 'vitest';
import { GB202_ATOMS, scientific, siliconAtoms } from '../../src/core/facts';

describe('facts', () => {
  it('counts the atoms in a slab of silicon', () => {
    // 1 cm³ of silicon: 2.329 g / 28.0855 g/mol × N_A ≈ 4.99 × 10²² (the textbook 5 × 10²²).
    expect(siliconAtoms(1000, 1)).toBeCloseTo(4.99e22, -21);
  });

  it('the GB202 die holds about 3 × 10²² atoms', () => {
    expect(GB202_ATOMS).toBeGreaterThan(2.8e22);
    expect(GB202_ATOMS).toBeLessThan(3.0e22);
  });

  it('formats with superscript digits', () => {
    expect(scientific(2.92e22)).toBe('2.9 × 10²²');
    expect(scientific(5e-3)).toBe('5.0 × 10⁻³');
  });
});
