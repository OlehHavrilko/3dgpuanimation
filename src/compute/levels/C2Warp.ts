import * as THREE from 'three';
import { BaseLevel, addRimLight } from '../../core/BaseLevel';
import { entry, type CameraKey } from '../../core/CameraRig';
import type { LevelMeta, TransitionTarget } from '../../core/types';
import { canvasTexture } from '../../core/canvas';
import { easeInOutCubic, pickByT, range, smoothstep } from '../../core/math';
import { computeContent } from '../../content/compute';
import { fma } from '../fma';
import { pickInstancedGroup, pickInstances, pickObject } from '../../interaction/pick';
import { glowBoxes, setBox, studioLights, type Box } from './common';

/**
 * Compute branch 2 — one warp. Units: micrometres. The sub-partition of the previous scale seen
 * from close up (940 × 460 µm, centred on the origin): 32 lanes in an 8 × 4 grid, the warp
 * scheduler, and the register file. Every lane gets four bars: its a, b, c operands and the
 * result d of FFMA R4, R1, R2, R3 (d = a × b + c, evaluated by the real float32 maths in fma.ts).
 */
const C = computeContent.warp;

export const meta: LevelMeta = {
  ...C.meta,
  unitMeters: 1e-6,
  weight: 1,
};

const PITCH = 50;
const LANE_X = 80;
const BAR_SCALE = 5;
const BAR_COLORS = [0x3aa8ff, 0xffb43a, 0xff5ad2, 0xb6ff3a];
/** The lane we follow into the next scale: front row, fifth column. */
export const DIVE_LANE = 4;

const laneX = (i: number) => LANE_X + ((i % 8) - 3.5) * PITCH;
const laneZ = (i: number) => (1.5 - (i >> 3)) * PITCH;

/** Operands per lane: a runs across the row, b falls down the rows, c steps by 0.25. Lane 4 is π × e + 0.25. */
export function laneValues(i: number) {
  const col = i % 8;
  const row = i >> 3;
  const a = Math.fround(Math.PI + (col - 4) * 0.5);
  const b = Math.fround(Math.E - row * 0.5);
  const c = 0.25 * (1 + row);
  return { a, b, c, d: fma(a, b, c).value };
}

const VALUES = Array.from({ length: 32 }, (_, i) => laneValues(i));
const round2 = (x: number) => Math.round(x * 100) / 100;

export class WarpLevel extends BaseLevel {
  readonly meta = meta;
  private lanes!: ReturnType<typeof glowBoxes>;
  private bars!: ReturnType<typeof glowBoxes>;
  private barBoxes: Box[] = [];
  private regs!: ReturnType<typeof glowBoxes>;
  private sched!: ReturnType<typeof glowBoxes>;
  private beam!: THREE.Mesh;
  private plaque!: THREE.Sprite;
  private target: TransitionTarget = {
    position: new THREE.Vector3(laneX(DIVE_LANE), 50, laneZ(DIVE_LANE)),
    radius: 24,
    approach: new THREE.Vector3(0.15, 0.8, 0.55).normalize(),
  };

  constructor(ctx: ConstructorParameters<typeof BaseLevel>[0]) {
    super(ctx);
    this.near = 1;
    this.far = 9000;
    this.bloom = 1.2;
    this.bokeh = 1.1;
    this.sectionNormal = [0, 0, 1];
  }

  protected cameraKeys(): CameraKey[] {
    const t = this.target.position;
    return [
      ...entry({ t: 0, pos: [380, 560, 700], look: [80, 20, 20] }, 0.42, 0.14),
      { t: 0.25, pos: [-300, 420, 560], look: [-60, 20, 0] },
      { t: 0.5, pos: [420, 320, 430], look: [80, 20, 20] },
      { t: 0.74, pos: [160, 240, 300], look: [80, 40, 10] },
      { t: 0.88, pos: [t.x + 90, 150, t.z + 170], look: [t.x, 40, t.z] },
      { t: 1, pos: [t.x + 30, 90, t.z + 80], look: [t.x, 50, t.z] },
    ];
  }

  protected build() {
    const s = this.scene;
    studioLights(s, 700);
    s.environmentIntensity = 0.6;

    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(940, 20, 460),
      new THREE.MeshStandardMaterial({ color: 0x1c2330, metalness: 0.5, roughness: 0.45 }),
    );
    plate.position.y = -10;
    s.add(plate);

    const lane: Box[] = [];
    for (let i = 0; i < 32; i++) lane.push({ x: laneX(i), y: 25, z: laneZ(i), w: 38, h: 50, d: 38 });
    this.lanes = glowBoxes(
      lane,
      addRimLight(new THREE.MeshStandardMaterial({ color: 0x5d6674, metalness: 0.8, roughness: 0.4 }), 0x7ac8ff, 0.25),
      0x9cff3a,
    );
    s.add(this.lanes.mesh);
    this.pickables.push(
      pickInstances(this.lanes.mesh, (i) => {
        const v = VALUES[i];
        return C.entities.lane(i, round2(v.a), round2(v.b), round2(v.c), round2(v.d));
      }),
    );

    // Four bars per lane: a, b, c, d.
    const colors: number[] = [];
    for (let i = 0; i < 32; i++)
      for (let k = 0; k < 4; k++) {
        this.barBoxes.push({
          x: laneX(i) + (k % 2 ? 9 : -9),
          y: 50,
          z: laneZ(i) + (k < 2 ? -9 : 9),
          w: 14,
          h: 1,
          d: 14,
        });
        colors.push(BAR_COLORS[k]);
      }
    this.bars = glowBoxes(
      this.barBoxes,
      new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.35 }),
      0xffffff,
      colors,
    );
    s.add(this.bars.mesh);
    this.pickables.push(pickInstancedGroup(this.bars.mesh, C.entities.operands));

    // Scheduler and register file.
    this.sched = glowBoxes(
      [{ x: -420, y: 35, z: 0, w: 100, h: 70, d: 380 }],
      addRimLight(new THREE.MeshStandardMaterial({ color: 0x6a5a2a, metalness: 0.5, roughness: 0.4 }), 0x7ac8ff, 0.25),
      0xffd24a,
    );
    this.regs = glowBoxes(
      [{ x: -250, y: 35, z: 0, w: 200, h: 70, d: 380 }],
      addRimLight(new THREE.MeshStandardMaterial({ color: 0x2f3b4f, metalness: 0.5, roughness: 0.4 }), 0x7ac8ff, 0.25),
      0x6cd4ff,
    );
    s.add(this.sched.mesh, this.regs.mesh);
    this.pickables.push(
      pickInstancedGroup(this.sched.mesh, C.entities.scheduler),
      pickInstancedGroup(this.regs.mesh, C.entities.registers),
    );

    // The instruction, floating over the scheduler and registers.
    const tex = canvasTexture(1024, 200, (g, w, h) => {
      g.fillStyle = 'rgba(8, 14, 12, 0.82)';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ffd24a';
      g.lineWidth = 4;
      g.strokeRect(4, 4, w - 8, h - 8);
      g.fillStyle = '#ffd24a';
      g.font = '600 78px ui-monospace, Menlo, Consolas, monospace';
      g.textAlign = 'center';
      g.fillText('FFMA R4, R1, R2, R3', w / 2, 90);
      g.fillStyle = '#d8e2dc';
      g.font = '500 46px ui-monospace, Menlo, Consolas, monospace';
      g.fillText('R4 = R1 × R2 + R3', w / 2, 158);
    });
    this.plaque = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }),
    );
    this.plaque.scale.set(330, 64, 1);
    this.plaque.position.set(-300, 170, 0);
    s.add(this.plaque);
    this.pickables.push(pickObject(this.plaque, C.entities.instruction));

    // The issue beam: scheduler -> lanes.
    this.beam = new THREE.Mesh(
      new THREE.BoxGeometry(1, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, blending: THREE.AdditiveBlending }),
    );
    s.add(this.beam);
  }

  protected animate(t: number, _dt: number, time: number) {
    const instr = smoothstep(0.18, 0.26, t);
    const beam = range(t, 0.24, 0.4);
    const lock = smoothstep(0.4, 0.46, t) * (1 - smoothstep(0.84, 0.92, t) * 0.6);
    const pulse = 0.5 + 0.5 * Math.sin(time * 7);
    const read = easeInOutCubic(range(t, 0.6, 0.72));
    const write = easeInOutCubic(range(t, 0.74, 0.84));
    // The bars sink away before the dive so the lane itself is in view.
    const keep = 1 - smoothstep(0.86, 0.95, t);

    (this.plaque.material as THREE.SpriteMaterial).opacity = instr;
    this.plaque.visible = instr > 0.01;
    this.sched.glow.setX(0, 0.1 + 0.9 * instr * (1 - smoothstep(0.5, 0.6, t)));
    this.regs.glow.setX(0, 0.05 + 0.4 * (read * (1 - write) + write * 0.6));
    this.sched.glow.needsUpdate = this.regs.glow.needsUpdate = true;

    // Beam from the scheduler across the lanes' left edge, then the whole block ticks as one.
    const x0 = -370;
    const x1 = LANE_X + 4 * PITCH;
    const len = (x1 - x0) * beam;
    this.beam.visible = beam > 0.01 && t < 0.5;
    this.beam.scale.x = Math.max(1e-3, len);
    this.beam.position.set(x0 + len / 2, 70, 0);

    for (let i = 0; i < 32; i++) this.lanes.glow.setX(i, 0.04 + lock * 0.3 * pulse);
    this.lanes.glow.needsUpdate = true;

    for (let i = 0; i < 32; i++) {
      const v = VALUES[i];
      const heights = [v.a * read * keep, v.b * read * keep, v.c * read * keep, v.d * write * keep];
      for (let k = 0; k < 4; k++) {
        const b = this.barBoxes[i * 4 + k];
        const h = Math.max(0.5, heights[k] * BAR_SCALE);
        setBox(this.bars.mesh, i * 4 + k, { ...b, h, y: 50 + h / 2 });
        this.bars.glow.setX(i * 4 + k, 0.05 + (k === 3 ? 0.2 * write * pulse : 0));
      }
    }
    this.bars.mesh.instanceMatrix.needsUpdate = true;
    this.bars.glow.needsUpdate = true;

    this.caption = pickByT(
      t,
      [0.2, 0.4, 0.6, 0.84],
      [C.captions.intro, C.captions.instr, C.captions.lockstep, C.captions.operands, C.captions.dive],
    );
  }

  getTransitionTarget() {
    return this.target;
  }
}
