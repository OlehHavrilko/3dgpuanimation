import * as THREE from 'three';
import { BaseLevel, addRimLight } from '../../core/BaseLevel';
import { entry, type CameraKey } from '../../core/CameraRig';
import type { LevelMeta, TransitionTarget } from '../../core/types';
import { clamp, mulberry32, pickByT, range, smoothstep } from '../../core/math';
import { memoryContent } from '../../content/memory';
import { QUALITY } from '../../core/quality';
import { pickObject } from '../../interaction/pick';
import { pointScale } from '../../core/points';
import { deviceLights, glowPointsMaterial } from './common';

/**
 * Memory branch 4 — one DRAM cell and its bit. Units: nanometres. Silicon surface at y = 0,
 * the front face (z = +D/2) is the cut. Two cells share one bitline contact, as in a 6F²
 * array; we follow the right one (+x). The capacitor plate sits at VDD/2, so a storage node
 * at 0 V holds ~C·VDD/2 of extra electrons: that is the charge drawn here.
 */
const C = memoryContent.cell;

export const meta: LevelMeta = {
  ...C.meta,
  unitMeters: 1e-9,
  weight: 1.2,
};

const D = 60;
const TRENCH_X = 22;
const SN_X = 47;
const CAP_Y = 82;
const CAP_H = 420;
const CAP_R = 15;
/** One drawn dot ≈ 100 electrons. */
const PER_DOT = 100;
const DOTS = Math.round(310 * Math.max(0.6, QUALITY.pointBudget));
const LEAKY = 0.35;

type P = [number, number, number];

/** Point along a polyline at s in [0, 1] (by segment count, close enough for short paths). */
function along(path: P[], s: number, out: THREE.Vector3) {
  const n = path.length - 1;
  const f = clamp(s) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const k = f - i;
  const a = path[i];
  const b = path[i + 1];
  return out.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
}

interface Dot {
  home: P;
  read: P[];
  leak: P[] | null;
  delay: number;
}

export class CellLevel extends BaseLevel {
  readonly meta = meta;
  private dots: Dot[] = [];
  private points!: THREE.Points;
  private pointUniforms!: ReturnType<typeof glowPointsMaterial>['uniforms'];
  private pos!: THREE.BufferAttribute;
  private alpha!: THREE.BufferAttribute;
  private gateMat!: THREE.MeshStandardMaterial;
  private channelMat!: THREE.MeshStandardMaterial;
  private bitlineMat!: THREE.MeshStandardMaterial;
  private electrons = DOTS * PER_DOT;
  private tmp = new THREE.Vector3();
  private target: TransitionTarget = {
    position: new THREE.Vector3(SN_X, CAP_Y + 40, 0),
    radius: 20,
  };

  constructor(ctx: ConstructorParameters<typeof BaseLevel>[0]) {
    super(ctx);
    this.near = 1;
    this.far = 6000;
    this.bloom = 1.3;
    this.bokeh = 1.0;
    this.sectionNormal = [0, 0, 1];
  }

  protected cameraKeys(): CameraKey[] {
    return [
      ...entry({ t: 0, pos: [150, 210, 330], look: [20, 90, 0] }, 0.3, 0.12),
      { t: 0.3, pos: [120, 50, 310], look: [20, -10, 0] },
      { t: 0.5, pos: [-60, 20, 290], look: [15, -25, 0] },
      { t: 0.7, pos: [-40, 170, 260], look: [30, 70, 0] },
      { t: 0.86, pos: [120, 260, 260], look: [SN_X, 170, 0] },
      { t: 1, pos: [210, 230, 430], look: [10, 110, 0] },
    ];
  }

  protected build() {
    const s = this.scene;
    deviceLights(s, 500, 0.0012);

    const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      s.add(m);
      return m;
    };

    // Silicon active region and the oxide isolation (STI) around it.
    const si = new THREE.MeshStandardMaterial({ color: 0x1a2028, metalness: 0.3, roughness: 0.55 });
    const silicon = box(160, 160, D, 0, -80, 0, si);
    this.pickables.push(pickObject(silicon, C.entities.substrate, -1));
    const oxide = new THREE.MeshPhysicalMaterial({
      color: 0x0d2130,
      roughness: 0.75,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    box(50, 160, D, -105, -80, 0, oxide);
    box(50, 160, D, 105, -80, 0, oxide);

    // n+ source (shared, centre) and drains, drawn on the cut face.
    const nplus = new THREE.MeshStandardMaterial({ color: 0x5a2a1a, roughness: 0.55, emissive: 0x2a0c04 });
    box(22, 34, 1, 0, -17, D / 2 + 0.6, nplus);
    box(26, 34, 1, -SN_X, -17, D / 2 + 0.6, nplus);
    box(26, 34, 1, SN_X, -17, D / 2 + 0.6, nplus);

    // Buried wordlines: TiN at the bottom of a trench, nitride cap above, thin gate oxide around.
    this.gateMat = new THREE.MeshStandardMaterial({
      color: 0x566170,
      metalness: 0.85,
      roughness: 0.35,
      emissive: 0x9cff3a,
      emissiveIntensity: 0,
    });
    const otherGate = new THREE.MeshStandardMaterial({ color: 0x566170, metalness: 0.85, roughness: 0.35 });
    const capN = new THREE.MeshStandardMaterial({ color: 0x161c23, roughness: 0.45 });
    const gox = new THREE.MeshStandardMaterial({ color: 0x2f5a78, roughness: 0.3 });
    for (const sx of [-1, 1]) {
      const x = sx * TRENCH_X;
      box(18, 82, D + 2, x, -41, 0, gox);
      const gate = box(14, 38, D + 2.4, x, -59, 0, sx > 0 ? this.gateMat : otherGate);
      box(14, 40, D + 2.4, x, -20, 0, capN);
      if (sx > 0) this.pickables.push(pickObject(gate, C.entities.wordline, 1));
    }

    // The channel: a U of inversion around the bottom of the right trench (lit when the gate is on).
    this.channelMat = new THREE.MeshStandardMaterial({
      color: 0x203018,
      emissive: 0x9cff3a,
      emissiveIntensity: 0,
      transparent: true,
      opacity: 0.9,
    });
    box(28, 6, 1.2, TRENCH_X, -86, D / 2 + 0.8, this.channelMat);
    box(4, 50, 1.2, TRENCH_X - 11, -58, D / 2 + 0.8, this.channelMat);
    box(4, 50, 1.2, TRENCH_X + 11, -58, D / 2 + 0.8, this.channelMat);
    const trans = new THREE.Group();
    trans.add(new THREE.Mesh(new THREE.BoxGeometry(60, 100, D)));
    trans.position.set(TRENCH_X, -45, 0);
    trans.visible = false;
    s.add(trans);
    this.pickables.push(pickObject(trans.children[0], C.entities.transistor, 0));

    // Bitline contact and the bitline itself, running along z out of the frame.
    const tungsten = addRimLight(
      new THREE.MeshStandardMaterial({ color: 0x7d8590, metalness: 1, roughness: 0.5 }),
      0x7ac8ff,
      0.12,
    );
    box(18, 40, 18, 0, 20, 0, tungsten);
    this.bitlineMat = new THREE.MeshStandardMaterial({
      color: 0x9ba3ae,
      metalness: 1,
      roughness: 0.4,
      emissive: 0x6cd4ff,
      emissiveIntensity: 0,
    });
    const bitline = box(24, 22, 200, 0, 51, D / 2 - 100, this.bitlineMat);
    box(24, 10, 200, 0, 67, D / 2 - 100, capN);
    this.pickables.push(pickObject(bitline, C.entities.bitline, 1));

    // Storage-node contacts, landing pads and the two capacitors.
    const padMat = new THREE.MeshStandardMaterial({ color: 0x3c4450, metalness: 0.85, roughness: 0.4 });
    const electrode = addRimLight(
      new THREE.MeshStandardMaterial({
        color: 0x566170,
        metalness: 0.6,
        roughness: 0.35,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      0x7ac8ff,
      0.3,
    );
    const dielectric = new THREE.MeshPhysicalMaterial({
      color: 0xc89a3a,
      roughness: 0.2,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
    });
    const plate = new THREE.MeshStandardMaterial({
      color: 0x2a313b,
      metalness: 0.6,
      roughness: 0.4,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
    });
    for (const sx of [-1, 1]) {
      const x = sx * SN_X;
      const contact = box(18, 70, 18, x, 35, 0, tungsten);
      if (sx > 0) this.pickables.push(pickObject(contact, C.entities.contact, 1));
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(19, 19, 12, 24), padMat);
      pad.position.set(x, CAP_Y - 6, 0);
      s.add(pad);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(CAP_R, CAP_R, CAP_H, 32, 1, true), electrode);
      cup.position.set(x, CAP_Y + CAP_H / 2, 0);
      cup.renderOrder = 3;
      s.add(cup);
      const di = new THREE.Mesh(new THREE.CylinderGeometry(CAP_R + 3, CAP_R + 3, CAP_H, 32, 1, true), dielectric);
      di.position.copy(cup.position);
      di.renderOrder = 4;
      s.add(di);
      const outer = new THREE.Mesh(new THREE.CylinderGeometry(CAP_R + 9, CAP_R + 9, CAP_H + 10, 32), plate);
      outer.position.copy(cup.position);
      outer.renderOrder = 5;
      s.add(outer);
      if (sx > 0) this.pickables.push(pickObject(outer, C.entities.capacitor, 1));
    }

    this.buildCharge();

    this.controls = [{ kind: 'readout', label: C.entities.electrons.title, get: () => C.electrons(this.electrons) }];
  }

  private buildCharge() {
    const rng = mulberry32(41);
    const pos = new Float32Array(DOTS * 3);
    const alpha = new Float32Array(DOTS);
    for (let i = 0; i < DOTS; i++) {
      const a = rng() * Math.PI * 2;
      // Charge sits on the inner electrode: mostly near the wall.
      const r = (CAP_R - 2) * Math.sqrt(0.35 + 0.65 * rng());
      const home: P = [SN_X + Math.cos(a) * r, CAP_Y + 6 + rng() * (CAP_H * 0.86), Math.sin(a) * r];
      const zr = (rng() - 0.5) * 220;
      // Below the surface the path runs on the cut face, where the channel is drawn.
      const face = D / 2 + 2;
      const j = () => (rng() - 0.5) * 6;
      const read: P[] = [
        home,
        [SN_X, CAP_Y - 4, 0],
        [SN_X, 4, 0],
        [SN_X + j(), -12, face],
        [TRENCH_X + 12 + j(), -45, face],
        [TRENCH_X + j(), -88, face],
        [TRENCH_X - 12 + j(), -45, face],
        [j(), -12, face],
        [0, 6, 0],
        [0, 51, -10],
        [(rng() - 0.5) * 16, 51, Math.min(zr, 0) - 30],
      ];
      const leak: P[] | null =
        rng() < LEAKY
          ? [
              home,
              [SN_X, CAP_Y - 4, 0],
              [SN_X + 4, 4, 0],
              [SN_X + 6, -10, D / 2 + 2],
              [SN_X + 10 + rng() * 20, -150, D / 2 + 2],
            ]
          : null;
      this.dots.push({ home, read, leak, delay: rng() * 0.5 });
      pos.set(home, i * 3);
      alpha[i] = 1;
    }
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(pos, 3);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    this.alpha = new THREE.BufferAttribute(alpha, 1);
    this.alpha.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pos);
    geo.setAttribute('aAlpha', this.alpha);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 100, 0), 600);
    const { mat, uniforms } = glowPointsMaterial(0x3ab8ff, 4.5);
    this.pointUniforms = uniforms;
    this.points = new THREE.Points(geo, mat);
    this.points.renderOrder = 10;
    this.scene.add(this.points);
    this.pickables.push(pickObject(this.points, C.entities.electrons, 2));
  }

  protected animate(t: number, _dt: number, time: number) {
    // Phases: read (charge leaves), restore (comes back), leak (some drift away), refresh.
    const gate =
      smoothstep(0.32, 0.36, t) * (1 - smoothstep(0.68, 0.72, t)) +
      smoothstep(0.86, 0.88, t) * (1 - smoothstep(0.93, 0.95, t));
    this.gateMat.emissiveIntensity = 0.9 * gate;
    this.channelMat.emissiveIntensity = 0.9 * gate * (0.8 + 0.2 * Math.sin(time * 10));
    const read = range(t, 0.36, 0.5);
    const restore = range(t, 0.54, 0.68);
    const leak = range(t, 0.72, 0.86);
    const refresh = range(t, 0.87, 0.94);
    this.bitlineMat.emissiveIntensity = 0.3 * Math.sin(Math.PI * clamp(read * 1.2)) + 0.2 * Math.sin(Math.PI * restore);

    let home = 0;
    const p = this.tmp;
    for (let i = 0; i < this.dots.length; i++) {
      const d = this.dots[i];
      let a = 1;
      const out = clamp(read * 1.5 - d.delay) - clamp(restore * 1.5 - d.delay);
      if (out > 0) {
        along(d.read, out, p);
      } else if (d.leak && leak > 0) {
        const s = clamp(leak * 1.4 - d.delay * 0.6);
        along(d.leak, s, p);
        a = 1 - smoothstep(0.7, 1, s);
        if (refresh > 0) {
          // The refresh rewrites the cell: the lost charge comes back.
          const back = clamp(refresh * 1.4 - d.delay * 0.4);
          p.set(...d.home);
          a = back;
        }
      } else {
        p.set(...d.home);
      }
      // A slow shimmer so the stored charge reads as alive.
      if (out <= 0) p.y += Math.sin(time * 1.7 + i) * 0.8;
      this.pos.setXYZ(i, p.x, p.y, p.z);
      this.alpha.setX(i, a);
      if (out <= 0 && a > 0.5) home++;
    }
    this.pos.needsUpdate = true;
    this.alpha.needsUpdate = true;
    this.electrons = home * PER_DOT;
    this.pointUniforms.uScale.value = pointScale(this.ctx.renderer, this.ctx.camera);

    this.caption = pickByT(
      t,
      [0.14, 0.34, 0.52, 0.7, 0.9],
      [C.captions.intro, C.captions.bit, C.captions.read, C.captions.restore, C.captions.leak, C.captions.end],
    );
  }

  getTransitionTarget() {
    return this.target;
  }
}
