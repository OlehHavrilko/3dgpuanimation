import type { EntityInfo } from '../../core/types';
import type { Block } from '../../levels/die/floorplan';

/** Level 4 — the GB202 die. */
export const die = {
  meta: {
    name: 'GB202 die',
    scale: '1 cm',
    description: 'Blackwell, TSMC 4N, ~750 mm², 92.2 billion transistors.',
  },
  follow: 'On the die: the power grid spreads current to all 170 active SMs; ours heads for one of them.',
  captions: {
    film: 'No paint, no dye — that colour is thin-film interference',
    gpc: 'Twelve clusters, each one a small factory',
    sm: (total: number, enabled: number) => `${total} streaming multiprocessors · ${enabled} alive on this one`,
    l2: '128 MB of L2 cache sits in the middle of the die',
    mc: 'Sixteen memory controllers, 512 bits wide',
    outro: 'Down into a single SM',
  },
  controls: { highlight: 'Highlight' },
  /** Signal-trace narration per waypoint. */
  trace: {
    mc: 'The PHY recovers the PAM3 symbols and the controller queues the burst for the cache.',
    l2: 'Every memory access passes through L2 first; a hit here would never have reached the DRAM at all.',
    gpc: 'The crossbar hands the cache line to the GPC that asked for it.',
    sm: "Destination: the SM's L1 / shared memory, where 128 CUDA cores and 4 tensor cores consume it.",
  },
  entities: {
    /** Inspector text for a floorplan block. */
    block(b: Block): EntityInfo {
      switch (b.kind) {
        case 'mc':
          return {
            title: `Memory controller ${b.index}`,
            kind: 'Memory subsystem · GDDR7',
            specs: [
              ['Width', '32-bit'],
              ['Feeds', 'one 2 GB GDDR7 chip'],
              ['All 16', '512-bit · 1.79 TB/s'],
            ],
            note: 'Controller logic plus the PHY that drives signals off the die, through the package and across the PCB.',
          };
        case 'hub':
          return {
            title: 'Hub',
            kind: 'Front end · I/O',
            specs: [
              ['GigaThread', 'work scheduler'],
              ['Host', 'PCIe 5.0 × 16'],
              ['Media', 'NVENC / NVDEC'],
              ['Display', 'DP 2.1b / HDMI 2.1b'],
            ],
            note: 'Placement is schematic: NVIDIA publishes the block diagram, not the physical floorplan.',
          };
        case 'l2':
          return {
            title: `L2 cache · ${b.east ? 'east' : 'west'} partition`,
            kind: 'Cache',
            specs: [
              ['Total on die', '128 MB'],
              ['Enabled on 5090', '96 MB'],
            ],
            note: 'Shared by every SM: the last stop before data has to cross the memory bus.',
          };
        case 'gpc':
          return {
            title: `GPC ${b.gpc + 1}`,
            kind: 'Graphics Processing Cluster',
            specs: [
              ['SMs', `${b.enabled} of 16 enabled`],
              ['TPCs', '8'],
              ['Raster engine', '1'],
            ],
            note: 'Zoom in closer to pick individual SMs.',
          };
        case 'sm':
          return {
            title: `SM ${b.sm + 1}${b.off ? ' (fused off)' : ''}`,
            kind: `Streaming Multiprocessor · GPC ${b.gpc + 1}`,
            specs: [
              ['CUDA cores', '128'],
              ['Tensor cores', '4 · 5th gen'],
              ['RT core', '1 · 4th gen'],
              ['L1 / shared', '128 KB'],
              ['Status', b.off ? 'disabled on RTX 5090' : 'enabled'],
            ],
            note: b.off
              ? 'GB202 has 192 SMs; the RTX 5090 ships with 170, so 22 are fused off to improve yield.'
              : 'Dive in: below the die surface sit ~15 copper wiring layers and the transistors themselves.',
          };
      }
    },
  },
};
