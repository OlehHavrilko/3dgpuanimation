import type { LevelEntry } from '../core/LevelManager';
import type { Level, LevelContext } from '../core/types';
import * as L1 from './L1Card';
import { META } from './meta';

type LevelClass = new (ctx: LevelContext) => Level;

/**
 * A level whose scene code is its own chunk, fetched in the background after the first frame
 * (the manager holds the scroll back for the few ms a missing level would be needed sooner).
 */
function lazy(index: number, loader: () => Promise<LevelClass>): LevelEntry {
  let Ctor: LevelClass | null = null;
  return {
    meta: META[index],
    ready: () => Ctor !== null,
    load: async () => {
      Ctor ??= await loader();
    },
    create: (ctx) => new Ctor!(ctx),
  };
}

/** Ordered from largest to smallest scale: RTX 5090 -> one silicon atom -> its nucleus and quarks. */
export const LEVELS: LevelEntry[] = [
  { meta: META[0], create: (ctx) => new L1.CardLevel(ctx) },
  lazy(1, async () => (await import('./L2Pcb')).PcbLevel),
  lazy(2, async () => (await import('./L3Package')).PackageLevel),
  lazy(3, async () => (await import('./L4Die')).DieLevel),
  lazy(4, async () => (await import('./L5Metal')).MetalLevel),
  lazy(5, async () => (await import('./L6Transistor')).TransistorLevel),
  lazy(6, async () => (await import('./L7Lattice')).LatticeLevel),
  lazy(7, async () => (await import('./L8Atom')).AtomLevel),
  lazy(8, async () => (await import('./L9Nucleus')).NucleusLevel),
];
