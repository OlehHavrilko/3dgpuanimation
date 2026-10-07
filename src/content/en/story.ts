/** Guided experience: act cards, anchor numbers, the tour bar and the command palette. */
export const story = {
  /** One per act, in order. */
  acts: [
    { title: 'The Machine', route: 'GPU · PCB · Package', blurb: 'This is the machine.' },
    { title: 'The Computation', route: 'Die · Metal · Transistor', blurb: 'This is how it thinks.' },
    { title: 'The Matter', route: 'Lattice · Atom · Nucleus', blurb: 'This is what it is made of.' },
  ],
  act: (roman: string) => `Act ${roman}`,
  /** One per key number, in order (die, metal stack, atom). */
  keyNumbers: [
    { value: '92.2', unit: 'billion transistors', caption: 'Count one every second, day and night: 2,900 years.' },
    { value: '15', unit: 'metal layers', caption: 'Fifteen floors of copper wiring. The finest pitch is 28 nm.' },
    {
      value: '≈0.1',
      unit: 'nanometre',
      caption: "The reach of one atom's outer electrons. Everything the chip does happens at this scale or above.",
    },
  ],
  tour: { play: 'Play', pause: 'Pause' },
  /** After the reverse zoom: the closing line. */
  coda: {
    title: 'You were looking at one.',
    body: (atoms: string) =>
      `The die of this card holds about ${atoms} silicon atoms. You just went inside one of them.`,
    note: 'Assumes a ~0.78 mm die; the real thickness is not published.',
    again: 'Start again',
    explore: 'Explore',
  },
  zoomOut: 'Zoom back out',
  palette: {
    label: 'Command palette',
    placeholder: 'Jump to a scale or a part…',
    foot: '↑↓ navigate  ·  ↵ open  ·  esc close',
    empty: 'nothing matches',
    results: 'Matching scales and parts',
  },
};
