import * as THREE from 'three';
import { BaseLevel, addRimLight } from '../../core/BaseLevel';
import { entry, type CameraKey } from '../../core/CameraRig';
import type { LevelMeta, TransitionTarget } from '../../core/types';
import { pickByT, range, smoothstep } from '../../core/math';
import { computeContent } from '../../content/compute';
import { pickInstancedGroup, pickInstances, pickObject } from '../../interaction/pick';
import { glowBoxes, studioLights, type Box } from './common';

/**
 * Compute branch 1 — one Streaming Multiprocessor of the GB202. Units: millimetres. Die surface
 * at y = 0. Four sub-partitions in a 2 × 2 grid, each with a warp scheduler, a register file,
 * 32 CUDA cores (8 × 4) and a tensor core; fixed-function units behind and the L1 / shared memory
 * in front. The counts are the published ones (NVIDIA RTX Blackwell whitepaper); the placement
 * and sizes are representative.
 */
const C = computeContent.sm;

export const meta: LevelMeta = {
  ...C.meta,
  unitMeters: 0.001,
  weight: 1,
};

export const PART_W = 0.94;
export const PART_D = 0.46;
export const CORE_PITCH = 0.05;
const PART_COLORS = [0x3aa8ff, 0xb6ff3a, 0xffb43a, 0xff5ad2];
/** The sub-partition whose warp we follow into the next scale (front left). */
export const DIVE_PART = 2;

/** Centre of sub-partition p. */
export const partCentre = (p: number) => ({ x: (p % 2 ? 1 : -1) * 0.5, z: p < 2 ? -0.3 : 0.18 });
/** Offsets inside a sub-partition (x from its centre). */
export const LOCAL = { sched: -0.42, regs: -0.25, cores: 0.08, tensor: 0.38 };

export class SMLevel extends BaseLevel {
  readonly meta = meta;
  private plates!: ReturnType<typeof glowBoxes>;
  private cores!: ReturnType<typeof glowBoxes>;
  private regs!: ReturnType<typeof glowBoxes>;
  private tensor!: ReturnType<typeof glowBoxes>;
  private sched!: ReturnType<typeof glowBoxes>;
  private l1!: THREE.Mesh;
  private beam!: THREE.Mesh;
  private target: TransitionTarget;

  constructor(ctx: ConstructorParameters<typeof BaseLevel>[0]) {
    super(ctx);
    this.near = 0.004;
    this.far = 60;
    this.bloom = 1.2;
    this.bokeh = 1.2;
    this.sectionNormal = [0, 0, 1];
    const c = partCentre(DIVE_PART);
    this.target = {
      position: new THREE.Vector3(c.x + LOCAL.cores, 0.05, c.z),
      radius: 0.17,
      approach: new THREE.Vector3(0.1, 0.8, 0.6).normalize(),
    };
  }

  protected cameraKeys(): CameraKey[] {
    const p = this.target.position;
    return [
      ...entry({ t: 0, pos: [1.7, 2.3, 3.0], look: [0, 0, 0.1] }, 0.6, 0.12),
      { t: 0.24, pos: [-2.0, 1.7, 2.3], look: [0, 0, 0.1] },
      { t: 0.46, pos: [0.9, 1.1, 1.9], look: [0, 0, 0.15] },
      { t: 0.64, pos: [-1.0, 0.9, 1.3], look: [-0.35, 0, 0.15] },
      { t: 0.82, pos: [p.x + 0.35, 0.5, p.z + 0.8], look: [p.x, 0, p.z] },
      { t: 1, pos: [p.x + 0.1, 0.3, p.z + 0.38], look: [p.x, 0.02, p.z] },
    ];
  }

  protected build() {
    const s = this.scene;
    studioLights(s, 3);
    s.environmentIntensity = 0.6;

    // The die, cut away around the SM; a lighter plate marks the SM itself.
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.3, 3),
      new THREE.MeshStandardMaterial({ color: 0x151a21, metalness: 0.6, roughness: 0.4 }),
    );
    slab.position.y = -0.15;
    s.add(slab);
    this.pickables.push(pickObject(slab, C.entities.slab, -1));
    const sm = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.02, 1.8),
      new THREE.MeshStandardMaterial({ color: 0x1f2733, metalness: 0.5, roughness: 0.45 }),
    );
    sm.position.y = 0.01;
    s.add(sm);

    // Sub-partition plates (tinted, 4 instances) and what is in each.
    const plates: Box[] = [];
    const cores: Box[] = [];
    const regs: Box[] = [];
    const tensor: Box[] = [];
    const sched: Box[] = [];
    for (let p = 0; p < 4; p++) {
      const c = partCentre(p);
      plates.push({ x: c.x, y: 0.03, z: c.z, w: PART_W, h: 0.02, d: PART_D });
      sched.push({ x: c.x + LOCAL.sched, y: 0.07, z: c.z, w: 0.1, h: 0.07, d: 0.38 });
      regs.push({ x: c.x + LOCAL.regs, y: 0.07, z: c.z, w: 0.2, h: 0.07, d: 0.38 });
      tensor.push({ x: c.x + LOCAL.tensor, y: 0.08, z: c.z, w: 0.14, h: 0.09, d: 0.34 });
      for (let k = 0; k < 32; k++) {
        const col = k % 8;
        const row = k >> 3;
        cores.push({
          x: c.x + LOCAL.cores + (col - 3.5) * CORE_PITCH,
          y: 0.065,
          z: c.z + (1.5 - row) * CORE_PITCH,
          w: 0.038,
          h: 0.05,
          d: 0.038,
        });
      }
    }
    const metal = (color: number, metalness = 0.5) =>
      addRimLight(new THREE.MeshStandardMaterial({ color, metalness, roughness: 0.4 }), 0x7ac8ff, 0.25);
    this.plates = glowBoxes(
      plates,
      new THREE.MeshStandardMaterial({ color: 0x2a3340, metalness: 0.3, roughness: 0.5 }),
      0xffffff,
      PART_COLORS,
    );
    this.cores = glowBoxes(cores, metal(0x5d6674, 0.8), 0x9cff3a);
    this.regs = glowBoxes(regs, metal(0x2f3b4f), 0x6cd4ff);
    this.tensor = glowBoxes(tensor, metal(0x4a3a66), 0xd08cff);
    this.sched = glowBoxes(sched, metal(0x6a5a2a), 0xffd24a);
    for (const g of [this.plates, this.regs, this.tensor, this.sched, this.cores]) s.add(g.mesh);

    this.pickables.push(
      pickInstances(this.plates.mesh, (p) => C.entities.partition(p + 1), -1),
      pickInstancedGroup(this.cores.mesh, C.entities.cores),
      pickInstancedGroup(this.regs.mesh, C.entities.registers),
      pickInstancedGroup(this.tensor.mesh, C.entities.tensor),
      pickInstancedGroup(this.sched.mesh, C.entities.scheduler),
    );

    // L1 / shared memory in front, texture units and the RT core behind.
    this.l1 = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.05, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x1c3a52, metalness: 0.4, roughness: 0.4, emissive: 0x6cd4ff }),
    );
    this.l1.position.set(0, 0.04, 0.66);
    s.add(this.l1);
    this.pickables.push(pickObject(this.l1, C.entities.l1));
    const fixed = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.05, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x2b3340, metalness: 0.5, roughness: 0.5 }),
    );
    fixed.position.set(0, 0.04, -0.68);
    s.add(fixed);
    this.pickables.push(pickObject(fixed, C.entities.fixed));

    // The instruction beam from the scheduler to the cores of the followed sub-partition.
    this.beam = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.012, 0.012),
      new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, blending: THREE.AdditiveBlending }),
    );
    s.add(this.beam);
  }

  protected animate(t: number, _dt: number, time: number) {
    const parts = smoothstep(0.14, 0.2, t) * (1 - smoothstep(0.34, 0.4, t));
    const coresOn = range(t, 0.3, 0.46);
    const memOn = smoothstep(0.46, 0.54, t);
    const issue = range(t, 0.64, 0.74);
    const fire = smoothstep(0.72, 0.76, t);
    const pulse = 0.5 + 0.5 * Math.sin(time * 9);

    for (let p = 0; p < 4; p++) {
      this.plates.glow.setX(p, parts * (0.22 + 0.12 * Math.sin(time * 3 + p * 1.6)));
      const mine = p === DIVE_PART;
      this.sched.glow.setX(p, 0.05 + (mine ? issue * 1.2 : 0.1 * memOn));
      this.regs.glow.setX(p, 0.04 + 0.35 * memOn);
      this.tensor.glow.setX(p, 0.04 + 0.35 * smoothstep(0.34, 0.44, t));
      for (let k = 0; k < 32; k++) {
        const i = p * 32 + k;
        const lit = i < coresOn * 128 ? 0.28 : 0.03;
        this.cores.glow.setX(i, mine ? lit + fire * (0.5 + 0.5 * pulse) : lit * (1 - 0.5 * fire));
      }
    }
    for (const g of [this.plates, this.cores, this.regs, this.tensor, this.sched]) g.glow.needsUpdate = true;
    (this.l1.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.08 + 0.5 * memOn;

    // The beam grows from the scheduler along x to the end of the core grid.
    const c = partCentre(DIVE_PART);
    const x0 = c.x + LOCAL.sched + 0.05;
    const x1 = c.x + LOCAL.cores + 4 * CORE_PITCH;
    const len = (x1 - x0) * issue;
    this.beam.visible = issue > 0.01;
    this.beam.scale.x = Math.max(1e-4, len);
    this.beam.position.set(x0 + len / 2, 0.11, c.z);
    (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - 0.6 * fire);

    this.caption = pickByT(
      t,
      [0.12, 0.3, 0.46, 0.64, 0.84],
      [C.captions.intro, C.captions.parts, C.captions.cores, C.captions.memory, C.captions.issue, C.captions.dive],
    );
  }

  getTransitionTarget() {
    return this.target;
  }
}
