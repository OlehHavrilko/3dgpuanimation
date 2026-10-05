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

export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

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
  for (const [f, u] of units) {
    if (m >= f) {
      const v = m / f;
      return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${u}`;
    }
  }
  return `${(m / 1e-12).toFixed(2)} pm`;
}
