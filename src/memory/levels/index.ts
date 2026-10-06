import type { LevelEntry } from '../../core/LevelManager';
import * as M1 from './M1Chip';
import * as M2 from './M2Die';
import * as M3 from './M3Array';
import * as M4 from './M4Cell';

/** The memory branch, largest to smallest: one GDDR7 chip -> one bit. */
export const MEMORY_LEVELS: LevelEntry[] = [
  { meta: M1.meta, create: (ctx) => new M1.ChipLevel(ctx) },
  { meta: M2.meta, create: (ctx) => new M2.DieLevel(ctx) },
  { meta: M3.meta, create: (ctx) => new M3.ArrayLevel(ctx) },
  { meta: M4.meta, create: (ctx) => new M4.CellLevel(ctx) },
];

/**
 * Colour grade per branch scale, borrowed from the main descent's look-alike scales (Grade.ts is
 * indexed by main-descent level): package, die, FinFET, lattice.
 */
export const MEMORY_GRADE_INDEX = [2, 3, 5, 6];
