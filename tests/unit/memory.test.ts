import { describe, expect, it } from 'vitest';
import { memory as enMemory } from '../../src/content/en/memory';
import { memory as ruMemory } from '../../src/content/ru/memory';
import { powerOfTen } from '../../src/core/math';

const SCALES = ['chip', 'die', 'array', 'cell'] as const;

describe('memory branch content', () => {
  it('has four scales from centimetres down to nanometres', () => {
    const exps = SCALES.map((k) => powerOfTen(enMemory[k].meta.scale));
    expect(exps).toEqual(['10⁻² m', '10⁻³ m', '10⁻⁶ m', '10⁻⁷ m']);
    for (const k of SCALES) expect(enMemory[k].meta.description.length).toBeGreaterThan(10);
  });

  it('has an accuracy note per scale and every glossary term points at one', () => {
    expect(enMemory.accuracy).toHaveLength(SCALES.length);
    for (const n of enMemory.accuracy) expect(n.spec.length + n.representative.length).toBeGreaterThan(0);
    for (const g of enMemory.reference.glossary) expect(g.level).toBeLessThan(SCALES.length);
  });

  it('cites a source for every published figure family', () => {
    const urls = enMemory.reference.sources.map((s) => s.url).join(' ');
    for (const host of ['jedec.org', 'nvidia.com', 'techinsights.com', 'samsung.com']) expect(urls).toContain(host);
    expect(new Set(enMemory.reference.sources.map((s) => s.url)).size).toBe(enMemory.reference.sources.length);
  });

  it('keeps the numbers it derives consistent', () => {
    // 16 chips × 16 Gbit; one cell per wordline × bitline crossing.
    expect(16 * 2 ** 34).toBe(274_877_906_944);
    expect(enMemory.cell.captions.end).toContain('275');
    expect((32.6 * 37.6) / 1e6).toBeCloseTo(0.00123, 5);
    // ~10 fF at ~0.5 V.
    expect(Math.round((10e-15 * 0.5) / 1.602e-19 / 1000)).toBe(31);
  });

  it('Russian matches English list by list', () => {
    expect(ruMemory.reference.glossary.map((g) => g.level)).toEqual(enMemory.reference.glossary.map((g) => g.level));
    expect(ruMemory.reference.sources.map((s) => s.url)).toEqual(enMemory.reference.sources.map((s) => s.url));
    enMemory.accuracy.forEach((n, i) => {
      const r = ruMemory.accuracy[i];
      expect([r.spec.length, r.representative.length, r.notToScale.length]).toEqual([
        n.spec.length,
        n.representative.length,
        n.notToScale.length,
      ]);
    });
    for (const k of SCALES) expect(powerOfTen(ruMemory[k].meta.scale)).toBe(powerOfTen(enMemory[k].meta.scale));
  });
});
