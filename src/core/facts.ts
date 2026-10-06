import { content } from '../content';

/** Numbers the closing line is built from, kept in one place so they can be checked. */
const AVOGADRO = 6.02214076e23;
const SILICON_DENSITY_G_CM3 = 2.329;
const SILICON_MOLAR_MASS = 28.0855;

/** Silicon atoms in a slab of the given area (mm²) and thickness (mm). */
export function siliconAtoms(areaMm2: number, thicknessMm: number) {
  const volumeCm3 = (areaMm2 * thicknessMm) / 1000;
  return ((volumeCm3 * SILICON_DENSITY_G_CM3) / SILICON_MOLAR_MASS) * AVOGADRO;
}

/** GB202: ~750 mm². The thickness (~0.78 mm) is a typical unthinned wafer figure, not published. */
export const GB202_ATOMS = siliconAtoms(750, 0.78);

/** 2.9 × 10²², with real superscript digits. */
export function scientific(n: number, digits = 1) {
  const e = Math.floor(Math.log10(n));
  const m = (n / 10 ** e).toFixed(digits).replace('.', content.ui.number.decimal);
  const sup: Record<string, string> = {
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
  return `${m} × 10${String(e).replace(/./g, (c) => sup[c] ?? c)}`;
}
