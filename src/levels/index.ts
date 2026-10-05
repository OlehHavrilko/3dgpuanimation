import type { LevelEntry } from '../core/LevelManager';
import * as L1 from './L1Card';
import * as L8 from './L8Atom';

/** Ordered from largest to smallest scale. */
export const LEVELS: LevelEntry[] = [
  { meta: L1.meta, create: (ctx) => new L1.CardLevel(ctx) },
  { meta: L8.meta, create: (ctx) => new L8.AtomLevel(ctx) },
];
