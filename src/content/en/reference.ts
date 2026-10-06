/**
 * Sources & glossary: where the published numbers come from, and the words the descent uses.
 * Glossary entries name the scale (0-based level index) where the thing is on screen.
 */
export const reference = {
  open: 'Sources & glossary',
  title: 'Sources & glossary',
  close: 'Close',
  tabs: { glossary: 'Glossary', sources: 'Sources' },
  goTo: (scale: string) => `Show ▸ ${scale}`,
  sourcesIntro:
    'The published figures on this page come from these documents. Everything else is representative or deliberately not to scale; each scale says which under “How accurate is this?”.',
  sources: [
    {
      title: 'NVIDIA RTX Blackwell GPU Architecture',
      publisher: 'NVIDIA, whitepaper (PDF)',
      url: 'https://images.nvidia.com/aem-dam/Solutions/geforce/blackwell/nvidia-rtx-blackwell-gpu-architecture.pdf',
      covers:
        'GB202: 92.2 billion transistors, 750 mm², 12 GPCs and 192 SMs, 128 MB L2 (96 MB on the RTX 5090), TSMC 4N',
    },
    {
      title: 'GeForce RTX 5090',
      publisher: 'NVIDIA, product page',
      url: 'https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5090/',
      covers: '32 GB GDDR7 on a 512-bit bus, 21,760 CUDA cores, 575 W total graphics power',
    },
    {
      title: 'JEDEC Publishes GDDR7 Graphics Memory Standard (JESD239)',
      publisher: 'JEDEC, press release',
      url: 'https://www.jedec.org/node/9394',
      covers: 'GDDR7: PAM3 signalling, four independent channels per device',
    },
    {
      title: 'Silicon',
      publisher: 'Wikipedia',
      url: 'https://en.wikipedia.org/wiki/Silicon',
      covers: 'Diamond-cubic crystal, lattice constant 543.1 pm, 14 electrons',
    },
    {
      title: 'Review of Particle Physics',
      publisher: 'Particle Data Group',
      url: 'https://pdg.lbl.gov/',
      covers: 'Up and down quark masses (≈2.2 and ≈4.7 MeV), proton and neutron masses, the neutron lifetime',
    },
    {
      title: 'CODATA value: proton rms charge radius',
      publisher: 'NIST',
      url: 'https://physics.nist.gov/cgi-bin/cuu/Value?rp',
      covers: 'Proton charge radius 0.8414 fm',
    },
    {
      title: 'Table of experimental nuclear ground state charge radii: An update',
      publisher: 'Angeli & Marinova, Atomic Data and Nuclear Data Tables 99 (2013) 69',
      url: 'https://doi.org/10.1016/j.adt.2011.12.006',
      covers: '²⁸Si nuclear charge radius 3.12 fm',
    },
    {
      title: 'Gluon flux-tube distribution and linear confinement in baryons',
      publisher: 'Bissey et al., Physical Review D 76 (2007) 114512',
      url: 'https://doi.org/10.1103/PhysRevD.76.114512',
      covers: 'The Y-shaped flux tube between three quarks, from lattice QCD',
    },
    {
      title: 'Proton Mass Decomposition from the QCD Energy Momentum Tensor',
      publisher: 'Yang et al., Physical Review Letters 121 (2018) 212001',
      url: 'https://doi.org/10.1103/PhysRevLett.121.212001',
      covers: 'Where the proton’s mass comes from: quark masses are a small part of it',
    },
    {
      title: 'Limits on the effective quark radius from inclusive ep scattering at HERA',
      publisher: 'ZEUS Collaboration, Physics Letters B 757 (2016) 468',
      url: 'https://doi.org/10.1016/j.physletb.2016.04.007',
      covers: 'Quarks show no size down to about 0.4 × 10⁻¹⁸ m',
    },
  ],
  glossary: [
    {
      term: 'PCIe 5.0 ×16',
      level: 0,
      def: 'The slot the card plugs into: 16 lanes to the CPU, about 64 GB/s each way.',
    },
    {
      term: 'Vapour chamber',
      level: 0,
      def: 'A flat sealed copper plate with a little water inside; it boils over the GPU and condenses at the edges, spreading heat fast.',
    },
    {
      term: 'GDDR7',
      level: 1,
      def: 'The graphics memory around the GPU. Each chip has its own 32-bit bus and sends three voltage levels per symbol (PAM3).',
    },
    {
      term: 'VRM',
      level: 1,
      def: 'Voltage regulator module: power stages that turn the 12 V input into the ~1 V the GPU runs on.',
    },
    { term: '12V-2x6', level: 1, def: 'The power connector of the card: one cable carrying up to 600 W.' },
    {
      term: 'Flip-chip',
      level: 2,
      def: 'Mounting the die face-down so its wiring side meets the substrate through thousands of tiny bumps.',
    },
    {
      term: 'C4 bump',
      level: 2,
      def: 'Controlled-collapse chip connection: a solder micro-bump between the die and the package substrate.',
    },
    {
      term: 'Substrate',
      level: 2,
      def: 'The small multi-layer board under the die that fans its connections out to the solder balls.',
    },
    { term: 'Die', level: 3, def: 'The piece of silicon itself. GB202 is 750 mm², about the size of a postage stamp.' },
    {
      term: 'GPC',
      level: 3,
      def: 'Graphics processing cluster: one of the twelve blocks the die is split into, each with its own raster front end.',
    },
    {
      term: 'SM',
      level: 3,
      def: 'Streaming multiprocessor: the unit that runs shader and compute code. 170 of 192 are enabled on the RTX 5090.',
    },
    {
      term: 'L2 cache',
      level: 3,
      def: 'The memory on the die that every SM shares; a hit here never has to go out to GDDR7.',
    },
    {
      term: 'Memory controller',
      level: 3,
      def: 'The block at the die edge that talks to one GDDR7 chip; there are sixteen, one per chip.',
    },
    { term: 'Via', level: 4, def: 'A vertical copper plug that joins one metal layer to the next.' },
    {
      term: 'Metal stack',
      level: 4,
      def: 'The ~15 copper wiring layers above the transistors, from fat power rails at the top to the finest wires at the bottom.',
    },
    {
      term: 'FinFET',
      level: 5,
      def: 'A transistor whose channel is a thin vertical fin with the gate wrapped around three sides.',
    },
    { term: 'Gate', level: 5, def: 'The electrode whose voltage opens or closes the channel: the switch itself.' },
    {
      term: 'Source / drain',
      level: 5,
      def: 'The two ends of the channel; electrons enter at the source and leave at the drain.',
    },
    {
      term: 'High-k dielectric',
      level: 5,
      def: 'The insulator under the gate, a few atoms thick, made of a material that holds more charge than silicon dioxide.',
    },
    {
      term: 'Diamond-cubic lattice',
      level: 6,
      def: 'The crystal shape of silicon: every atom bonded to four neighbours at 109.5°, repeating every 0.543 nm.',
    },
    {
      term: 'Covalent bond',
      level: 6,
      def: 'Two atoms sharing a pair of electrons; silicon’s four bonds hold the crystal together.',
    },
    {
      term: 'Orbital',
      level: 7,
      def: 'Where an electron is likely to be found: the drawn cloud is |ψ|², a probability density, not a path.',
    },
    {
      term: 'Valence electron',
      level: 7,
      def: 'An electron in the outer shell. Silicon has four, and they make the bonds.',
    },
    {
      term: 'Nucleon',
      level: 8,
      def: 'A proton or a neutron: the particles a nucleus is built from. Silicon-28 has 14 of each.',
    },
    {
      term: 'Quark',
      level: 8,
      def: 'The building block of protons and neutrons. A proton is two up quarks and one down; no quark has ever been seen on its own.',
    },
    {
      term: 'Gluon',
      level: 8,
      def: 'The carrier of the strong force between quarks. Gluons carry colour charge themselves, which squeezes the field into tubes.',
    },
    {
      term: 'Colour charge',
      level: 8,
      def: 'The charge of the strong force, in three kinds named red, green and blue. Nothing to do with light; a proton is always colour-neutral.',
    },
    {
      term: 'Confinement',
      level: 8,
      def: 'Quarks are always bound in groups: pulling one out stretches the gluon tube until it snaps into a new quark–antiquark pair.',
    },
  ],
};
