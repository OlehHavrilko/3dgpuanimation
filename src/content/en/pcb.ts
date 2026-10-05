import type { EntityInfo } from '../../core/types';

const e = (x: EntityInfo): EntityInfo => x;

/** Level 2 — the RTX 5090 FE main board. */
export const pcb = {
  meta: {
    name: 'Main PCB',
    scale: '10 cm',
    description: 'GB202 GPU ringed by 16 GDDR7 chips (32 GB, 512-bit), with power stages on both edges.',
  },
  follow:
    'On the board: one of many parallel power phases chops 12 V down to the ~1 V core rail, and the current heads under the GPU package.',
  captions: {
    intro: 'The board is a city: one GPU, sixteen memory chips, power everywhere',
    memoryOnline: (n: number) => `GDDR7 online: ${n} / 16 × 2 GB — 28 Gbps each`,
    bandwidth: '1.79 terabytes a second, all of it converging on GB202',
    outro: 'Into the GPU package',
  },
  controls: { dataFlow: 'Data flow' },
  thermal: { gpu: 'GPU die', cooler: 'Cooler (above)', mem: 'GDDR7', vrm: 'VRM', pcb: 'PCB' },
  entities: {
    pcieBoard: e({
      title: 'PCIe board',
      kind: 'Board · interface',
      specs: [
        ['Link', 'PCIe 5.0 × 16'],
        ['Bandwidth', '~64 GB/s each way'],
      ],
      note: 'On the 5090 FE the slot connector lives on its own small board, tied to the main PCB by a flex cable.',
    }),
    flex: e({ title: 'Flex cable', kind: 'Interconnect', specs: [['Joins', 'PCIe board ↔ main PCB']] }),
    mainPcb: e({
      title: 'Main PCB',
      kind: 'Board · main',
      specs: [
        ['Carries', 'GPU, memory, power'],
        ['Traces shown', '45° routed buses'],
      ],
    }),
    package: e({
      title: 'GB202 package',
      kind: 'GPU · flip-chip BGA',
      specs: [['Contains', 'die + organic substrate']],
      note: 'Dive in to peel it apart (next scale).',
    }),
    die: e({
      title: 'GB202 die',
      kind: 'GPU · Blackwell',
      specs: [
        ['Transistors', '92.2 billion'],
        ['Area', '~750 mm²'],
        ['Process', 'TSMC 4N'],
      ],
    }),
    memory: (n: number): EntityInfo => ({
      title: `GDDR7 · M${n}`,
      kind: 'Memory',
      specs: [
        ['Capacity', '2 GB'],
        ['Bus', `32-bit · channel ${n} of 16`],
        ['Data rate', '28 Gbps / pin'],
        ['Bandwidth', '112 GB/s'],
      ],
      note: 'Each chip has its own 32-bit controller on the die; 16 × 112 GB/s = 1.79 TB/s.',
    }),
    mlcc: (count: number): EntityInfo => ({
      title: 'MLCC capacitor',
      kind: 'Passive · decoupling',
      specs: [['Modelled', String(count)]],
      note: 'Tiny ceramic capacitors smooth the current spikes when thousands of cores switch at once.',
    }),
    phase: (n: number): EntityInfo => ({
      title: `Power phase ${n}`,
      kind: 'Power delivery · choke',
      specs: [
        ['Input', '12 V'],
        ['Output', '~1 V'],
      ],
    }),
    powerStage: e({
      title: 'Power stage (DrMOS)',
      kind: 'Power delivery · switch',
      specs: [['Role', 'switches 12 V at ~1 MHz']],
    }),
    polymerCap: e({
      title: 'Polymer capacitor',
      kind: 'Passive · bulk',
      specs: [['Role', 'input/output filtering']],
    }),
    fingers: e({
      title: 'PCIe gold fingers',
      kind: 'Interface',
      specs: [
        ['Contacts', '82 per side'],
        ['Generation', 'PCIe 5.0 × 16'],
      ],
    }),
    powerConnector: e({ title: '12V-2x6 connector', kind: 'Power input', specs: [['Rated', '600 W']] }),
    traceChip: (n: number): EntityInfo => ({
      title: `GDDR7 · M${n}`,
      kind: 'Memory',
      specs: [
        ['Width', '32 bits'],
        ['Per pin', '28 Gbps · PAM3'],
        ['Per chip', '112 GB/s'],
      ],
      note: 'A read starts here: the DRAM drives 32 data lines at once, three voltage levels per symbol (PAM3).',
    }),
    traceBus: (n: number): EntityInfo => ({
      title: `Memory bus · channel ${n}`,
      kind: 'PCB traces',
      specs: [
        ['Length', 'a few cm'],
        ['Routing', 'length-matched, impedance-controlled'],
      ],
      note: 'Every trace in the channel is tuned to the same length so all 32 bits arrive within picoseconds of each other.',
    }),
    traceArrival: (n: number): EntityInfo => ({
      title: 'GB202 package',
      kind: 'Arrival',
      specs: [
        ['Path', 'BGA ball → substrate → C4 bump'],
        ['Destination', `memory controller ${n}`],
      ],
      note: 'The signal drops through the package into the die. Follow it inside.',
    }),
  },
};
