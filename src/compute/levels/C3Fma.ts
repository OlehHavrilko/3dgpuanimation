import * as THREE from 'three';
import { BaseLevel } from '../../core/BaseLevel';
import { entry, type CameraKey } from '../../core/CameraRig';
import type { LevelMeta, TransitionTarget } from '../../core/types';
import { canvasTexture } from '../../core/canvas';
import { lerp, pickByT, range, smoothstep } from '../../core/math';
import { computeContent } from '../../content/compute';
import { bitArray, fma, significand } from '../fma';
import { pickInstancedGroup, pickObject } from '../../interaction/pick';
import { glowBoxes, haloMaterial, setBox, studioLights, type Box } from './common';
import { laneValues, DIVE_LANE } from './C2Warp';

/**
 * Compute branch 3 — the FP32 fused multiply-add of the lane we dived into: d = a × b + c with
 * a = π, b = e, c = 0.25 (float32). Units: micrometres. Operand rows of 32 bit boxes (pink sign,
 * amber exponent, blue mantissa; a 1 stands tall and glows) feed, in order along +z: the exponent
 * adder, a 24 × 24 array of partial products (a cell is lit where the row's bit and the column's
 * bit are both 1), the alignment shifter that c joins, the wide adder, the normalise-and-round
 * stage and the result row. The numbers are the real float32 values from fma.ts; the unit's
 * internal structure is the textbook one, not NVIDIA's circuit.
 */
const C = computeContent.fma;

export const meta: LevelMeta = {
  ...C.meta,
  unitMeters: 1e-6,
  weight: 1.1,
};

const P = 1.2;
const FIELD_COLORS = [0xff5ad2, 0xffb43a, 0x3aa8ff];
const fieldOf = (i: number) => (i === 0 ? 0 : i <= 8 ? 1 : 2);
const MX = 4.8;
const MZ = -14;
const Z_A = -46;
const Z_B = -43.2;
const C_X = 46;
const Z_END = 32;
const BLOCK_Y = 0.8;

const lane = laneValues(DIVE_LANE);
const trace = fma(lane.a, lane.b, lane.c);
const sigBits = (x: number) => Array.from({ length: 24 }, (_, i) => (significand(x) >> (23 - i)) & 1);
const bitString = (x: number) => {
  const b = bitArray(x).join('');
  return `${b[0]} ${b.slice(1, 9)} ${b.slice(9)}`;
};
const show = (x: number) => Number(x.toPrecision(8));

interface Block {
  mesh: THREE.Mesh;
  from: number;
  to: number;
}

export class FmaLevel extends BaseLevel {
  readonly meta = meta;
  private rows: { bits: number[]; boxes: Box[]; g: ReturnType<typeof glowBoxes> }[] = [];
  private grid!: ReturnType<typeof glowBoxes>;
  private cells: number[] = [];
  private wires!: ReturnType<typeof glowBoxes>;
  private blocks: Block[] = [];
  private markerAB = new THREE.Group();
  private markerC = new THREE.Group();
  private fieldLabels: THREE.Sprite[] = [];
  private target: TransitionTarget = {
    position: new THREE.Vector3(MX, BLOCK_Y, 15),
    radius: 7,
    approach: new THREE.Vector3(0.25, 0.65, 0.7).normalize(),
  };

  constructor(ctx: ConstructorParameters<typeof BaseLevel>[0]) {
    super(ctx);
    this.near = 0.05;
    this.far = 700;
    this.bloom = 1.25;
    this.bokeh = 1.0;
    this.sectionNormal = [0, 0, 1];
  }

  protected cameraKeys(): CameraKey[] {
    const t = this.target;
    const end = t.position.clone().addScaledVector(t.approach!, 20);
    return [
      ...entry({ t: 0, pos: [70, 80, 100], look: [20, 0, -6] }, 0.45, 0.12),
      { t: 0.2, pos: [-24, 12, -28], look: [0, 0, -45] },
      { t: 0.36, pos: [40, 24, -36], look: [MX, 0, MZ] },
      { t: 0.56, pos: [44, 26, 4], look: [20, 0, 2] },
      { t: 0.72, pos: [-24, 18, 28], look: [MX, 0, 14] },
      { t: 0.86, pos: [34, 26, 46], look: [MX, 0, 22] },
      { t: 1, pos: [end.x, end.y, end.z], look: [t.position.x, t.position.y, t.position.z] },
    ];
  }

  private bitRow(value: number, x0: number, z: number) {
    const bits = bitArray(value);
    const boxes: Box[] = bits.map((b, i) => ({
      x: x0 + (i - 15.5) * P,
      y: (b ? 1 : 0.25) / 2,
      z,
      w: 1,
      h: b ? 1 : 0.25,
      d: 1,
    }));
    const g = glowBoxes(
      boxes,
      new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.35 }),
      0xffffff,
      bits.map((_, i) => FIELD_COLORS[fieldOf(i)]),
    );
    this.scene.add(g.mesh);
    this.rows.push({ bits, boxes, g });
  }

  private block(x: number, z: number, w: number, d: number, color: number, from: number, to: number) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, 1.4, d),
      new THREE.MeshStandardMaterial({
        color: 0x232c38,
        metalness: 0.6,
        roughness: 0.4,
        emissive: color,
        emissiveIntensity: 0,
      }),
    );
    mesh.position.set(x, 0.7, z);
    this.scene.add(mesh);
    this.blocks.push({ mesh, from, to });
    return mesh;
  }

  protected build() {
    const s = this.scene;
    studioLights(s, 120);
    s.environmentIntensity = 0.5;

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(160, 1, 130),
      new THREE.MeshStandardMaterial({ color: 0x10151c, metalness: 0.5, roughness: 0.5 }),
    );
    floor.position.set(22, -0.55, -8);
    s.add(floor);

    // Operand and result rows.
    this.bitRow(lane.a, MX, Z_A);
    this.bitRow(lane.b, MX, Z_B);
    this.bitRow(lane.c, C_X, Z_A);
    this.bitRow(trace.value, MX, Z_END);
    const info = [
      C.entities.operand('a', show(lane.a), bitString(lane.a)),
      C.entities.operand('b', show(lane.b), bitString(lane.b)),
      C.entities.operand('c', show(lane.c), bitString(lane.c)),
      C.entities.result(show(trace.value), bitString(trace.value)),
    ];
    this.rows.forEach((r, i) => this.pickables.push(pickInstancedGroup(r.g.mesh, info[i])));

    // Sign / exponent / mantissa captions above row a.
    const label = (text: string, x: number) => {
      const tex = canvasTexture(256, 64, (g, w, h) => {
        g.fillStyle = '#d8e2dc';
        g.font = '600 38px ui-monospace, Menlo, Consolas, monospace';
        g.textAlign = 'center';
        g.fillText(text, w / 2, h * 0.7);
      });
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }),
      );
      sp.scale.set(10, 2.5, 1);
      sp.position.set(x, 3.2, Z_A - 2.4);
      this.scene.add(sp);
      this.fieldLabels.push(sp);
    };
    const fx = (i: number) => MX + (i - 15.5) * P;
    label(C.fieldNames.sign, fx(0) - 1);
    label(C.fieldNames.exponent, fx(4.5));
    label(C.fieldNames.mantissa, fx(20));

    // The multiplier array: one cell per pair of significand bits.
    const sa = sigBits(lane.a);
    const sb = sigBits(lane.b);
    const cells: Box[] = [];
    for (let i = 0; i < 24; i++)
      for (let j = 0; j < 24; j++) {
        const on = sa[i] & sb[j];
        this.cells.push(on);
        cells.push({
          x: MX + (j - 11.5) * P,
          y: on ? 0.4 : 0.15,
          z: MZ + (i - 11.5) * P,
          w: 1,
          h: on ? 0.8 : 0.3,
          d: 1,
        });
      }
    this.grid = glowBoxes(
      cells,
      new THREE.MeshStandardMaterial({ color: 0x3b4658, metalness: 0.6, roughness: 0.4 }),
      0xb6ff3a,
    );
    s.add(this.grid.mesh);
    this.pickables.push(pickInstancedGroup(this.grid.mesh, C.entities.multiplier));

    // The other stages.
    const exp = this.block(MX - 9.2, -33, 11, 6, 0xffb43a, 0.28, 0.42);
    const sh = this.block(22, 6, 76, 3.5, 0x6cd4ff, 0.5, 0.64);
    const add = this.block(MX, 15, 52, 4, 0x9cff3a, 0.62, 0.76);
    const rnd = this.block(MX, 24, 52, 3, 0xff5ad2, 0.74, 0.86);
    this.pickables.push(
      pickObject(exp, C.entities.exponent),
      pickObject(sh, C.entities.aligner),
      pickObject(add, C.entities.adder),
      pickObject(rnd, C.entities.round),
    );

    // Wires between the stages (lit once the number has passed).
    const seg = (z0: number, z1: number, x = MX): Box => ({ x, y: 0.15, z: (z0 + z1) / 2, w: 0.5, h: 0.3, d: z1 - z0 });
    this.wires = glowBoxes(
      [seg(-44, -29.5), seg(1, 4.2), seg(7.8, 13), seg(17, 22.4), seg(25.6, 31.2), seg(-44, 4.2, C_X)],
      new THREE.MeshStandardMaterial({ color: 0x566170, metalness: 0.8, roughness: 0.4 }),
      0xb6ff3a,
    );
    s.add(this.wires.mesh);
    this.pickables.push(pickInstancedGroup(this.wires.mesh, computeContent.gates.entities.wire));

    // The number on its way: a bright core with a halo.
    for (const m of [this.markerAB, this.markerC]) {
      m.add(new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })));
      m.add(new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 8), haloMaterial(0xb6ff3a)));
      s.add(m);
    }
  }

  protected animate(t: number, _dt: number, time: number) {
    const win = (a: number, b: number) => smoothstep(a, a + 0.02, t) * (1 - smoothstep(b, b + 0.03, t));
    const pulse = 0.5 + 0.5 * Math.sin(time * 6);

    // Rows: ones glow; the three fields flash in turn while they are being named.
    const flash = [win(0.14, 0.18), win(0.19, 0.24), win(0.25, 0.3)];
    const reveal = range(t, 0.78, 0.9);
    this.rows.forEach((r, ri) => {
      const isResult = ri === 3;
      r.bits.forEach((bit, i) => {
        const k = isResult ? smoothstep(0, 0.4, reveal * 1.6 - (i / 32) * 0.6) : 1;
        const h = lerp(0.1, bit ? 1 : 0.25, k);
        setBox(r.g.mesh, i, { ...r.boxes[i], h, y: h / 2 });
        r.g.glow.setX(i, (bit ? 0.18 : 0.02) * k + flash[fieldOf(i)] * (bit ? 0.6 : 0.2) * (isResult ? 0 : 1));
      });
      r.g.mesh.instanceMatrix.needsUpdate = true;
      r.g.glow.needsUpdate = true;
    });
    for (const l of this.fieldLabels) (l.material as THREE.SpriteMaterial).opacity = win(0.13, 0.28);

    // The number moves down the datapath; the grid lights up as a diagonal wave.
    const u = range(t, 0.28, 0.82);
    const uc = range(t, 0.46, 0.64);
    this.markerAB.visible = u > 0 && u < 1;
    this.markerAB.position.set(MX, 1.6, lerp(Z_A + 1.5, Z_END - 1.5, u));
    this.markerC.visible = uc > 0 && uc < 1;
    this.markerC.position.set(C_X, 1.6, lerp(Z_A + 1.5, 3.5, uc));
    this.markerAB.scale.setScalar(1 + 0.15 * pulse);

    const zs = [-44, 1, 7.8, 17, 25.6];
    for (let i = 0; i < 5; i++) {
      const z = lerp(Z_A + 1.5, Z_END - 1.5, u);
      this.wires.glow.setX(i, 0.05 + 0.55 * smoothstep(zs[i], zs[i] + 4, z));
    }
    this.wires.glow.setX(5, 0.05 + 0.55 * smoothstep(0, 0.9, uc));
    this.wires.glow.needsUpdate = true;

    const wave = range(t, 0.3, 0.52);
    for (let i = 0; i < 24; i++)
      for (let j = 0; j < 24; j++) {
        const d = (i + j) / 46;
        const passed = smoothstep(d, d + 0.1, wave);
        const front = Math.exp(-(((wave - d) * 9) ** 2));
        this.grid.glow.setX(
          i * 24 + j,
          passed * (this.cells[i * 24 + j] ? 0.6 : 0.03) + front * 0.45 * (wave < 1 ? 1 : 0),
        );
      }
    this.grid.glow.needsUpdate = true;

    for (const b of this.blocks) {
      (b.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.04 + 0.9 * win(b.from, b.to) * (0.7 + 0.3 * pulse);
    }

    this.caption = pickByT(
      t,
      [0.13, 0.3, 0.52, 0.76, 0.88],
      [C.captions.intro, C.captions.fields, C.captions.multiply, C.captions.add, C.captions.pack, C.captions.dive],
    );
  }

  getTransitionTarget() {
    return this.target;
  }
}
