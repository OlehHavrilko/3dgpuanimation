import { describe, expect, it } from 'vitest';
import { compute as enCompute } from '../../src/content/en/compute';
import { compute as ruCompute } from '../../src/content/ru/compute';
import { powerOfTen } from '../../src/core/math';
import {
  EXP_BITS,
  MANT_BITS,
  SIGN_BITS,
  bitArray,
  fields,
  fma,
  fromBits,
  fromFields,
  significand,
  toBits,
} from '../../src/compute/fma';
import { FULL_ADDER, TRANSISTORS_PER_NAND2, evalFullAdder, nand } from '../../src/compute/logic';

const SCALES = ['sm', 'warp', 'fma', 'gates'] as const;

describe('float32 fields', () => {
  it('is 1 + 8 + 23 bits', () => {
    expect(SIGN_BITS + EXP_BITS + MANT_BITS).toBe(32);
  });

  it('splits and rebuilds numbers', () => {
    expect(fields(1)).toEqual({ sign: 0, exp: 127, mant: 0 });
    expect(fields(-2)).toEqual({ sign: 1, exp: 128, mant: 0 });
    expect(fields(0.15625)).toEqual({ sign: 0, exp: 124, mant: 0x200000 });
    for (const x of [3, -0.1, 1e-3, 123456.75]) expect(fromFields(fields(x))).toBe(Math.fround(x));
    expect(toBits(1)).toBe(0x3f800000);
    expect(fromBits(0x40490fdb)).toBeCloseTo(Math.PI, 6);
  });

  it('lists the 32 bits most significant first', () => {
    const bits = bitArray(3);
    expect(bits).toHaveLength(32);
    expect(bits.slice(0, 9).join('')).toBe('010000000');
    expect(bits.slice(9, 11)).toEqual([1, 0]);
  });
});

describe('fused multiply-add', () => {
  it('works through the worked example 3 × 1.5 + 0.25 = 4.75', () => {
    const t = fma(3, 1.5, 0.25);
    expect(t.value).toBe(4.75);
    expect(t.productSign).toBe(0);
    expect(t.productExp).toBe(128);
    // 1.1b × 1.1b = 10.01b; two 24-bit significands carry 2 × 23 fractional bits.
    expect(Number(t.productSig) / 2 ** 46).toBe(2.25);
    expect(t.result).toEqual({ sign: 0, exp: 129, mant: 0x180000 });
  });

  it('matches the bit patterns shown for π × e + 0.25', () => {
    const a = Math.fround(Math.PI);
    const b = Math.fround(Math.E);
    const t = fma(a, b, 0.25);
    expect(bitArray(a).join('')).toBe('01000000010010010000111111011011');
    expect(bitArray(b).join('')).toBe('01000000001011011111100001010100');
    expect(bitArray(0.25).join('')).toBe('00111110100000000000000000000000');
    expect(bitArray(t.value).join('')).toBe('01000001000011001010001011000000');
    expect(t.value).toBeCloseTo(8.789734, 5);
    expect(t.result.exp).toBe(130);
  });

  it('takes the sign from the XOR of the inputs', () => {
    expect(fma(-3, 1.5, 0).productSign).toBe(1);
    expect(fma(-3, -1.5, 0).productSign).toBe(0);
  });

  it('keeps the 48-bit product exact and rounds once at the end', () => {
    const a = fromBits(0x3fffffff); // just under 2
    const t = fma(a, a, 0);
    expect(t.productSig).toBe(BigInt(significand(a)) * BigInt(significand(a)));
    expect(t.value).toBe(Math.fround(a * a));
    // A fused operation sees the low bits that multiply-then-add would have thrown away.
    const x = 1 + 2 ** -12;
    expect(fma(x, x, -Math.fround(x * x)).value).toBe(2 ** -24);
  });
});

describe('full adder from nine NAND gates', () => {
  it('has nine gates, 36 transistors', () => {
    expect(FULL_ADDER).toHaveLength(9);
    expect(FULL_ADDER.length * TRANSISTORS_PER_NAND2).toBe(36);
    expect([nand(0, 0), nand(0, 1), nand(1, 0), nand(1, 1)]).toEqual([1, 1, 1, 0]);
  });

  it('adds every input combination', () => {
    for (let n = 0; n < 8; n++) {
      const [a, b, cin] = [n & 1, (n >> 1) & 1, (n >> 2) & 1];
      const net = evalFullAdder(a, b, cin);
      expect(net.n8 + 2 * net.n9).toBe(a + b + cin);
      expect(net.n4).toBe(a ^ b);
    }
  });
});

describe('compute branch content', () => {
  it('has four scales from a millimetre down to a micrometre', () => {
    expect(SCALES.map((k) => powerOfTen(enCompute[k].meta.scale))).toEqual(['10⁻³ m', '10⁻⁴ m', '10⁻⁵ m', '10⁻⁶ m']);
  });

  it('has an accuracy note per scale and every glossary term points at one', () => {
    expect(enCompute.accuracy).toHaveLength(SCALES.length);
    for (const n of enCompute.accuracy) expect(n.spec.length + n.representative.length).toBeGreaterThan(0);
    for (const g of enCompute.reference.glossary) expect(g.level).toBeLessThan(SCALES.length);
  });

  it('cites the whitepaper and the standard, each source once', () => {
    const urls = enCompute.reference.sources.map((s) => s.url).join(' ');
    for (const host of ['nvidia.com', 'ieee.org']) expect(urls).toContain(host);
    expect(new Set(enCompute.reference.sources.map((s) => s.url)).size).toBe(enCompute.reference.sources.length);
  });

  it('Russian matches English list by list', () => {
    expect(ruCompute.reference.glossary.map((g) => g.level)).toEqual(enCompute.reference.glossary.map((g) => g.level));
    expect(ruCompute.reference.sources.map((s) => s.url)).toEqual(enCompute.reference.sources.map((s) => s.url));
    enCompute.accuracy.forEach((n, i) => {
      const r = ruCompute.accuracy[i];
      expect([r.spec.length, r.representative.length, r.notToScale.length]).toEqual([
        n.spec.length,
        n.representative.length,
        n.notToScale.length,
      ]);
    });
    for (const k of SCALES) expect(powerOfTen(ruCompute[k].meta.scale)).toBe(powerOfTen(enCompute[k].meta.scale));
  });
});
