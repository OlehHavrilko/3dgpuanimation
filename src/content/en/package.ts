import type { EntityInfo } from '../../core/types';

const e = (x: EntityInfo): EntityInfo => x;

const layers = {
  mask: 'Solder mask',
  cu8: 'Copper L8',
  abf: 'ABF',
  cu7: 'Copper L7',
  core: 'Glass-fibre core + PTH',
  cu2: 'Copper L2',
  cu1: 'Copper L1',
  topMask: 'Top solder mask',
};
export type LayerId = keyof typeof layers;

/** Inspector rows per substrate layer type (copper layers share one description). */
const layerNotes: Partial<Record<LayerId, [string, string][]>> = {
  mask: [
    ['Material', 'epoxy resist'],
    ['Role', 'protects bottom copper'],
  ],
  topMask: [
    ['Material', 'epoxy resist'],
    ['Role', 'protects top copper'],
  ],
  abf: [
    ['Material', 'Ajinomoto build-up film'],
    ['Role', 'dielectric between copper layers'],
  ],
  core: [
    ['Material', 'glass-weave epoxy'],
    ['Vias', 'plated through-holes'],
    ['Role', 'stiffness'],
  ],
};

/** Level 3 — the GB202 package. */
export const pkg = {
  meta: {
    name: 'GB202 package',
    scale: '5 cm',
    description: 'Flip-chip BGA: the die sits face-down on an organic substrate that fans its pins out to the board.',
  },
  follow:
    'Up through a solder ball, the copper layers of the substrate and a C4 micro-bump: now it is inside the silicon.',
  captions: {
    intro: 'Flip-chip BGA: GB202 die on an organic substrate',
    peel: 'Peeling the substrate apart (thicknesses ×5)',
    stack: (layer: string) => `Build-up stack · ${layer}`,
    counts: (balls: number, bumps: number) =>
      `${balls.toLocaleString('en-US')} BGA balls below · ~${bumps.toLocaleString('en-US')} C4 bumps above`,
    die: 'Die: TSMC 4N · ~750 mm² · 92.2 billion transistors',
  },
  controls: { peel: 'Peel apart' },
  layers,
  entities: {
    layer: (id: LayerId, th: number): EntityInfo => ({
      title: layers[id],
      kind: 'Package substrate · layer',
      specs: id.startsWith('cu')
        ? [
            ['Material', 'copper'],
            ['Role', 'fans die signals out to the balls'],
            ['Drawn thickness', `${th} mm (×5)`],
          ]
        : [...(layerNotes[id] ?? []), ['Drawn thickness', `${th} mm (×5)`]],
    }),
    bumps: (count: number): EntityInfo => ({
      title: 'C4 micro-bumps',
      kind: 'Die attach',
      specs: [
        ['Modelled', count.toLocaleString('en-US')],
        ['Pitch (drawn)', '0.48 mm'],
      ],
      note: 'The die is flipped face-down: these solder bumps carry every signal and every amp between silicon and substrate.',
    }),
    die: e({
      title: 'GB202 die',
      kind: 'Silicon · Blackwell',
      specs: [
        ['Area', '~750 mm²'],
        ['Transistors', '92.2 billion'],
        ['Process', 'TSMC 4N'],
      ],
      note: 'Dive in to see the floorplan (next scale).',
    }),
    balls: (count: number, pitch: number): EntityInfo => ({
      title: 'BGA solder balls',
      kind: 'Package → board',
      specs: [
        ['Modelled', count.toLocaleString('en-US')],
        ['Pitch (drawn)', `${pitch} mm`],
      ],
      note: 'Power, ground and I/O: most balls carry current to and from the board, not data.',
    }),
  },
};
