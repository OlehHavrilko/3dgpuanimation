import { content } from '../content';

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Map v from [a, b] to [0, 1] (clamped). */
export const range = (v: number, a: number, b: number) => clamp((v - a) / (b - a));

export const smoothstep = (a: number, b: number, v: number) => {
  const t = range(v, a, b);
  return t * t * (3 - 2 * t);
};

export const smootherstep = (a: number, b: number, v: number) => {
  const t = range(v, a, b);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

/** Deterministic PRNG so procedural layouts are stable between level re-inits. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Format a length in metres with an SI prefix, e.g. 0.0123 -> "12.3 mm". */
export function formatMeters(m: number): string {
  const units: [number, string][] = [
    [1, 'm'],
    [1e-2, 'cm'],
    [1e-3, 'mm'],
    [1e-6, 'µm'],
    [1e-9, 'nm'],
    [1e-10, 'Å'],
    [1e-12, 'pm'],
  ];
  const { decimal, units: names } = content.ui.number;
  const fmt = (v: number, u: string) =>
    `${(v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)).replace('.', decimal)} ${names[u as keyof typeof names]}`;
  for (const [f, u] of units) {
    if (m >= f) return fmt(m / f, u);
  }
  return fmt(m / 1e-12, 'pm');
}

const UNIT: Record<string, number> = {
  m: 1,
  cm: 1e-2,
  mm: 1e-3,
  µm: 1e-6,
  nm: 1e-9,
  Å: 1e-10,
  pm: 1e-12,
  // Russian labels ("30 см", "0,2 нм").
  м: 1,
  см: 1e-2,
  мм: 1e-3,
  мкм: 1e-6,
  нм: 1e-9,
  пм: 1e-12,
};
const SUP: Record<string, string> = {
  '-': '⁻',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

/** "30 cm" -> "10⁻¹ m": order of magnitude of a scale label. */
export function powerOfTen(label: string) {
  const [num, unit] = label.split(' ');
  const meters = parseFloat(num.replace(',', '.')) * (UNIT[unit] ?? 1);
  const e = Math.floor(Math.log10(meters) + 1e-9);
  return `10${String(e).replace(/./g, (c) => SUP[c] ?? c)} ${content.ui.number.units.m}`;
}

/** texts[k] where k is the number of thresholds t has passed (texts.length = thresholds.length + 1). */
export function pickByT<T>(t: number, thresholds: number[], texts: readonly T[]): T {
  let k = 0;
  while (k < thresholds.length && t >= thresholds[k]) k++;
  return texts[k];
}
