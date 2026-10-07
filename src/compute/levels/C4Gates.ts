import * as THREE from 'three';
import { BaseLevel, addRimLight, makeInstanceGlow } from '../../core/BaseLevel';
import { entry, type CameraKey } from '../../core/CameraRig';
import type { LevelMeta, Pickable, TransitionTarget } from '../../core/types';
import { pickByT, smoothstep } from '../../core/math';
import { computeContent } from '../../content/compute';
import { FULL_ADDER, evalFullAdder } from '../logic';
import { pickInstancedGroup, pickInstances, pickObject } from '../../interaction/pick';
import { deviceLights, glowBoxes, type Box } from './common';

/**
 * Compute branch 4 — a full adder from nine NAND gates (logic.ts), then one gate opened up to
 * its four transistors. Units: nanometres, die surface at y = 0, flow towards +x. Wires glow
 * where their net is 1; the three inputs step through all eight cases. The gate layout is the
 * textbook one; the transistors are drawn as fins under a gate bar (a FinFET, as on the next
 * scale), not taken from a cell layout.
 */
const C = computeContent.gates;

export const meta: LevelMeta = {
  ...C.meta,
  unitMeters: 1e-9,
  weight: 1.2,
};

const GATE_W = 300;
const GATE_H = 200;
const GATE_T = 24;
const DX = 520;
const DZ = 300;
const WIRE = 10;

/** [stage, row] of each gate, then of the inputs and outputs. */
const POS: Record<string, [number, number]> = {
  n1: [1, 0],
  n2: [2, -1],
  n3: [2, 1],
  n4: [3, 0],
  n5: [4, 0],
  n6: [5, -1],
  n7: [5, 1],
  n8: [6, 0],
  n9: [6, 2],
  a: [0, -0.7],
  b: [0, 0.7],
  cin: [3, 2],
  sum: [7, 0],
  cout: [7, 2],
};
const at = (id: string) => ({ x: (POS[id][0] - 3) * DX, z: POS[id][1] * DZ });
const LAMPS = ['a', 'b', 'cin', 'sum', 'cout'] as const;
const SUM = 'n8';
const COUT = 'n9';
/** The gate we open up: the first one the inputs reach. */
const OPEN = 'n1';

interface Seg {
  net: string;
  box: Box;
}

/** A NAND symbol: flat body with a rounded front, extruded upwards from y = 0. */
function nandGeometry() {
  const hw = GATE_W / 2;
  const hh = GATE_H / 2;
  const r = hh;
  const s = new THREE.Shape();
  s.moveTo(-hw, -hh);
  s.lineTo(hw - 2 * r + 30, -hh);
  s.absarc(hw - r + 30, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-hw, hh);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: GATE_T, bevelEnabled: false, curveSegments: 14 });
  g.rotateX(-Math.PI / 2);
  return g;
}

export class GatesLevel extends BaseLevel {
  readonly meta = meta;
  private gates!: THREE.InstancedMesh;
  private gateGlow!: THREE.InstancedBufferAttribute;
  private wires!: ReturnType<typeof glowBoxes>;
  private segs: Seg[] = [];
  private lamps!: ReturnType<typeof glowBoxes>;
  private net: Record<string, number> = {};
  private shown: Record<string, number> = {};
  private fins = new THREE.Group();
  private mats: THREE.MeshStandardMaterial[] = [];
  private target: TransitionTarget;

  constructor(ctx: ConstructorParameters<typeof BaseLevel>[0]) {
    super(ctx);
    this.near = 2;
    this.far = 20000;
    this.bloom = 1.3;
    this.bokeh = 1.0;
    this.sectionNormal = [0, 0, 1];
    const o = at(OPEN);
    this.target = {
      position: new THREE.Vector3(o.x, 50, o.z + 50),
      radius: 55,
      approach: new THREE.Vector3(0.2, 0.7, 0.7).normalize(),
    };
  }

  protected cameraKeys(): CameraKey[] {
    const o = at(OPEN);
    const t = this.target;
    const end = t.position.clone().addScaledVector(t.approach!, 190);
    return [
      ...entry({ t: 0, pos: [-300, 1500, 1900], look: [0, 0, 250] }, 0.5, 0.12),
      { t: 0.22, pos: [-1500, 700, 700], look: [-700, 0, 0] },
      { t: 0.42, pos: [-100, 900, 900], look: [300, 0, 200] },
      { t: 0.6, pos: [900, 800, 800], look: [900, 0, 200] },
      { t: 0.72, pos: [o.x + 500, 500, o.z + 600], look: [o.x, 20, o.z] },
      { t: 1, pos: [end.x, end.y, end.z], look: [t.position.x, t.position.y, t.position.z] },
    ];
  }

  protected build() {
    const s = this.scene;
    deviceLights(s, 1500, 0.00018);

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(5200, 40, 2200),
      new THREE.MeshStandardMaterial({ color: 0x0c1118, metalness: 0.4, roughness: 0.6 }),
    );
    floor.position.set(0, -20, 300);
    s.add(floor);

    // Nine NAND gates.
    const body = makeInstanceGlow(
      addRimLight(new THREE.MeshStandardMaterial({ color: 0x3a4658, metalness: 0.7, roughness: 0.35 }), 0x7ac8ff, 0.3),
      0x9cff3a,
    );
    this.gates = new THREE.InstancedMesh(nandGeometry(), body, FULL_ADDER.length);
    const m = new THREE.Matrix4();
    FULL_ADDER.forEach((g, i) => {
      const p = at(g.id);
      this.gates.setMatrixAt(i, m.makeTranslation(p.x, 0, p.z));
    });
    this.gateGlow = new THREE.InstancedBufferAttribute(new Float32Array(FULL_ADDER.length), 1);
    this.gates.geometry.setAttribute('aGlow', this.gateGlow);
    s.add(this.gates);
    this.pickables.push(
      pickInstances(this.gates, (i) =>
        C.entities.gate(FULL_ADDER[i].id, C.roles[FULL_ADDER[i].id as keyof typeof C.roles]),
      ),
    );

    // Output bubbles.
    const bubbles = new THREE.InstancedMesh(
      new THREE.SphereGeometry(15, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a4658, metalness: 0.7, roughness: 0.35 }),
      FULL_ADDER.length,
    );
    FULL_ADDER.forEach((g, i) =>
      bubbles.setMatrixAt(i, m.makeTranslation(at(g.id).x + GATE_W / 2 + 15, GATE_T / 2, at(g.id).z)),
    );
    s.add(bubbles);

    // Wires: input pins sit at z ∓ 50 on the gate's left edge, the output at its right.
    const out = (id: string) => ({ x: at(id).x + GATE_W / 2 + 30, z: at(id).z });
    const lampOut = (id: string) => ({ x: at(id).x + 30, z: at(id).z });
    const source = (net: string) => (net in POS && !net.startsWith('n') ? lampOut(net) : out(net));
    let wireIdx = 0;
    const route = (net: string, to: { x: number; z: number }) => {
      const from = source(net);
      const jx = Math.max(from.x + 60, to.x - 90 - (wireIdx++ % 4) * 28);
      const pts: [number, number][] = [
        [from.x, from.z],
        [Math.min(jx, to.x - 40), from.z],
        [Math.min(jx, to.x - 40), to.z],
        [to.x, to.z],
      ];
      for (let k = 0; k < 3; k++) {
        const [x0, z0] = pts[k];
        const [x1, z1] = pts[k + 1];
        if (Math.abs(x1 - x0) + Math.abs(z1 - z0) < 1) continue;
        this.segs.push({
          net,
          box: {
            x: (x0 + x1) / 2,
            y: 6,
            z: (z0 + z1) / 2,
            w: Math.abs(x1 - x0) + WIRE,
            h: WIRE,
            d: Math.abs(z1 - z0) + WIRE,
          },
        });
      }
    };
    for (const g of FULL_ADDER) {
      const p = at(g.id);
      route(g.a, { x: p.x - GATE_W / 2, z: p.z - 50 });
      route(g.b, { x: p.x - GATE_W / 2, z: p.z + 50 });
    }
    route(SUM, lampOut('sum'));
    route(COUT, lampOut('cout'));
    this.wires = glowBoxes(
      this.segs.map((q) => q.box),
      new THREE.MeshStandardMaterial({ color: 0x566170, metalness: 0.8, roughness: 0.4 }),
      0x9cff3a,
    );
    s.add(this.wires.mesh);
    this.pickables.push(pickInstancedGroup(this.wires.mesh, C.entities.wire));

    // Input and output lamps.
    this.lamps = glowBoxes(
      LAMPS.map((id) => ({ x: at(id).x, y: 14, z: at(id).z, w: 60, h: 28, d: 44 })),
      new THREE.MeshStandardMaterial({ color: 0x2a3340, metalness: 0.4, roughness: 0.4 }),
      0xb6ff3a,
      [0x3aa8ff, 0x3aa8ff, 0x3aa8ff, 0xb6ff3a, 0xb6ff3a],
    );
    s.add(this.lamps.mesh);
    this.pickables.push(
      pickInstances(this.lamps.mesh, (i) =>
        i < 3 ? C.entities.input(C.lamps[LAMPS[i]]) : C.entities.output(C.lamps[LAMPS[i]]),
      ),
    );

    this.buildTransistors();
  }

  /** The four transistors of one NAND: two PMOS in parallel above, two NMOS in series below. */
  private buildTransistors() {
    const o = at(OPEN);
    const mat = (color: number) => {
      const mt = new THREE.MeshStandardMaterial({
        color,
        metalness: 0.5,
        roughness: 0.35,
        transparent: true,
        opacity: 0,
      });
      this.mats.push(mt);
      return mt;
    };
    const pFin = mat(0xff7ab8);
    const nFin = mat(0x6cd4ff);
    const bar = mat(0xaab2bd);
    const make = (fin: THREE.Material, x: number, z: number) => {
      const t = new THREE.Group();
      for (const dz of [-18, 0, 18]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(90, 36, 7), fin);
        f.position.set(0, GATE_T + 18, dz);
        t.add(f);
      }
      const g = new THREE.Mesh(new THREE.BoxGeometry(16, 50, 62), bar);
      g.position.set(0, GATE_T + 25, 0);
      t.add(g);
      t.position.set(x, 0, z);
      return t;
    };
    const p = new THREE.Group();
    const n = new THREE.Group();
    for (const x of [-60, 60]) {
      p.add(make(pFin, x, -50));
      n.add(make(nFin, x, 50));
    }
    this.fins.position.set(o.x, 0, o.z);
    this.fins.add(p, n);
    this.fins.visible = false;
    this.scene.add(this.fins);
    // Real hits only count once the transistors have faded in (listings still see them).
    const gated = (g: THREE.Object3D, info: Parameters<typeof pickObject>[1]): Pickable => {
      const base = pickObject(g, info, 1);
      return { ...base, resolve: (h) => (h.object && !this.fins.visible ? null : base.resolve(h)) };
    };
    this.pickables.push(gated(p, C.entities.pmos), gated(n, C.entities.nmos));
  }

  protected animate(t: number, dt: number, time: number) {
    // Inputs step through the eight cases while "adds" is on screen, else rest on 1 + 1 + 0.
    const stepping = smoothstep(0.34, 0.4, t) * (1 - smoothstep(0.62, 0.66, t));
    const k = stepping > 0.5 ? Math.floor(time / 1.4) % 8 : 3;
    const v = evalFullAdder(k & 1, (k >> 1) & 1, (k >> 2) & 1);
    this.net = { ...v, sum: v[SUM], cout: v[COUT] };
    const follow = 1 - Math.exp(-dt * 10);
    for (const key of Object.keys(this.net))
      this.shown[key] = (this.shown[key] ?? 0) + (this.net[key] - (this.shown[key] ?? 0)) * follow;

    FULL_ADDER.forEach((g, i) => this.gateGlow.setX(i, 0.03 + 0.28 * (this.shown[g.id] ?? 0)));
    this.gateGlow.needsUpdate = true;
    this.segs.forEach((q, i) => this.wires.glow.setX(i, 0.04 + 0.7 * (this.shown[q.net] ?? 0)));
    this.wires.glow.needsUpdate = true;
    LAMPS.forEach((id, i) => this.lamps.glow.setX(i, 0.05 + 1.1 * (this.shown[id] ?? 0)));
    this.lamps.glow.needsUpdate = true;

    // Open the first gate: its transistors fade in.
    const open = smoothstep(0.62, 0.78, t);
    for (const mt of this.mats) mt.opacity = open;
    this.fins.visible = open > 0.15;

    this.caption = pickByT(
      t,
      [0.14, 0.3, 0.42, 0.62, 0.84],
      [C.captions.intro, C.captions.nand, C.captions.xor, C.captions.adds, C.captions.cmos, C.captions.end],
    );
  }

  getTransitionTarget() {
    return this.target;
  }
}
