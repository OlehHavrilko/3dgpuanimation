import type { EntityInfo } from '../../core/types';

const e = (x: EntityInfo): EntityInfo => x;

/** Level 8 — a single silicon atom. */
export const atom = {
  meta: {
    name: 'Silicon atom',
    scale: '0.2 nm',
    description: '14 protons, 14 neutrons, 14 electrons. Where every transistor ultimately happens.',
  },
  follow:
    "Finally it is one of silicon's four valence electrons, in a 3p orbital: not a dot, but a cloud of probability. End of the journey.",
  captions: [
    'Silicon: 14 protons, 14 neutrons, 14 electrons',
    'That cloud is the quantum wavefunction — where a transistor really lives',
    'Four valence electrons: the bonds you just saw',
    'The nucleus, drawn ten thousand times too large',
  ],
  controls: { orbitals: 'Orbitals' },
  entities: {
    nucleus: e({
      title: '²⁸Si nucleus',
      kind: 'Nucleus',
      specs: [
        ['Protons', '14'],
        ['Neutrons', '14'],
        ['Real radius', '~3.1 fm'],
        ['Drawn', '~10⁴× too large'],
      ],
      note: 'Real scale: if the atom were a stadium, the nucleus would be a pea at the centre spot. It holds 99.98% of the mass.',
    }),
    shells: {
      1: {
        title: 'n = 1 shell · 1s²',
        kind: 'Core electrons',
        specs: [
          ['Electrons', '2'],
          ['Z_eff', '13.58'],
          ['Mean radius', '~0.06 Å'],
        ],
        note: 'Pulled in by almost the full nuclear charge: tightly bound and chemically inert.',
      },
      2: {
        title: 'n = 2 shell · 2s² 2p⁶',
        kind: 'Core electrons',
        specs: [
          ['Electrons', '8'],
          ['Z_eff', '9.0 (2s) · 9.9 (2p)'],
          ['Shape', 'sphere + three dumbbells'],
        ],
        note: 'A closed neon-like core; the three 2p orbitals together add up to a spherical shell.',
      },
      3: {
        title: 'n = 3 shell · 3s² 3p²',
        kind: 'Valence electrons',
        specs: [
          ['Electrons', '4'],
          ['Z_eff', '4.9 (3s) · 4.3 (3p)'],
          ['Shape', '3p lobes along x and y'],
        ],
        note: 'These four form the four covalent bonds of the crystal (sp³ hybrids) and decide how silicon conducts.',
      },
    } as Record<number, EntityInfo>,
  },
};
