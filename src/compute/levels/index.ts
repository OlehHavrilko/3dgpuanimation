import type { LevelEntry } from '../../core/LevelManager';
import * as C1 from './C1SM';
import * as C2 from './C2Warp';
import * as C3 from './C3Fma';
import * as C4 from './C4Gates';

/** The compute branch, largest to smallest: one SM -> a warp -> an FP32 FMA -> logic gates. */
export const COMPUTE_LEVELS: LevelEntry[] = [
  { meta: C1.meta, create: (ctx) => new C1.SMLevel(ctx) },
  { meta: C2.meta, create: (ctx) => new C2.WarpLevel(ctx) },
  { meta: C3.meta, create: (ctx) => new C3.FmaLevel(ctx) },
  { meta: C4.meta, create: (ctx) => new C4.GatesLevel(ctx) },
];

/**
 * Colour grade per branch scale, borrowed from the main descent's look-alike scales (Grade.ts is
 * indexed by main-descent level): die, die, metal stack, FinFET.
 */
export const COMPUTE_GRADE_INDEX = [3, 3, 4, 5];
