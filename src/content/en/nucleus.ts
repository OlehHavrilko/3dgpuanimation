import type { EntityInfo } from '../../core/types';

const e = (x: EntityInfo): EntityInfo => x;

/** Level 9 — the silicon nucleus, one proton, its quarks. */
export const nucleus = {
  meta: {
    name: 'Nucleus & quarks',
    scale: '1 fm',
    description: 'Inside the atom’s nucleus: protons and neutrons, and the quarks and gluons they are made of.',
  },
  follow:
    'The bit ended as an electron in that cloud. What holds the cloud in place is here: a nucleus 35,000 times smaller than the atom, and inside each proton, quarks.',
  captions: [
    'The silicon-28 nucleus at its real size: 14 protons, 14 neutrons, about 6 fm across',
    'Thirty-five thousand times smaller than the atom, it carries over 99.9% of its mass',
    'Inside one proton: three valence quarks, up, up and down, held by gluons',
    'The quarks are about 1% of the proton’s mass; the rest is the energy of the field between them',
    'Quark–antiquark pairs come and go: a proton is a seething field, not three beads',
  ],
  controls: { layer: 'Show' },
  entities: {
    proton: e({
      title: 'Proton · uud',
      kind: 'Nucleon',
      specs: [
        ['Charge', '+1 (⅔ + ⅔ − ⅓)'],
        ['Mass', '938.3 MeV/c²'],
        ['Charge radius', '0.84 fm'],
      ],
      note: 'Two up quarks and one down quark. Their masses add up to about 9 MeV; nearly all of the 938 comes from the energy of the gluon field and the quarks’ motion.',
    }),
    neutron: e({
      title: 'Neutron · udd',
      kind: 'Nucleon',
      specs: [
        ['Charge', '0 (⅔ − ⅓ − ⅓)'],
        ['Mass', '939.6 MeV/c²'],
        ['Free half-life', '~10 min'],
      ],
      note: 'One up and two down quarks. Alone it decays in minutes; bound in the nucleus it is stable.',
    }),
    nucleus: e({
      title: '²⁸Si nucleus',
      kind: 'Nucleus',
      specs: [
        ['Nucleons', '14 p + 14 n'],
        ['Charge radius', '3.12 fm'],
        ['Binding', '8.45 MeV per nucleon'],
      ],
      note: 'The strong force holds the nucleons together at about 1 fm range, against the electric repulsion of 14 protons.',
    }),
    up: e({
      title: 'Up quark',
      kind: 'Valence quark',
      specs: [
        ['Charge', '+⅔ e'],
        ['Mass', '≈2.2 MeV/c²'],
        ['Size', 'none measured (< 10⁻¹⁸ m)'],
      ],
      note: 'Drawn as a bead to be seen at all. As far as experiments can tell it is point-like, and it never has a sharp position inside the proton.',
    }),
    down: e({
      title: 'Down quark',
      kind: 'Valence quark',
      specs: [
        ['Charge', '−⅓ e'],
        ['Mass', '≈4.7 MeV/c²'],
        ['Size', 'none measured (< 10⁻¹⁸ m)'],
      ],
      note: 'The proton’s one down quark. Swap it for an up and you have the neutron’s opposite: that swap is beta decay.',
    }),
    gluon: e({
      title: 'Gluon flux tube',
      kind: 'Strong force',
      specs: [
        ['Carries', 'colour charge'],
        ['Tension', '≈0.9 GeV/fm (~15 t of force)'],
        ['Shape', 'Y between three quarks'],
      ],
      note: 'Gluons carry colour themselves, so the field squeezes into a tube instead of spreading out. Pull a quark away and the tube snaps into a new quark–antiquark pair: a lone quark is never seen.',
    }),
    sea: e({
      title: 'Sea quarks',
      kind: 'Quark–antiquark pairs',
      specs: [
        ['Lifetime', 'borrowed from the field'],
        ['Net effect', 'zero charge, zero colour'],
      ],
      note: 'Besides the three valence quarks, a proton is full of short-lived quark–antiquark pairs and gluons. High-energy collisions see them directly.',
    }),
  },
};
