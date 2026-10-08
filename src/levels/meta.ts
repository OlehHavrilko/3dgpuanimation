import type { LevelMeta } from '../core/types';
import { content } from '../content';

/**
 * Static facts about every level (name, scale, weight along the scroll). They live apart from the
 * level classes so the overlay, the scroll mapping and the palette know all nine levels without
 * downloading the scene code of the ones not reached yet.
 */
const L = content.levels;

export const META: LevelMeta[] = [
  { ...L.card.meta, unitMeters: 0.01, weight: 1.3 },
  { ...L.pcb.meta, unitMeters: 0.001, weight: 1 },
  { ...L.package.meta, unitMeters: 0.001, weight: 1 },
  { ...L.die.meta, unitMeters: 0.001, weight: 1.1 },
  { ...L.metal.meta, unitMeters: 1e-6, weight: 1.1 },
  { ...L.transistor.meta, unitMeters: 1e-9, weight: 1.1 },
  { ...L.lattice.meta, unitMeters: 1e-10, weight: 1 },
  { ...L.atom.meta, unitMeters: 5e-12, weight: 1.1 },
  { ...L.nucleus.meta, unitMeters: 1e-16, weight: 1.1 },
];
