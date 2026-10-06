import * as THREE from 'three';
import { BaseLevel, addGlowAttribute, makeInstanceGlow } from '../../core/BaseLevel';
import { entry, type CameraKey } from '../../core/CameraRig';
import type { LevelMeta, TransitionTarget } from '../../core/types';
import { mulberry32, pickByT, range, smoothstep } from '../../core/math';
import { canvasTexture } from '../../core/canvas';
import { content } from '../../content';
import { pickInstances, pickObject } from '../../interaction/pick';
import { studioLights } from './common';

/**
 * Memory branch 2 — the DRAM die. Units: millimetres. Top surface at y = 0.
 * Floorplan after TechInsights' GDDR7 analysis: two cell-array regions split by a central
 * peripheral strip. Each region holds two of the four channels; each channel is drawn as a
 * 4 × 4 grid of banks made of mats (bank count and layout are representative).
 */
const C = content.memory.die;

export const meta: LevelMeta = {
  ...C.meta,
  unitMeters: 0.001,
  weight: 1,
};

const W = 10.2;
const D = 7.4;
const STRIP = 1.1;
const CH_NAMES = ['A', 'B', 'C', 'D'];
const BANKS_X = 4;
const BANKS_Z = 4;
/** The bank that opens a row (channel B, bank 6) and the mat we dive into. */
const ACTIVE = { channel: 1, bx: 1, bz: 1 };
const MATS = 8;

interface Bank {
  x: number;
  z: number;
  w: number;
  d: number;
  channel: number;
  n: number;
}

export class DieLevel extends BaseLevel {
  readonly meta = meta;
  private banks: Bank[] = [];
  private bankGlow!: THREE.InstancedBufferAttribute;
  private activeIndex = 0;
  private row!: THREE.Mesh;
  private rowMat!: THREE.MeshBasicMaterial;
  private cmd!: THREE.Mesh;
  private cmdMat!: THREE.MeshBasicMaterial;
  private stripGlow!: THREE.MeshStandardMaterial;
  private target: TransitionTarget = {
    position: new THREE.Vector3(),
    radius: 0.25,
    approach: new THREE.Vector3(0.1, 0.94, 0.33).normalize(),
  };

  constructor(ctx: ConstructorParameters<typeof BaseLevel>[0]) {
    super(ctx);
    this.near = 0.02;
    this.far = 400;
    this.bloom = 1.15;
    this.bokeh = 1.2;
    this.sectionNormal = [0, 0, 1];
    this.layout();
  }

  private layout() {
    const half = (D - STRIP) / 2;
    const margin = 0.18;
    for (let c = 0; c < 4; c++) {
      const x0 = c % 2 === 0 ? -W / 2 + margin : margin / 2;
      const z0 = c < 2 ? -D / 2 + margin : STRIP / 2 + margin / 2;
      const cw = W / 2 - margin * 1.5;
      const cd = half - margin * 1.5;
      const bw = cw / BANKS_X;
      const bd = cd / BANKS_Z;
      for (let bz = 0; bz < BANKS_Z; bz++)
        for (let bx = 0; bx < BANKS_X; bx++) {
          if (c === ACTIVE.channel && bx === ACTIVE.bx && bz === ACTIVE.bz) this.activeIndex = this.banks.length;
          this.banks.push({
            x: x0 + (bx + 0.5) * bw,
            z: z0 + (bz + 0.5) * bd,
            w: bw * 0.92,
            d: bd * 0.9,
            channel: c,
            n: bz * BANKS_X + bx,
          });
        }
    }
  }

  private get active() {
    return this.banks[this.activeIndex];
  }

  /** Centre of the mat we dive into (one mat in from the active bank's strip-side edge). */
  private matCentre(out: THREE.Vector3) {
    const b = this.active;
    const mw = b.w / MATS;
    const md = b.d / MATS;
    return out.set(b.x - b.w / 2 + mw * 5.5, 0.012, b.z - b.d / 2 + md * 4.5);
  }

  protected cameraKeys(): CameraKey[] {
    const b = this.active;
    const mat = this.matCentre(new THREE.Vector3());
    return [
      ...entry({ t: 0, pos: [1.5, 9.5, 7.5], look: [0, 0, 0] }, 0.3, 0.14),
      { t: 0.3, pos: [-3.4, 2.4, 4.6], look: [0, 0, 0.2] },
      { t: 0.52, pos: [b.x + 2.6, 3.2, b.z + 3.2], look: [b.x, 0, b.z] },
      { t: 0.78, pos: [b.x + 0.7, 1.3, b.z + 1.0], look: [b.x, 0, b.z] },
      { t: 1, pos: [mat.x + 0.12, 0.62, mat.z + 0.24], look: [mat.x, 0, mat.z] },
    ];
  }

  protected build() {
    const s = this.scene;
    studioLights(s, 14, 0x76b900);
    s.environmentIntensity = 0.6;

    // Silicon body.
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(W, 0.4, D),
      new THREE.MeshStandardMaterial({ color: 0x14181e, metalness: 0.6, roughness: 0.4 }),
    );
    body.position.y = -0.2;
    s.add(body);

    // Mats: one texture shared by every bank tile.
    const rng = mulberry32(8);
    const matTex = canvasTexture(512, 512, (g, w, h) => {
      g.fillStyle = '#1a2230';
      g.fillRect(0, 0, w, h);
      const cell = w / MATS;
      for (let i = 0; i < MATS; i++)
        for (let j = 0; j < MATS; j++) {
          const l = 17 + rng() * 7;
          g.fillStyle = `hsl(${210 + rng() * 25}, 34%, ${l}%)`;
          g.fillRect(i * cell + 4, j * cell + 4, cell - 8, cell - 8);
          // fine wordline hatch
          g.strokeStyle = 'rgba(200, 220, 255, 0.08)';
          g.lineWidth = 1;
          for (let k = 6; k < cell - 6; k += 4) {
            g.beginPath();
            g.moveTo(i * cell + 4, j * cell + k);
            g.lineTo(i * cell + cell - 4, j * cell + k);
            g.stroke();
          }
        }
      // sense-amp stripes between mats
      g.fillStyle = 'rgba(120, 150, 90, 0.5)';
      for (let i = 0; i <= MATS; i++) g.fillRect(0, i * cell - 2, w, 4);
    });
    const bankMat = makeInstanceGlow(
      new THREE.MeshStandardMaterial({ map: matTex, metalness: 0.35, roughness: 0.5 }),
      0x9cff3a,
    );
    const banks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.02, 1), bankMat, this.banks.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    this.banks.forEach((b, i) =>
      banks.setMatrixAt(i, m.compose(new THREE.Vector3(b.x, 0.01, b.z), q, new THREE.Vector3(b.w, 1, b.d))),
    );
    this.bankGlow = addGlowAttribute(banks);
    s.add(banks);
    this.pickables.push(
      pickInstances(banks, (i) => {
        const b = this.banks[i];
        const ch = CH_NAMES[b.channel];
        return C.entities.bank(C.bank(ch, b.n), C.channel(ch));
      }),
    );

    // Central strip: I/O pads, PAM3 transceivers, command decoder, data path.
    const stripTex = canvasTexture(1024, 112, (g, w, h) => {
      g.fillStyle = '#262c35';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) {
        g.fillStyle = i % 5 === 0 ? '#a7843f' : '#5b6574';
        g.fillRect(12 + i * ((w - 24) / 60), h / 2 - 9, (w - 24) / 60 - 5, 18);
      }
      g.fillStyle = 'rgba(120, 200, 255, 0.35)';
      g.fillRect(w * 0.08, 8, w * 0.84, 14);
      g.fillRect(w * 0.08, h - 22, w * 0.84, 14);
      g.fillStyle = 'rgba(182, 255, 58, 0.4)';
      g.fillRect(w * 0.44, 26, w * 0.12, h - 52);
    });
    this.stripGlow = new THREE.MeshStandardMaterial({
      map: stripTex,
      metalness: 0.5,
      roughness: 0.4,
      emissive: 0x3aa8ff,
      emissiveIntensity: 0.05,
    });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.025, STRIP - 0.12), this.stripGlow);
    strip.position.y = 0.012;
    s.add(strip);
    this.pickables.push(pickObject(strip, C.entities.strip));
    const pam = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.84, 0.03, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x3aa8ff, emissive: 0x3aa8ff, emissiveIntensity: 0.4 }),
    );
    pam.position.set(0, 0.02, -STRIP / 2 + 0.16);
    s.add(pam);
    this.pickables.push(pickObject(pam, C.entities.pam3, 1));

    // The open row: a bright line across the active bank.
    const b = this.active;
    this.rowMat = new THREE.MeshBasicMaterial({ color: 0xb6ff3a, transparent: true, opacity: 0 });
    this.row = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.01, b.d / 40), this.rowMat);
    this.row.position.set(b.x, 0.026, b.z);
    s.add(this.row);
    this.pickables.push(pickObject(this.row, C.entities.row, 2));

    // The ACTIVATE command, travelling from the strip to the bank.
    this.cmdMat = new THREE.MeshBasicMaterial({ color: 0xe9ffd0, transparent: true, opacity: 0 });
    this.cmd = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), this.cmdMat);
    s.add(this.cmd);
  }

  protected animate(t: number, _dt: number, time: number) {
    const b = this.active;
    // Strip pulses gently: the I/O never sleeps.
    this.stripGlow.emissiveIntensity = 0.05 + 0.12 * (0.5 + 0.5 * Math.sin(time * 4)) * smoothstep(0.15, 0.3, t);

    // ACTIVATE: command travels, then the bank lights and a row sweeps.
    const travel = range(t, 0.36, 0.46);
    const from = new THREE.Vector3(b.x, 0.08, -STRIP / 2 + 0.16);
    const to = new THREE.Vector3(b.x, 0.08, b.z);
    this.cmd.position.lerpVectors(from, to, travel);
    this.cmdMat.opacity = travel > 0 && travel < 1 ? 1 : 0;

    const lit = smoothstep(0.44, 0.5, t);
    for (let i = 0; i < this.banks.length; i++) {
      const sameChannel = this.banks[i].channel === b.channel;
      const base = sameChannel ? 0.04 * smoothstep(0.3, 0.4, t) : 0;
      this.bankGlow.setX(i, i === this.activeIndex ? base + 0.35 * lit : base);
    }
    this.bankGlow.needsUpdate = true;

    // The row sweeps once to show "one row at a time", then rests on the mat we dive into.
    const sweep = range(t, 0.5, 0.7);
    const rowZ = b.z - b.d / 2 + b.d * (0.1 + 0.8 * Math.sin(sweep * Math.PI * 0.5));
    const rest = this.matCentre(new THREE.Vector3()).z;
    this.row.position.z = t < 0.7 ? rowZ : rest;
    this.rowMat.opacity = lit * (0.6 + 0.4 * Math.sin(time * 6));

    this.matCentre(this.target.position);

    const bankName = C.bank(CH_NAMES[b.channel], b.n);
    this.caption = pickByT(
      t,
      [0.14, 0.34, 0.6, 0.84],
      [C.captions.intro, C.captions.strip, C.captions.activate(bankName), C.captions.mats, C.captions.dive],
    );
  }

  getTransitionTarget() {
    return this.target;
  }
}
