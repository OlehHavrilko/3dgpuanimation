import type { EntityInfo } from '../../core/types';

const e = (x: EntityInfo): EntityInfo => x;
const pitchText = (um: number) => (um >= 1 ? `${um} µm` : `${Math.round(um * 1000)} nm`);

/** Level 5 — the BEOL metal stack. */
export const metal = {
  meta: {
    name: 'Metal stack',
    scale: '10 µm',
    description: '~15 copper layers wire 92 billion transistors together. Wires get thinner the deeper you go.',
  },
  follow:
    'Down through ~15 metal layers: via after via, from wires 10 µm wide to wires 28 nm apart, then into a contact.',
  /** Top (aluminium pad) to bottom (M1). */
  layerNames: [
    'AP (Al pad)',
    'M15',
    'M14',
    'M13',
    'M12',
    'M11',
    'M10',
    'M9',
    'M8',
    'M7',
    'M6',
    'M5',
    'M4',
    'M3',
    'M2',
    'M1',
  ],
  captions: {
    top: 'Fifteen layers of copper, stacked like city highways',
    layer: (name: string, pitchUm: number) => `${name} · pitch ${pitchText(pitchUm)}`,
    feol: 'The wires end here — next stop, the transistors',
  },
  entities: {
    layer: (name: string, pitchUm: number, alongZ: boolean, li: number): EntityInfo => ({
      title: name,
      kind: `Metal layer ${li === 0 ? '· aluminium' : '· copper'}`,
      specs: [
        ['Pitch', pitchText(pitchUm)],
        ['Direction', alongZ ? 'front ↔ back' : 'left ↔ right'],
        [
          'Role',
          li === 0
            ? 'bond pads / redistribution'
            : li <= 2
              ? 'power grid + clock (ultra-thick)'
              : li <= 6
                ? 'global routing'
                : li <= 10
                  ? 'intermediate routing'
                  : 'local wiring inside standard cells',
        ],
      ],
      note: 'Pitches are representative of a 4/5 nm-class stack; TSMC does not publish the exact 4N numbers.',
    }),
    via: e({
      title: 'Via',
      kind: 'Interconnect · vertical',
      specs: [
        ['Joins', 'adjacent metal layers'],
        ['Material', 'copper'],
      ],
      note: 'Wires on alternate layers run at right angles; vias are the only way a signal changes layer.',
    }),
    gateLines: (cppNm: number): EntityInfo => ({
      title: 'Gate lines',
      kind: 'Front end of line',
      specs: [['Gate pitch', `${cppNm} nm`]],
      note: 'The transistor level. Dive in (next scale).',
    }),
    contact: e({
      title: 'Contact',
      kind: 'Middle of line',
      specs: [
        ['Material', 'tungsten / cobalt'],
        ['Joins', 'transistor ↔ M1'],
      ],
    }),
  },
};
