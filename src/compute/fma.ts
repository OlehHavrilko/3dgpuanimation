/**
 * IEEE 754 binary32 ("float32"): 1 sign bit, 8 exponent bits (bias 127), 23 mantissa bits with an
 * implicit leading 1. The pure maths behind the FMA datapath scale; no rendering in here.
 */
export const SIGN_BITS = 1;
export const EXP_BITS = 8;
export const MANT_BITS = 23;
export const EXP_BIAS = 127;

const view = new DataView(new ArrayBuffer(4));

export interface Fields {
  sign: number;
  /** Biased exponent field, 0..255. */
  exp: number;
  /** Stored 23-bit mantissa (without the implicit 1). */
  mant: number;
}

/** The 32 raw bits of a number rounded to float32. */
export function toBits(x: number): number {
  view.setFloat32(0, x);
  return view.getUint32(0);
}

export function fromBits(bits: number): number {
  view.setUint32(0, bits >>> 0);
  return view.getFloat32(0);
}

export function fields(x: number): Fields {
  const b = toBits(x);
  return { sign: b >>> 31, exp: (b >>> 23) & 0xff, mant: b & 0x7fffff };
}

export function fromFields(f: Fields): number {
  return fromBits(((f.sign << 31) | (f.exp << 23) | f.mant) >>> 0);
}

/** Bits as an array, most significant first: [sign, e7..e0, m22..m0]. */
export function bitArray(x: number): number[] {
  const b = toBits(x);
  return Array.from({ length: 32 }, (_, i) => (b >>> (31 - i)) & 1);
}

/** 24-bit significand of a normal number, hidden 1 included. */
export const significand = (x: number) => (1 << MANT_BITS) | fields(x).mant;

export interface FmaTrace {
  /** Sign of the product (XOR of the input signs). */
  productSign: number;
  /** Biased exponent of the product before normalisation: ea + eb - 127. */
  productExp: number;
  /** Exact 48-bit product of the two 24-bit significands. */
  productSig: bigint;
  /** Fields of the float32 result. */
  result: Fields;
  value: number;
}

/**
 * a·b + c for normal, finite float32 inputs, with the intermediate values a hardware FMA unit
 * works through. The product of two 24-bit significands is exact in a double (48 bits), so the
 * result is a single rounding to float32 of a·b + c, as the fused operation specifies.
 */
export function fma(a: number, b: number, c: number): FmaTrace {
  const fa = fields(a);
  const fb = fields(b);
  const productSig = BigInt(significand(a)) * BigInt(significand(b));
  const value = Math.fround(Math.fround(a) * Math.fround(b) + Math.fround(c));
  return {
    productSign: fa.sign ^ fb.sign,
    productExp: fa.exp + fb.exp - EXP_BIAS,
    productSig,
    result: fields(value),
    value,
  };
}
