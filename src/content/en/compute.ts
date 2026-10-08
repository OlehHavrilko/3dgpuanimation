import type { EntityInfo } from '../../core/types';

const e = (x: EntityInfo): EntityInfo => x;

/**
 * The compute branch: a side descent from one Streaming Multiprocessor of the GB202 die to a
 * single FP32 fused multiply-add and the logic gates it is made of. It lives on its own page
 * (compute.html) and reuses the descent engine.
 */
export const compute = {
  page: {
    title: 'GPU → Compute → Gate',
    description:
      'A side branch of the GPU → Atom descent: from one Streaming Multiprocessor of the GB202 die to a single FP32 multiply-add and the logic gates it is made of.',
    brand: 'COMPUTE',
    branchTag: 'Side branch · compute',
    back: '◂ Back to the main descent',
    backTitle: 'Return to the main descent at the GB202 die',
    open: 'Compute branch ▸',
    openTitle: 'Side branch: from one SM down to a single multiply-add',
    play: 'Play',
    pause: 'Pause',
    playTitle: 'Play the branch (Space)',
    end: 'That was one multiply-add, built from NAND gates. The main descent goes on into the transistor.',
    endBack: 'On to the transistor',
  },
  sm: {
    meta: {
      name: 'Streaming Multiprocessor',
      scale: '1 mm',
      description: 'One of the 192 SMs of the GB202: four sub-partitions that share an L1 / shared memory.',
    },
    captions: {
      intro: 'One SM: the unit the GPU repeats 192 times across the die',
      parts: 'Four sub-partitions, each with its own warp scheduler, register file and CUDA cores',
      cores: '4 × 32 = 128 CUDA cores, plus a tensor core per partition',
      memory: 'A 256 KB register file, and 128 KB of L1 / shared memory underneath',
      issue: 'A scheduler issues one instruction to a warp: 32 threads at once',
      dive: 'Into the 32 cores that run that warp',
    },
    partition: (n: number) => `Sub-partition ${n}`,
    entities: {
      slab: e({
        title: 'GB202 die (silicon)',
        kind: 'Silicon',
        specs: [['Holds', '192 SMs in 12 GPCs']],
        note: 'The die is cut away around one SM so you can see how it is laid out.',
      }),
      partition: (n: number) =>
        e({
          title: `Sub-partition ${n}`,
          kind: 'SM · processing block',
          specs: [
            ['CUDA cores', '32'],
            ['Warp scheduler', '1 (issues 1 warp per clock)'],
            ['Tensor core', '1 (5th generation)'],
          ],
          note: 'Four of these make an SM. The block positions drawn here are representative.',
        }),
      cores: e({
        title: 'CUDA cores',
        kind: 'SM · FP32 / INT32',
        specs: [
          ['Per SM', '128'],
          ['Per sub-partition', '32 = one warp'],
          ['Each does', 'one FP32 FMA per clock'],
        ],
        note: 'On the RTX 5090: 170 SMs × 128 = 21,760 of them.',
      }),
      registers: e({
        title: 'Register file',
        kind: 'SM · registers',
        specs: [
          ['Per SM', '256 KB'],
          ['Per sub-partition', '64 KB'],
        ],
        note: 'Each thread of a warp keeps its own registers here, so thousands of threads stay resident at once.',
      }),
      tensor: e({
        title: 'Tensor core',
        kind: 'SM · matrix unit',
        specs: [
          ['Per SM', '4 (5th generation)'],
          ['Does', 'small matrix multiply-accumulate'],
        ],
        note: 'Next to the CUDA cores, and not followed here: the descent takes the plain FP32 path.',
      }),
      scheduler: e({
        title: 'Warp scheduler',
        kind: 'SM · control',
        specs: [
          ['Picks', 'a ready warp each clock'],
          ['Issues', 'one instruction for 32 threads'],
        ],
        note: 'It does not run the arithmetic: it decides which warp goes next and sends the instruction to the cores.',
      }),
      l1: e({
        title: 'L1 cache / shared memory',
        kind: 'SM · memory',
        specs: [
          ['Per SM', '128 KB'],
          ['Shared by', 'all four sub-partitions'],
        ],
        note: 'The programmer chooses how much of it is shared memory and how much is cache.',
      }),
      fixed: e({
        title: 'Texture units and RT core',
        kind: 'SM · fixed function',
        specs: [
          ['Texture units', '4 per SM'],
          ['RT core', '1 per SM'],
        ],
        note: 'Graphics hardware that shares the SM: not on the path of a plain multiply-add.',
      }),
    },
  },
  warp: {
    meta: {
      name: 'One warp',
      scale: '400 µm',
      description: 'Thirty-two lanes, one instruction: every lane does the same thing to its own numbers.',
    },
    captions: {
      intro: 'One sub-partition: 32 lanes in a block, fed by one scheduler',
      instr: 'The instruction: FFMA R4, R1, R2, R3 — d = a × b + c in single precision',
      lockstep: 'All 32 lanes execute it in the same clock, each on its own data',
      operands: 'Each lane reads three registers, a, b and c, and writes one: d',
      dive: 'Into one lane, and the multiply-add inside it',
    },
    lane: (i: number) => `Lane ${i}`,
    entities: {
      lane: (i: number, a: number, b: number, c: number, d: number) =>
        e({
          title: `Lane ${i}`,
          kind: 'Warp · one thread',
          specs: [
            ['a × b + c', `${a} × ${b} + ${c}`],
            ['d', `${d}`],
          ],
          note: 'The numbers are chosen to be easy to read. A real warp holds whatever the program put in its registers.',
        }),
      scheduler: e({
        title: 'Warp scheduler',
        kind: 'Sub-partition · control',
        specs: [['Issues', 'one warp instruction per clock']],
        note: 'One instruction, 32 threads: NVIDIA calls this SIMT.',
      }),
      registers: e({
        title: 'Register file (64 KB)',
        kind: 'Sub-partition · registers',
        specs: [
          ['Holds', 'R0, R1, R2… of all resident warps'],
          ['Lane width', '32 bit per register'],
        ],
        note: 'Reading a, b and c and writing d are four register-file accesses for each lane.',
      }),
      instruction: e({
        title: 'FFMA R4, R1, R2, R3',
        kind: 'SASS instruction',
        specs: [
          ['Means', 'R4 = R1 × R2 + R3'],
          ['Precision', 'float32, one rounding'],
        ],
        note: 'FFMA is the fused multiply-add instruction for FP32. The register numbers are an example.',
      }),
      operands: e({
        title: 'Operand columns',
        kind: 'Warp · data',
        specs: [
          ['Bars', 'a, b, c in; d out'],
          ['Height', 'the lane’s value'],
        ],
        note: 'Four bars per lane: the first three are read, the last one is the result written back.',
      }),
    },
  },
  fma: {
    meta: {
      name: 'FP32 multiply-add',
      scale: '50 µm',
      description:
        'd = a × b + c on 32-bit floats: exponents added, 24 × 24 bit significands multiplied, one rounding.',
    },
    captions: {
      intro: 'Three 32-bit numbers in, one out: d = a × b + c',
      fields: 'A float32 is 1 sign bit, 8 exponent bits and 23 mantissa bits',
      multiply: 'Multiply: signs XOR, exponents add, and 24 × 24 bits of significand meet in an array',
      add: 'The product meets c, lined up by exponent, and they are added with no rounding in between',
      pack: 'Normalise, round once, pack: π × e + 0.25 ≈ 8.79',
      dive: 'Down to the gates that do the adding',
    },
    fieldNames: { sign: 'sign', exponent: 'exponent', mantissa: 'mantissa' },
    entities: {
      operand: (name: string, value: number, bits: string) =>
        e({
          title: `Operand ${name} = ${value}`,
          kind: 'float32 · 32 bits',
          specs: [
            ['Sign · exp · mantissa', bits],
            ['Value', `${value}`],
          ],
          note: 'value = (−1)^sign × 1.mantissa × 2^(exponent − 127)',
        }),
      result: (value: number, bits: string) =>
        e({
          title: `Result d = ${value}`,
          kind: 'float32 · 32 bits',
          specs: [
            ['Sign · exp · mantissa', bits],
            ['Value', `${value}`],
          ],
          note: 'The exact π × e + 0.25 has more than 24 significant bits: this is where it is rounded, once, to the nearest float32.',
        }),
      exponent: e({
        title: 'Exponent adder',
        kind: 'FMA · 8-bit',
        specs: [
          ['Computes', 'ea + eb − 127'],
          ['Also', 'sign = sa XOR sb'],
        ],
        note: 'Multiplying numbers adds their exponents; the bias 127 is counted twice, so one is taken off.',
      }),
      multiplier: e({
        title: 'Significand multiplier array',
        kind: 'FMA · 24 × 24 bit',
        specs: [
          ['Inputs', 'two 24-bit significands'],
          ['Output', 'exact 48-bit product'],
          ['Cells', '24 rows of partial products'],
        ],
        note: 'Each row is one shifted copy of a. Real multipliers recode the bits (Booth) and sum the rows in a tree to be faster; the grid here is the idea, not the layout.',
      }),
      aligner: e({
        title: 'Alignment shifter',
        kind: 'FMA · shifter',
        specs: [['Shifts', 'c to the product’s exponent']],
        note: 'Numbers can only be added when their binary points line up.',
      }),
      adder: e({
        title: 'Wide adder',
        kind: 'FMA · adder',
        specs: [
          ['Adds', 'product + aligned c'],
          ['Width', 'about 3 × 24 bits'],
        ],
        note: 'The product is kept exact (all 48 bits) until this sum: that is what makes the operation fused.',
      }),
      round: e({
        title: 'Normalise and round',
        kind: 'FMA · output stage',
        specs: [
          ['Finds', 'the leading 1'],
          ['Rounds', 'once, to 23 bits'],
        ],
        note: 'The result is shifted so it starts with 1., rounded to nearest even, and packed into sign, exponent and mantissa.',
      }),
    },
  },
  gates: {
    meta: {
      name: 'Logic gates',
      scale: '1 µm',
      description: 'A full adder: nine NAND gates, 36 transistors. One of them sits under every bit of the adder.',
    },
    captions: {
      intro: 'A full adder adds three bits: a, b and a carry in. Nine NAND gates make one',
      nand: 'A NAND outputs 0 only when both inputs are 1: all other logic can be built from it',
      xor: 'Four NANDs make a XOR; four more XOR it with the carry in (the sum), and one makes the carry out',
      adds: 'Inputs step through all eight cases: sum + 2 × carry out always equals a + b + carry in',
      cmos: 'One NAND is four transistors: two PMOS in parallel above, two NMOS in series below',
      end: '9 gates × 4 transistors = 36 per bit. Each is a FinFET: the next scale',
    },
    lamps: { a: 'a', b: 'b', cin: 'carry in', sum: 'sum', cout: 'carry out' },
    roles: {
      n1: 'NOT (a AND b)',
      n2: 'XOR, first half',
      n3: 'XOR, first half',
      n4: 'a XOR b',
      n5: 'XOR with carry in',
      n6: 'XOR with carry in',
      n7: 'XOR with carry in',
      n8: 'sum',
      n9: 'carry out',
    },
    entities: {
      gate: (id: string, role: string) =>
        e({
          title: `NAND ${id}`,
          kind: 'Logic gate',
          specs: [
            ['Function', 'out = NOT (x AND y)'],
            ['Role here', role],
            ['Transistors', '4 (CMOS)'],
          ],
          note: 'The nine-gate layout of a NAND-only full adder is the textbook one; a real library cell may be built differently.',
        }),
      input: (name: string) =>
        e({
          title: `Input ${name}`,
          kind: 'Net · input',
          specs: [['Carries', 'one bit']],
          note: 'High (1) is the supply voltage; low (0) is ground.',
        }),
      output: (name: string) =>
        e({
          title: `Output ${name}`,
          kind: 'Net · output',
          specs: [['Carries', 'one bit']],
        }),
      wire: e({
        title: 'Interconnect',
        kind: 'Metal · wire',
        specs: [['Lit', 'when the net is 1']],
        note: 'In the chip these are the thin copper wires of the metal stack, a few layers above the gates.',
      }),
      pmos: e({
        title: 'PMOS transistor',
        kind: 'FinFET · pull-up',
        specs: [
          ['Count in a NAND', '2, in parallel'],
          ['Conducts when', 'its input is 0'],
        ],
        note: 'If either input is 0, one of them pulls the output up to the supply.',
      }),
      nmos: e({
        title: 'NMOS transistor',
        kind: 'FinFET · pull-down',
        specs: [
          ['Count in a NAND', '2, in series'],
          ['Conducts when', 'its input is 1'],
        ],
        note: 'Only when both inputs are 1 does the stack connect the output to ground.',
      }),
    },
  },
  /** "How accurate is this?" per branch scale, same three buckets as the main descent. */
  accuracy: [
    {
      spec: [
        'An SM has four sub-partitions, 128 CUDA cores, four tensor cores, a 256 KB register file and 128 KB of L1 / shared memory (NVIDIA RTX Blackwell whitepaper)',
        'A warp is 32 threads, issued together by one scheduler',
        '192 SMs on the full GB202, 170 on the RTX 5090',
      ],
      representative: [
        'The floorplan: block positions and sizes inside the SM are not published',
        'The SM’s size on the die (about a millimetre across)',
        'Where the tensor cores, texture units and RT core sit',
      ],
      notToScale: ['The die is cut away to a thin slab around the SM; the L1 block is drawn flat'],
    },
    {
      spec: [
        '32 lanes per warp, one instruction for all of them (CUDA programming guide)',
        'FFMA: a single-precision fused multiply-add instruction',
      ],
      representative: [
        'The lane layout (8 × 4) and the register numbers in FFMA R4, R1, R2, R3',
        'The lane values are chosen to be readable',
        'Block sizes: a 64 KB register file is drawn as one block',
      ],
      notToScale: ['The clock is stretched billions of times: a real warp finishes in nanoseconds'],
    },
    {
      spec: [
        'float32 (IEEE 754 binary32): 1 sign bit, 8 exponent bits with bias 127, 23 stored mantissa bits and an implicit leading 1',
        'A fused multiply-add rounds once, after the exact product and sum',
        'π = 0 10000000 1001001…, e = 0 10000000 0101101…, 0.25 = 0 01111101 000…, π × e + 0.25 ≈ 8.7897 = 0 10000010 0001100…',
      ],
      representative: [
        'The unit’s internal structure: stage order, widths and the 24 × 24 grid are textbook, not NVIDIA’s circuit',
        'Real multipliers use Booth recoding and adder trees, and share work between FP32 and INT32',
        'Its size on the die (tens of micrometres)',
      ],
      notToScale: ['Bits are drawn as large boxes; a single bit is about a thousand times smaller than a unit'],
    },
    {
      spec: [
        'A full adder needs nine two-input NAND gates: sum = a XOR b XOR cin, carry out = ab + cin(a XOR b)',
        'A CMOS NAND2 is four transistors: two PMOS in parallel, two NMOS in series',
      ],
      representative: [
        'Whether the SM’s adders are built from these nine NANDs: real libraries use XOR and majority cells, or NAND / NOR mixes, to save area',
        'Gate size and spacing; the transistors are drawn as boxes with fins, not extracted from a layout',
      ],
      notToScale: ['Signals are slowed enormously: a real gate switches in picoseconds'],
    },
  ],
  reference: {
    sourcesIntro:
      'The published figures in the compute branch come from these documents. Everything else is representative; each scale says which under “How accurate is this?”.',
    sources: [
      {
        title: 'NVIDIA RTX Blackwell GPU Architecture',
        publisher: 'NVIDIA, whitepaper',
        url: 'https://images.nvidia.com/aem-dam/Solutions/geforce/blackwell/nvidia-rtx-blackwell-gpu-architecture.pdf',
        covers:
          'SM layout: four sub-partitions, 128 CUDA cores, tensor cores, register file, L1 / shared memory; GB202',
      },
      {
        title: 'CUDA C++ Programming Guide: SIMT architecture',
        publisher: 'NVIDIA, documentation',
        url: 'https://docs.nvidia.com/cuda/cuda-c-programming-guide/index.html#simt-architecture',
        covers: 'A warp of 32 threads issued together by one scheduler; the fused multiply-add and its single rounding',
      },
      {
        title: 'IEEE Standard for Floating-Point Arithmetic (IEEE 754-2019)',
        publisher: 'IEEE, standard',
        url: 'https://standards.ieee.org/ieee/754/6210/',
        covers: 'binary32: 1 sign, 8 exponent (bias 127), 23 mantissa bits; fusedMultiplyAdd rounds once',
      },
      {
        title: 'Adder (electronics): full adder',
        publisher: 'Wikipedia, article',
        url: 'https://en.wikipedia.org/wiki/Adder_(electronics)',
        covers: 'Full adder logic: sum = a XOR b XOR cin, carry = ab + cin(a XOR b)',
      },
      {
        title: 'NAND gate: CMOS implementation',
        publisher: 'Wikipedia, article',
        url: 'https://en.wikipedia.org/wiki/NAND_gate',
        covers: 'NAND as a universal gate; a CMOS NAND2 has two PMOS in parallel and two NMOS in series',
      },
    ],
    glossary: [
      {
        term: 'SM',
        level: 0,
        def: 'Streaming Multiprocessor: the repeated compute block of an NVIDIA GPU, with its own registers, L1 and schedulers.',
      },
      { term: 'CUDA core', level: 0, def: 'One FP32 / INT32 arithmetic lane. An SM has 128 of them.' },
      {
        term: 'Register file',
        level: 0,
        def: 'The fast storage next to the cores that holds every resident thread’s registers.',
      },
      {
        term: 'Tensor core',
        level: 0,
        def: 'A unit that multiplies and accumulates small matrices in one step, used for AI and graphics.',
      },
      {
        term: 'Warp',
        level: 1,
        def: 'A group of 32 threads that the scheduler issues one instruction to, executing in lockstep.',
      },
      {
        term: 'SIMT',
        level: 1,
        def: 'Single instruction, multiple threads: one instruction stream drives many threads on their own data.',
      },
      { term: 'FFMA', level: 1, def: 'The single-precision fused multiply-add instruction: d = a × b + c.' },
      {
        term: 'FMA',
        level: 2,
        def: 'Fused multiply-add: a × b + c computed with one rounding at the end, not two.',
      },
      {
        term: 'float32',
        level: 2,
        def: 'IEEE 754 single precision: 1 sign bit, 8 exponent bits, 23 mantissa bits.',
      },
      {
        term: 'Significand (mantissa)',
        level: 2,
        def: 'The digits of a float. Stored as 23 bits plus an implicit leading 1, so 24 bits are multiplied.',
      },
      {
        term: 'Partial product',
        level: 2,
        def: 'One row of a multiplication: the multiplicand shifted and kept or zeroed by one bit of the other number.',
      },
      {
        term: 'NAND',
        level: 3,
        def: 'A gate whose output is 0 only when both inputs are 1. Any logic can be built from NANDs alone.',
      },
      {
        term: 'Full adder',
        level: 3,
        def: 'Logic that adds three bits (a, b, carry in) into a sum bit and a carry out.',
      },
      {
        term: 'CMOS',
        level: 3,
        def: 'Logic built from pairs of complementary transistors: PMOS pull the output up, NMOS pull it down.',
      },
    ],
  },
};
