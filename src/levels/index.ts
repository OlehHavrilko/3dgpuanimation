import type { LevelEntry } from '../core/LevelManager';
import * as L1 from './L1Card';
import * as L2 from './L2Pcb';
import * as L3 from './L3Package';
import * as L4 from './L4Die';
import * as L5 from './L5Metal';
import * as L6 from './L6Transistor';
import * as L7 from './L7Lattice';
import * as L8 from './L8Atom';

/** Ordered from largest to smallest scale: RTX 5090 -> one silicon atom. */
export const LEVELS: LevelEntry[] = [
  { meta: L1.meta, create: (ctx) => new L1.CardLevel(ctx) },
  { meta: L2.meta, create: (ctx) => new L2.PcbLevel(ctx) },
  { meta: L3.meta, create: (ctx) => new L3.PackageLevel(ctx) },
  { meta: L4.meta, create: (ctx) => new L4.DieLevel(ctx) },
  { meta: L5.meta, create: (ctx) => new L5.MetalLevel(ctx) },
  { meta: L6.meta, create: (ctx) => new L6.TransistorLevel(ctx) },
  { meta: L7.meta, create: (ctx) => new L7.LatticeLevel(ctx) },
  { meta: L8.meta, create: (ctx) => new L8.AtomLevel(ctx) },
];
