import type { EntityInfo } from '../../core/types';

const e = (x: EntityInfo): EntityInfo => x;

/** Level 7 — crystalline silicon. */
export const lattice = {
  meta: {
    name: 'Silicon lattice',
    scale: '2 nm',
    description: 'Inside the fin: a diamond-cubic crystal, every atom bonded to four neighbours.',
  },
  follow: 'Inside the fin it is no longer a particle in a wire: it moves through the crystal from bond to bond.',
  captions: [
    'Under everything, a crystal: silicon atoms in a diamond lattice',
    'Each atom holds four neighbours at 109.5° — these bonds are the material',
    'Phosphorus donates an electron · boron leaves a hole',
    '5 × 10²² atoms in a single cubic centimetre',
  ],
  controls: { doping: 'Doping' },
  entities: {
    bonds: e({
      title: 'Covalent bonds',
      kind: 'Chemistry · sp³',
      specs: [
        ['Length', '2.35 Å'],
        ['Angle', '109.47°'],
        ['Electrons', '2 shared per bond'],
      ],
      note: 'Each Si atom shares its 4 valence electrons with 4 neighbours: a full octet everywhere, which is why pure silicon barely conducts.',
    }),
    phosphorus: (pos: string): EntityInfo => ({
      title: 'Phosphorus (P)',
      kind: 'Dopant · n-type donor',
      specs: [
        ['Valence electrons', '5'],
        ['Bonds', '4 — one electron left over'],
        ['Position', pos],
      ] as [string, string][],
      note: 'The fifth electron is barely bound and wanders off at room temperature: a free negative carrier.',
    }),
    boron: (pos: string): EntityInfo => ({
      title: 'Boron (B)',
      kind: 'Dopant · p-type acceptor',
      specs: [
        ['Valence electrons', '3'],
        ['Bonds', '4 — one missing an electron'],
        ['Position', pos],
      ] as [string, string][],
      note: 'The missing electron is a "hole": neighbours hop into it, so the hole moves like a positive carrier.',
    }),
    silicon: (pos: string, diveTarget: boolean): EntityInfo => ({
      title: diveTarget ? 'Silicon (Si) — the one we dive into' : 'Silicon (Si)',
      kind: 'Atom · Z = 14',
      specs: [
        ['Neighbours', '4'],
        ['Bond length', '2.35 Å'],
        ['Covalent radius', '1.11 Å'],
        ['Position', pos],
      ] as [string, string][],
    }),
  },
};
