import type { EntityInfo } from '../../core/types';

const e = (x: EntityInfo): EntityInfo => x;

/** Level 6 — FinFETs. */
export const transistor = {
  meta: {
    name: 'FinFET transistors',
    scale: '50 nm',
    description: 'Each gate wraps a silicon fin on three sides; a voltage on it opens a channel for electrons.',
  },
  follow:
    'The bit arrives as a voltage on the gate. The channel opens, and an electron crosses from the source under it: ours.',
  captions: {
    array: 'FinFETs: fins 28 nm apart, gates 51 nm apart',
    clocks: 'Every gate has its own clock — watch them switch',
    dielectric: 'A high-k layer one nanometre thick decides whether current flows',
    on: 'Gate on: electrons pour from source to drain',
    off: 'Gate off: the barrier holds them back',
  },
  controls: { drive: 'Gate drive', voltage: 'Gate voltage (manual)', clock: 'Clock speed' },
  readouts: {
    mode: 'Mode',
    manual: (vg: number) => `manual · Vg ${vg.toFixed(2)} V`,
    channel: 'Channel',
    channelState: (on: number) =>
      on > 0.85 ? 'strong inversion (ON)' : on > 0.08 ? 'near threshold' : 'depleted (OFF)',
    current: 'Drain current (rel.)',
    logic: 'Logic out',
  },
  entities: {
    gateFocusedTitle: 'Metal gate (this transistor)',
    sti: e({
      title: 'Shallow trench isolation',
      kind: 'Oxide · SiO₂',
      specs: [['Role', 'insulates neighbouring fins']],
    }),
    fin: (w: number, h: number, pitch: number): EntityInfo => ({
      title: 'Silicon fin',
      kind: 'Channel · crystalline Si',
      specs: [
        ['Width', `~${w} nm`],
        ['Height', `~${h} nm`],
        ['Pitch', `~${pitch} nm`],
      ] as [string, string][],
      note: 'Current flows along the fin; the gate wraps it on three sides, so it can switch the channel off far better than a flat (planar) transistor.',
    }),
    collar: e({
      title: 'High-k gate dielectric',
      kind: 'Insulator · HfO₂',
      specs: [
        ['Thickness', '~1–2 nm'],
        ['Glows', 'while its gate is on'],
      ] as [string, string][],
      note: 'A few atomic layers that keep gate current out of the channel while letting its electric field through.',
    }),
    gate: (length: number, cpp: number): EntityInfo => ({
      title: 'Metal gate',
      kind: 'Gate stack · TiN / W',
      specs: [
        ['Length', `~${length} nm`],
        ['Pitch (CPP)', `~${cpp} nm`],
      ] as [string, string][],
      note: 'A voltage on the gate pulls electrons to the fin surface (inversion layer) and the transistor turns on.',
    }),
    gateCap: e({
      title: 'Gate cap',
      kind: 'Insulator · SiN',
      specs: [['Role', 'protects the gate during contact etch']],
    }),
    sourceDrain: e({
      title: 'Source / drain',
      kind: 'Epitaxy · SiP',
      specs: [
        ['Shape', 'faceted crystal'],
        ['Doping', 'n-type (phosphorus)'],
      ],
      note: 'Grown on the fin between gates: the reservoir electrons come from (source) and drain into (drain).',
    }),
    trenchContact: e({
      title: 'Trench contact',
      kind: 'Middle of line · W',
      specs: [['Joins', 'source/drain ↔ M0']],
    }),
    m0: e({
      title: 'M0 wire',
      kind: 'Interconnect · copper',
      specs: [['Layer', 'lowest metal']],
    }),
  },
};
