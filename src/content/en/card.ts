import type { EntityInfo } from '../../core/types';

const e = (x: EntityInfo): EntityInfo => x;

/** Level 1 — GeForce RTX 5090 Founders Edition. */
export const card = {
  meta: {
    name: 'GeForce RTX 5090',
    scale: '30 cm',
    description: 'Founders Edition · 304 × 137 mm · dual-slot · 575 W. Everything below lives inside it.',
  },
  follow:
    'Trace: a bit of data arrives from the CPU over the PCIe 5.0 x16 fingers and crosses the flex cable to the GPU.',
  /** Story captions, in order (switch points live in the level). */
  captions: [
    'Two fans drive air straight through the fins. This is the machine.',
    'The fans spin down so you can see inside',
    'Exploded: shroud · two fin stacks · vapour chamber · heat pipes',
    'Under the cooler: one main board, two smaller ones on flex cables',
    'Follow the power onto the board',
  ],
  controls: { disassembly: 'Disassembly', fans: 'Fans' },
  thermal: {
    gpu: 'GPU die',
    cooler: 'Vapor chamber + pipes',
    fins: 'Fin stacks',
    cfins: 'Centre fins',
    mem: 'GDDR7',
    vrm: 'VRM',
    pcb: 'PCB',
    case: 'Shroud',
  },
  entities: {
    fan: (n: number): EntityInfo => ({
      title: `Fan ${n}`,
      kind: 'Cooling · axial fan',
      specs: [
        ['Blades', '7, joined by an outer ring'],
        ['Airflow', 'straight through the fins'],
        ['Layout', 'double flow-through'],
      ],
      note: 'Both fans sit on the same face and push air through the card instead of across it: the short main PCB leaves the fin stacks open on both sides.',
    }),
    shroud: e({
      title: 'Shroud',
      kind: 'Enclosure · aluminium frame',
      specs: [
        ['Size', '304 × 137 mm'],
        ['Thickness', 'dual-slot'],
        ['Finish', 'dark gunmetal'],
      ],
    }),
    fins: (count: number): EntityInfo => ({
      title: 'Fin stacks',
      kind: 'Cooling · heatsink',
      specs: [
        ['Stacks', '2 (one per fan)'],
        ['Fins modelled', String(count)],
        ['Material', 'aluminium'],
      ],
      note: 'Heat arrives through the copper heat pipes and leaves into the air pushed between the fins.',
    }),
    centreFins: e({
      title: 'Centre fin block',
      kind: 'Cooling · heatsink',
      specs: [['Sits on', 'the vapor chamber']],
    }),
    vaporChamber: e({
      title: '3D vapor chamber + heat pipes',
      kind: 'Cooling · two-phase',
      specs: [
        ['Interface', 'liquid metal on the GPU'],
        ['Heat pipes (modelled)', '5'],
        ['Material', 'copper'],
      ],
      note: 'Water inside the chamber boils over the GPU, condenses in the fins and wicks back: up to 575 W moved with a few degrees of drop.',
    }),
    bottomCover: e({ title: 'Bottom cover', kind: 'Enclosure', specs: [['Covers', 'main PCB only']] }),
    pcieBoard: e({
      title: 'PCIe board',
      kind: 'Board · interface',
      specs: [
        ['Link', 'PCIe 5.0 × 16'],
        ['Connection', 'flex cable to main PCB'],
      ],
    }),
    ioBoard: e({
      title: 'Display I/O board',
      kind: 'Board · outputs',
      specs: [
        ['Outputs', '3 × DisplayPort 2.1b'],
        ['', '1 × HDMI 2.1b'],
      ],
    }),
    mainPcb: e({
      title: 'Main PCB',
      kind: 'Board · main',
      specs: [
        ['Carries', 'GPU, 16 GDDR7, VRM'],
        ['Size', 'compact, mid-card'],
      ],
      note: 'Dive in to see it up close (next scale).',
    }),
    gpu: e({
      title: 'GB202',
      kind: 'GPU · Blackwell',
      specs: [
        ['Transistors', '92.2 billion'],
        ['Die area', '~750 mm²'],
        ['Process', 'TSMC 4N'],
        ['SMs', '170 of 192 enabled'],
      ],
    }),
    memory: (n: number): EntityInfo => ({
      title: `GDDR7 #${n}`,
      kind: 'Memory · GDDR7',
      specs: [
        ['Capacity', '2 GB'],
        ['Interface', '32-bit'],
        ['Speed', '28 Gbps'],
      ],
      note: '16 chips × 32 bits = the 512-bit bus: 1.79 TB/s together.',
    }),
    choke: e({
      title: 'Power stage choke',
      kind: 'Power delivery · VRM',
      specs: [
        ['Input', '12 V'],
        ['Output', '~1 V core'],
      ],
      note: 'Many phases in parallel step 12 V down to the ~1 V the GPU runs at, hundreds of amps in total.',
    }),
    powerConnector: e({
      title: '12V-2x6 connector',
      kind: 'Power input',
      specs: [
        ['Rated', 'up to 600 W'],
        ['Card TGP', '575 W'],
      ],
    }),
  },
};
