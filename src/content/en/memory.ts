import type { EntityInfo } from '../../core/types';

const e = (x: EntityInfo): EntityInfo => x;

/**
 * The memory branch: a side descent from one GDDR7 chip on the RTX 5090 board down to the
 * charge that is one bit. It lives on its own page (memory.html) and reuses the descent engine.
 */
export const memory = {
  page: {
    title: 'GPU → Memory → Bit',
    description:
      'A side branch of the DieDive descent: from one GDDR7 chip of the RTX 5090 to the capacitor that holds a single bit.',
    brand: 'MEMORY',
    branchTag: 'Side branch · memory',
    back: '◂ Back to the main descent',
    backTitle: 'Return to the main descent at the memory chips',
    open: 'Memory branch ▸',
    openTitle: 'Side branch: from a GDDR7 chip down to one bit',
    play: 'Play',
    pause: 'Pause',
    playTitle: 'Play the branch (Space)',
    end: 'That was one bit. The main descent goes on into the GPU itself.',
    endBack: 'Back to the GPU',
  },
  chip: {
    meta: {
      name: 'GDDR7 chip',
      scale: '2 cm',
      description: 'One of the sixteen memory chips around the GPU: 16 Gbit (2 GB) on its own 32-bit bus.',
    },
    captions: {
      intro: 'Sixteen of these ring the GPU: 16 × 2 GB = the card’s 32 GB',
      pam3: 'PAM3: every symbol is one of three voltage levels, not two — 3 bits per 2 symbols',
      channels: 'Inside, one 32-bit chip is four independent 8-bit channels',
      xray: 'Under the black mould: a substrate, the balls, and the DRAM die',
      die: 'The die: a memory array split by a strip of logic. Dive in',
    },
    entities: {
      chip: (n: number) =>
        e({
          title: `GDDR7 · M${n}`,
          kind: 'Memory · package',
          specs: [
            ['Capacity', '16 Gbit (2 GB)'],
            ['Interface', '32 bit · 4 × 8-bit channels'],
            ['Data rate', '28 Gbit/s per pin (RTX 5090)'],
            ['Signalling', 'PAM3'],
          ],
          note: 'Per chip: 28 Gbit/s × 32 pins ÷ 8 = 112 GB/s. Sixteen of them make the card’s 1.79 TB/s.',
        }),
      neighbour: e({
        title: 'GDDR7 (neighbour)',
        kind: 'Memory · package',
        specs: [
          ['Capacity', '16 Gbit (2 GB)'],
          ['Bus', 'its own 32 bits'],
        ],
        note: 'Every chip has its own memory controller on the GPU: sixteen buses side by side make 512 bits.',
      }),
      gpu: e({
        title: 'GB202 package (edge)',
        kind: 'GPU',
        specs: [['Memory controllers', '16 × 32-bit']],
        note: 'The traces between the GPU and each chip are a few centimetres long and length-matched.',
      }),
      traces: e({
        title: 'Memory bus traces',
        kind: 'PCB · signals',
        specs: [
          ['Per chip', '32 data + clock + command'],
          ['Levels', '−1 · 0 · +1 (PAM3)'],
        ],
        note: 'The pulses are coloured by level. Real symbols are ~70 ps long: here they are slowed billions of times.',
      }),
      balls: (count: number) =>
        e({
          title: 'FBGA balls',
          kind: 'Package → board',
          specs: [
            ['Count', `${count} (266-ball FBGA)`],
            ['Colour', 'channel A · B · C · D'],
          ],
          note: 'Which ball belongs to which channel is drawn by quadrant, not from the real ball map.',
        }),
      substrate: e({
        title: 'Package substrate',
        kind: 'Package',
        specs: [['Role', 'routes die pads to the 266 balls']],
      }),
      die: e({
        title: 'DRAM die',
        kind: 'Silicon · 10 nm-class DRAM',
        specs: [
          ['Capacity', '16 Gbit = 17.2 billion cells'],
          ['Process', '10 nm-class (1b generation)'],
        ],
        note: 'Dive in to see its floorplan (next scale).',
      }),
    },
  },
  die: {
    meta: {
      name: 'DRAM die',
      scale: '5 mm',
      description: 'Two cell arrays split by a strip of logic: I/O, command decoder and the data path.',
    },
    captions: {
      intro: 'Most of the die is memory cells; the strip down the middle is everything else',
      strip: 'The centre strip: PAM3 transceivers, command decoder, global data path',
      activate: (bank: string) => `ACTIVATE · ${bank}: one row of one bank opens`,
      mats: 'Each bank is a grid of small arrays (mats), each with its own sense amplifiers',
      dive: 'Into one mat: a few hundred nanometres of cells',
    },
    channel: (c: string) => `Channel ${c}`,
    bank: (c: string, b: number) => `Bank ${c}${b}`,
    entities: {
      strip: e({
        title: 'Peripheral strip',
        kind: 'Logic · I/O',
        specs: [
          ['Holds', 'I/O, command, data path'],
          ['Pads', 'to the package substrate'],
        ],
        note: 'GDDR dies put the pads and logic in a strip between the cell arrays, as TechInsights’ GDDR7 floorplan shows.',
      }),
      pam3: e({
        title: 'PAM3 transceivers',
        kind: 'I/O',
        specs: [
          ['Levels', '3 (−1, 0, +1)'],
          ['Rate', '28 Gbit/s per pin'],
        ],
        note: 'Turning three voltage levels into bits and back, at tens of gigabits per second, is most of what the strip does.',
      }),
      bank: (name: string, channel: string) =>
        e({
          title: name,
          kind: `Memory · ${channel}`,
          specs: [
            ['Opens', 'one row at a time'],
            ['Made of', 'mats + sense amplifiers'],
          ],
          note: 'The bank count and layout are representative: the floorplan of this exact chip is not published.',
        }),
      row: e({
        title: 'Open row',
        kind: 'Memory · page',
        specs: [['Sensed', 'every cell on one wordline']],
        note: 'Opening a row copies the whole row into the sense amplifiers; reads then pick bytes out of it.',
      }),
    },
  },
  array: {
    meta: {
      name: 'Cell array',
      scale: '1 µm',
      description: 'Buried wordlines, bitlines, and a forest of capacitors: one cell per wordline-bitline crossing.',
    },
    captions: {
      intro: 'Each pillar is a capacitor. Each capacitor is one bit',
      pitch: 'Wordlines every 32.6 nm, bitlines every 37.6 nm (a 1b-generation cell)',
      activate: 'A wordline goes high: every cell on it shares its charge with a bitline',
      sense: 'Sense amplifiers turn a few tens of millivolts into a clean 1 or 0',
      dive: 'Into one cell',
    },
    entities: {
      capacitor: (bit: number) =>
        e({
          title: `Storage capacitor · ${bit ? '1' : '0'}`,
          kind: 'DRAM · cell',
          specs: [
            ['Holds', bit ? 'charge (a 1)' : 'no charge (a 0)'],
            ['Shape', 'tall cylinder'],
          ],
          note: 'Capacitors are made tall and thin to keep their capacitance while the cell shrinks.',
        }),
      wordline: e({
        title: 'Wordline',
        kind: 'DRAM · row',
        specs: [
          ['Pitch', '32.6 nm'],
          ['Buried', 'in the silicon'],
        ],
        note: 'The wordline is the gate of every access transistor in its row; it is buried in a trench to keep leakage low.',
      }),
      bitline: e({
        title: 'Bitline',
        kind: 'DRAM · column',
        specs: [
          ['Pitch', '37.6 nm'],
          ['Ends at', 'a sense amplifier'],
        ],
        note: 'One bitline serves hundreds of cells; only the one on the open row talks to it.',
      }),
      senseAmp: e({
        title: 'Sense amplifiers',
        kind: 'DRAM · circuit',
        specs: [
          ['Input', 'a few tens of mV'],
          ['Output', 'full 1 or 0'],
        ],
        note: 'A cross-coupled latch: it amplifies the tiny difference and writes the full value back to the cell.',
      }),
    },
  },
  cell: {
    meta: {
      name: 'One cell · one bit',
      scale: '100 nm',
      description: 'One transistor, one capacitor. The bit is a few tens of thousands of electrons.',
    },
    captions: {
      intro: 'One transistor and one capacitor: the whole memory cell',
      bit: 'This cell is charged: tens of thousands of extra electrons. Call it a 1',
      read: 'Wordline on: the charge spills onto the bitline. Reading empties the cell',
      restore: 'The sense amplifier writes the value straight back',
      leak: 'Charge leaks away, so every row is refreshed — the whole chip every 32 ms',
      end: '16 chips × 16 Gbit ≈ 275 billion of these. That was one bit',
    },
    electrons: (n: number) => `${n.toLocaleString('en-US')} e⁻ (each dot ≈ 100)`,
    entities: {
      capacitor: e({
        title: 'Storage capacitor',
        kind: 'DRAM cell · C',
        specs: [
          ['Capacitance', '~10 fF (order of magnitude)'],
          ['Dielectric', 'high-k (ZrO₂-based)'],
          ['Electrodes', 'TiN'],
        ],
        note: 'Only its base fits in the frame: the real cylinder is many times taller than it is wide.',
      }),
      transistor: e({
        title: 'Access transistor',
        kind: 'DRAM cell · T',
        specs: [
          ['Gate', 'buried wordline'],
          ['Role', 'connects capacitor ↔ bitline'],
        ],
        note: 'Off almost all the time. Its leakage, not the capacitor, decides how long a bit survives.',
      }),
      wordline: e({
        title: 'Buried wordline',
        kind: 'Gate · TiN',
        specs: [['Lies', 'in a trench below the surface']],
      }),
      bitline: e({
        title: 'Bitline',
        kind: 'Column wire',
        specs: [['Shared by', 'hundreds of cells']],
      }),
      contact: e({
        title: 'Storage-node contact',
        kind: 'Plug',
        specs: [['Joins', 'transistor drain → capacitor']],
      }),
      electrons: e({
        title: 'Stored charge',
        kind: 'The bit',
        specs: [
          ['Charge', '~10 fF × ~0.5 V'],
          ['Electrons', '~30,000'],
        ],
        note: 'Q = C·V: about 31,000 electrons. A 0 is the same cell, empty.',
      }),
      substrate: e({
        title: 'Silicon + isolation',
        kind: 'Substrate',
        specs: [['Between cells', 'oxide trenches (STI)']],
      }),
    },
  },
  /** "How accurate is this?" per branch scale, same three buckets as the main descent. */
  accuracy: [
    {
      spec: [
        '16 chips × 16 Gbit (2 GB), 32 bits each: 512-bit bus, 28 Gbit/s per pin',
        'GDDR7: PAM3 signalling, four independent 8-bit channels per chip',
        '266-ball FBGA package (Samsung 16 Gb GDDR7 listing)',
      ],
      representative: [
        'Package and die size, ball map and inner construction (not published)',
        'Which balls belong to which channel: drawn by quadrant',
      ],
      notToScale: ['Data pulses move billions of times slower than real signals'],
    },
    {
      spec: [
        'Two cell arrays split by a central strip of I/O, command and data-path logic (TechInsights GDDR7 floorplan)',
      ],
      representative: [
        'Bank count, bank and mat layout, the size of the strip',
        'Die size (not published for this chip)',
      ],
      notToScale: ['The open row is drawn hundreds of times wider than it is'],
    },
    {
      spec: [
        'Wordline pitch 32.6 nm, bitline pitch 37.6 nm, ~12.5 nm feature size: a Samsung 1b-generation DRAM measured by TechInsights',
      ],
      representative: [
        'The process of the RTX 5090’s own GDDR7 is not published: 1b-class figures are used',
        'Capacitor height and spacing, sense-amplifier layout',
      ],
      notToScale: ['Capacitors are cut short: real ones are far taller than the frame shows'],
    },
    {
      spec: [
        '1T1C: one access transistor and one capacitor per bit',
        'Refresh: 16K refresh cycles every 32 ms (Samsung 16 Gb GDDR7 listing)',
      ],
      representative: [
        'Cell capacitance ~10 fF and stored ~0.5 V: order of magnitude, not published for this chip',
        '~31,000 electrons = 10 fF × 0.5 V ÷ e (the plate sits at half the supply)',
        'Whether a charged cell reads as 1 or 0 depends on the cell (true or complement); here it is a 1',
        'Buried wordline, contact and capacitor shapes: a typical modern cell',
      ],
      notToScale: [
        'Each dot stands for ~100 electrons',
        'Reading, restoring and leaking are slowed down by many orders of magnitude',
      ],
    },
  ],
  reference: {
    sourcesIntro:
      'The published figures in the memory branch come from these documents. Everything else is representative; each scale says which under “How accurate is this?”.',
    sources: [
      {
        title: 'GeForce RTX 5090',
        publisher: 'NVIDIA, product page',
        url: 'https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5090/',
        covers: '32 GB GDDR7 on a 512-bit bus',
      },
      {
        title: 'JEDEC Publishes GDDR7 Graphics Memory Standard (JESD239)',
        publisher: 'JEDEC, press release',
        url: 'https://www.jedec.org/node/9394',
        covers: 'PAM3 signalling, four independent channels per device, 16–32 Gbit densities',
      },
      {
        title: 'GDDR7',
        publisher: 'Samsung Semiconductor, product page',
        url: 'https://semiconductor.samsung.com/dram/gddr/gddr7/',
        covers: 'PAM3: three signal levels instead of the two of NRZ',
      },
      {
        title: 'Samsung’s next-gen GDDR7 official listing: 28 Gbps or 32 Gbps',
        publisher: 'TweakTown, news',
        url: 'https://www.tweaktown.com/news/97133/samsungs-next-gen-gddr7-official-listing-gpus-to-get-28gbps-or-32gbps/',
        covers: '16 Gb GDDR7 (K4VAF325ZC-SC28): 266-ball FBGA, 32-bit, refresh 16K / 32 ms',
      },
      {
        title: 'Samsung K4VOF165ZC D1b GDDR7 DRAM Memory Floorplan Analysis',
        publisher: 'TechInsights, report summary',
        url: 'https://www.techinsights.com/blog/samsung-k4vof165zc-d1b-12-gb-gddr7-dram-memory-floorplan-analysis',
        covers:
          'GDDR7 die: two memory regions split by a central peripheral strip (I/O, command, data path); 10 nm-class D1b, EUV',
      },
      {
        title: 'Samsung packs a DRAM gigabit into just over 2 mm² (TechInsights D1b analysis)',
        publisher: 'ETN, news',
        url: 'https://etn.fi/index.php/kolumni-ecf/13-news/16863-samsung-ahtaa-jo-dram-gigabitin-reiluun-2-nelioemilliin',
        covers: 'Samsung D1b: wordline pitch 32.6 nm, bitline pitch 37.6 nm, 12.54 nm line width',
      },
      {
        title: 'Sense amplifier with array-noise gating for 10 fF cells',
        publisher: 'VLSI Symposium 2011, paper 22-2 (abstract)',
        url: 'https://archive.vlsisymposium.org/11web/circuits/cir_abstract/22-2.htm',
        covers: 'Stable sensing at a 10 fF cell capacitance: the order of magnitude used here',
      },
    ],
    glossary: [
      {
        term: 'GDDR7',
        level: 0,
        def: 'Graphics memory standard (JEDEC JESD239). One chip: a 32-bit bus split into four 8-bit channels.',
      },
      {
        term: 'PAM3',
        level: 0,
        def: 'Pulse-amplitude modulation with three levels (−1, 0, +1): three bits ride on two symbols instead of two.',
      },
      { term: 'FBGA', level: 0, def: 'Fine-pitch ball grid array: the package sits on a grid of solder balls.' },
      {
        term: 'Channel',
        level: 1,
        def: 'An independent slice of the chip with its own commands; GDDR7 has four per chip.',
      },
      {
        term: 'Bank',
        level: 1,
        def: 'A block of the array that can open one row at a time, independently of the others.',
      },
      {
        term: 'Row (page)',
        level: 1,
        def: 'All the cells on one wordline; ACTIVATE copies a row into the sense amplifiers.',
      },
      { term: 'Wordline', level: 2, def: 'The row wire: the gate of every access transistor in its row.' },
      { term: 'Bitline', level: 2, def: 'The column wire that carries a cell’s charge to its sense amplifier.' },
      {
        term: 'Sense amplifier',
        level: 2,
        def: 'A latch that turns a few tens of millivolts on a bitline into a full 1 or 0 and writes it back.',
      },
      { term: '1T1C', level: 3, def: 'One transistor, one capacitor: the DRAM cell.' },
      {
        term: 'Refresh',
        level: 3,
        def: 'Reading and rewriting every row before its charge leaks away; here every 32 ms.',
      },
      { term: 'fF (femtofarad)', level: 3, def: '10⁻¹⁵ farad. A DRAM cell holds about ten of them.' },
    ],
  },
};
