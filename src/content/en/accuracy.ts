/**
 * "How accurate is this?" per level, in level order. Three honest buckets:
 *  spec            — published figures (NVIDIA specs, physical constants)
 *  representative  — plausible, but not published / not measured
 *  notToScale      — deliberate exaggerations and visual metaphors
 */
export const accuracy = {
  button: 'How accurate is this?',
  headings: { spec: 'From published specs', representative: 'Representative', notToScale: 'Not to scale' },
  levels: [
    {
      spec: [
        '304 × 137 mm, dual-slot, 575 W total graphics power',
        'Double flow-through cooler: two fans, vapour chamber, heat pipes',
        'Board split in three: main board, PCIe board, display board',
      ],
      representative: [
        'Fin, heat-pipe and component layout inside the cooler',
        'Thermal view: a lumped model, not a simulation',
      ],
      notToScale: [],
    },
    {
      spec: [
        '16 GDDR7 chips × 2 GB on a 512-bit bus, 28 Gbps per pin, 1.79 TB/s',
        '12V-2x6 power connector, PCIe 5.0 ×16',
      ],
      representative: [
        'Power-stage, capacitor and trace placement',
        'Section view: a typical 14-layer board stack (the real stack-up is not published)',
      ],
      notToScale: ['Data pulses move billions of times slower than real signals'],
    },
    {
      spec: ['Flip-chip package: the die sits face-down on an organic substrate'],
      representative: ['Ball and bump counts and the build-up layer stack'],
      notToScale: ['Substrate layers drawn five times thicker than they are'],
    },
    {
      spec: [
        'GB202, TSMC 4N, ~750 mm², 92.2 billion transistors',
        '12 GPCs, 192 SMs (170 enabled on the RTX 5090), 128 MB L2 (96 MB enabled)',
        '16 × 32-bit memory controllers',
      ],
      representative: [
        'Floorplan follows the published block diagram, not a die photo',
        'Which 22 SMs are fused off differs from chip to chip',
      ],
      notToScale: ['Thin-film colours are stylised'],
    },
    {
      spec: [],
      representative: ['~15 copper layers with 5/4 nm-class pitches (finest ~28 nm): TSMC does not publish 4N figures'],
      notToScale: ['Dielectric between the wires drawn see-through'],
    },
    {
      spec: [],
      representative: [
        'Fin pitch ~28 nm, gate pitch ~51 nm, high-k layer ~1–2 nm: 5/4 nm-class estimates',
        'Threshold ~0.3 V and drain current: illustrative',
      ],
      notToScale: ['Electrons drawn as glowing dots, slowed down enormously'],
    },
    {
      spec: ['Diamond-cubic silicon: a = 5.431 Å, bonds 2.35 Å at 109.5°', '5 × 10²² atoms per cm³'],
      representative: [],
      notToScale: [
        'Atoms as balls and bonds as sticks: a model, not a picture',
        'Dopants shown far denser than real (about one in a million atoms or fewer)',
      ],
    },
    {
      spec: ['Silicon: Z = 14, 1s² 2s² 2p⁶ 3s² 3p²'],
      representative: ['Orbitals: hydrogen-like shapes with screened nuclear charge (Clementi–Raimondi)'],
      notToScale: [
        'Radii compressed so the inner and outer shells fit one frame',
        'Nucleus drawn ~10⁴ times too large',
        'The cloud is sampled probability, not particles',
      ],
    },
    {
      spec: [
        '²⁸Si nucleus: 14 protons + 14 neutrons, charge radius 3.12 fm',
        'Proton = uud, neutron = udd; proton charge radius 0.84 fm',
        'Quark masses ≈2.2 MeV (up) and ≈4.7 MeV (down): about 1% of the proton’s 938 MeV',
      ],
      representative: [
        'Nucleons as touching spheres: real ones overlap and have no sharp edge',
        'Y-shaped flux tube: the lattice-QCD picture for three static quarks',
      ],
      notToScale: [
        'Quarks drawn as glowing beads: they have no measured size (under 10⁻¹⁸ m) and no fixed position',
        '“Colour” is a kind of charge, not a colour; red, green and blue are a naming convention',
        'Gluon exchanges and sea pairs slowed down and thinned out enormously',
      ],
    },
  ],
};
