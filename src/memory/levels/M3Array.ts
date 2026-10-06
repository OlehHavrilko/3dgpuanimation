import * as THREE from 'three';
import { BaseLevel, addGlowAttribute, addRimLight, makeInstanceGlow } from '../../core/BaseLevel';
import { entry, type CameraKey } from '../../core/CameraRig';
import type { LevelMeta, TransitionTarget } from '../../core/types';
import { mulberry32, pickByT, range, smoothstep } from '../../core/math';
import { content } from '../../content';
import { QUALITY } from '../../core/quality';
import { pickInstances, pickObject } from '../../interaction/pick';
import { studioLights } from './common';

/**
 * Memory branch 3 — the cell array inside one mat. Units: nanometres. Silicon surface at y = 0.
 * Wordlines run along x, buried in the silicon; bitlines run along z just above it; the
 * storage capacitors stand on top in a staggered (honeycomb) grid, one per wordline × bitline
 * crossing, which is what a 6F² cell gives: 32.6 nm × 37.6 nm ≈ 0.00123 µm² per cell.
 */
const C = content.memory.array;

export const meta: LevelMeta = {
  ...C.meta,
  unitMeters: 1e-9,
  weight: 1,
};

/** Samsung 1b-generation pitches (TechInsights). */
export const WL_PITCH = 32.6;
export const BL_PITCH = 37.6;
const COLS = QUALITY.tier === 'low' ? 18 : 24;
const ROWS = QUALITY.tier === 'low' ? 20 : 28;
const CAP_R = 12;
/** Drawn capacitor height: real ones are taller (cut short to fit). */
const CAP_H = 640;
const CAP_Y = 44;
/** The row that opens: the front edge, so the camera sees it. */
const ACTIVE_ROW = ROWS - 1;
/** The cell we dive into, on the active row. */
const TARGET_COL = Math.floor(COLS / 2);

const xOf = (col: number, row: number) => (col - (COLS - 1) / 2) * BL_PITCH + (row % 2 ? BL_PITCH / 4 : -BL_PITCH / 4);
const zOf = (row: number) => (row - (ROWS - 1) / 2) * WL_PITCH;

export class ArrayLevel extends BaseLevel {
  readonly meta = meta;
  private bits: number[] = [];
  private capGlow!: THREE.InstancedBufferAttribute;
  private blGlow!: THREE.InstancedBufferAttribute;
  private saGlow!: THREE.InstancedBufferAttribute;
  private sa!: THREE.InstancedMesh;
  private wlMat!: THREE.MeshStandardMaterial;
  private activeWl!: THREE.Mesh;
  private target: TransitionTarget = {
    position: new THREE.Vector3(xOf(TARGET_COL, ACTIVE_ROW), CAP_Y + 30, zOf(ACTIVE_ROW)),
    radius: 30,
    approach: new THREE.Vector3(0.12, 0.3, 0.95).normalize(),
  };

  constructor(ctx: ConstructorParameters<typeof BaseLevel>[0]) {
    super(ctx);
    this.near = 2;
    this.far = 20000;
    this.bloom = 1.25;
    this.bokeh = 1.1;
    this.sectionNormal = [0, 0, 1];
    const rng = mulberry32(17);
    for (let i = 0; i < COLS * ROWS; i++) this.bits.push(rng() < 0.5 ? 1 : 0);
    // The cell we follow holds a 1.
    this.bits[ACTIVE_ROW * COLS + TARGET_COL] = 1;
  }

  protected cameraKeys(): CameraKey[] {
    const tx = xOf(TARGET_COL, ACTIVE_ROW);
    const tz = zOf(ACTIVE_ROW);
    return [
      ...entry({ t: 0, pos: [520, 980, 900], look: [0, 220, 0] }, 0.35, 0.14),
      { t: 0.32, pos: [-640, 160, 620], look: [0, 60, 120] },
      { t: 0.55, pos: [260, 260, tz + 560], look: [0, 120, tz] },
      { t: 0.78, pos: [tx + 120, 150, tz + 260], look: [tx, 90, tz - 20] },
      { t: 1, pos: [tx + 40, 110, tz + 150], look: [tx, CAP_Y + 30, tz] },
    ];
  }

  protected build() {
    const s = this.scene;
    studioLights(s, 1200, 0x76b900);
    const fill = new THREE.PointLight(0x7ac8ff, 2.2e5, 2400, 1.6);
    fill.position.set(0, 500, 700);
    s.add(fill);

    const sizeX = COLS * BL_PITCH + 80;
    const sizeZ = ROWS * WL_PITCH + 80;

    // Silicon: opaque body, translucent top layer so the buried wordlines show.
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(sizeX, 220, sizeZ),
      new THREE.MeshStandardMaterial({ color: 0x39424f, metalness: 0.3, roughness: 0.6 }),
    );
    body.position.y = -60 - 110;
    s.add(body);
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(sizeX, 60, sizeZ),
      new THREE.MeshPhysicalMaterial({
        color: 0x6a7a8c,
        roughness: 0.35,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    );
    top.position.y = -30;
    s.add(top);
    this.pickables.push(pickObject(top, content.memory.cell.entities.substrate, -1));

    // Buried wordlines (TiN), one per row.
    this.wlMat = new THREE.MeshStandardMaterial({ color: 0x8a95a6, metalness: 0.8, roughness: 0.35 });
    const wls = new THREE.InstancedMesh(new THREE.BoxGeometry(sizeX - 20, 18, 13), this.wlMat, ROWS);
    const m = new THREE.Matrix4();
    for (let r = 0; r < ROWS; r++) wls.setMatrixAt(r, m.makeTranslation(0, -38, zOf(r)));
    s.add(wls);
    this.pickables.push(pickObject(wls, C.entities.wordline));
    this.activeWl = new THREE.Mesh(
      new THREE.BoxGeometry(sizeX - 18, 19, 14),
      new THREE.MeshStandardMaterial({ color: 0x9cff3a, emissive: 0x9cff3a, emissiveIntensity: 0, transparent: true }),
    );
    this.activeWl.position.set(0, -38, zOf(ACTIVE_ROW));
    s.add(this.activeWl);

    // Bitlines (tungsten), one per column, just above the surface.
    const blMat = makeInstanceGlow(
      new THREE.MeshStandardMaterial({ color: 0xb4bcc8, metalness: 0.9, roughness: 0.3 }),
      0x6cd4ff,
    );
    const bls = new THREE.InstancedMesh(new THREE.BoxGeometry(14, 14, sizeZ - 30), blMat, COLS);
    for (let c = 0; c < COLS; c++) bls.setMatrixAt(c, m.makeTranslation((c - (COLS - 1) / 2) * BL_PITCH, 18, -10));
    this.blGlow = addGlowAttribute(bls);
    s.add(bls);
    this.pickables.push(pickObject(bls, C.entities.bitline));

    // Storage capacitors: tall TiN cylinders.
    const capMat = addRimLight(
      makeInstanceGlow(new THREE.MeshStandardMaterial({ color: 0x9aa6b8, metalness: 0.85, roughness: 0.28 }), 0x9cff3a),
      0x7ac8ff,
      0.35,
    );
    const capGeo = new THREE.CylinderGeometry(CAP_R, CAP_R, CAP_H, 14, 1, false);
    capGeo.translate(0, CAP_H / 2 + CAP_Y, 0);
    const caps = new THREE.InstancedMesh(capGeo, capMat, COLS * ROWS);
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) caps.setMatrixAt(r * COLS + c, m.makeTranslation(xOf(c, r), 0, zOf(r)));
    this.capGlow = addGlowAttribute(caps);
    s.add(caps);
    this.pickables.push(pickInstances(caps, (i) => C.entities.capacitor(this.bits[i])));

    // Landing pads under every capacitor.
    const pads = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(CAP_R + 3, CAP_R + 3, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x6d7684, metalness: 0.8, roughness: 0.4 }),
      COLS * ROWS,
    );
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) pads.setMatrixAt(r * COLS + c, m.makeTranslation(xOf(c, r), CAP_Y - 6, zOf(r)));
    s.add(pads);

    // Sense amplifiers at the far edge, one per bitline.
    const saMat = makeInstanceGlow(
      new THREE.MeshStandardMaterial({ color: 0x2b3340, metalness: 0.5, roughness: 0.5 }),
      0xffffff,
    );
    this.sa = new THREE.InstancedMesh(new THREE.BoxGeometry(26, 26, 46), saMat, COLS);
    const saZ = zOf(0) - 70;
    for (let c = 0; c < COLS; c++) {
      this.sa.setMatrixAt(c, m.makeTranslation((c - (COLS - 1) / 2) * BL_PITCH, 13, saZ));
    }
    this.saGlow = addGlowAttribute(this.sa);
    s.add(this.sa);
    this.pickables.push(pickObject(this.sa, C.entities.senseAmp));
  }

  protected animate(t: number, _dt: number, time: number) {
    // Wordline goes high.
    const on = smoothstep(0.36, 0.42, t);
    const wl = this.activeWl.material as THREE.MeshStandardMaterial;
    wl.emissiveIntensity = on * (1.4 + 0.3 * Math.sin(time * 8));
    wl.opacity = 0.2 + 0.8 * on;

    // Charge sharing: the row's charged cells flash and drain; the bitlines take a small signal.
    const share = range(t, 0.42, 0.56);
    const restore = smoothstep(0.62, 0.72, t);
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        const charged = this.bits[i] ? 0.1 : 0;
        if (r === ACTIVE_ROW) {
          const flash = this.bits[i] ? on * (1.4 * (1 - share) + 0.35 * share + 1.1 * restore) : 0;
          this.capGlow.setX(i, charged + flash);
        } else this.capGlow.setX(i, charged * 0.6);
      }
    this.capGlow.needsUpdate = true;
    for (let c = 0; c < COLS; c++) {
      const bit = this.bits[ACTIVE_ROW * COLS + c];
      this.blGlow.setX(c, on * (bit ? 0.25 + 0.6 * restore : 0.03) * (0.4 + 0.6 * share));
    }
    this.blGlow.needsUpdate = true;

    // Sense amplifiers latch: green for a 1, dim blue for a 0.
    const latch = smoothstep(0.58, 0.66, t);
    for (let c = 0; c < COLS; c++) {
      const bit = this.bits[ACTIVE_ROW * COLS + c];
      this.saGlow.setX(c, latch * (bit ? 1.1 : 0.25));
    }
    this.saGlow.needsUpdate = true;

    this.caption = pickByT(
      t,
      [0.16, 0.36, 0.58, 0.82],
      [C.captions.intro, C.captions.pitch, C.captions.activate, C.captions.sense, C.captions.dive],
    );
  }

  getTransitionTarget() {
    return this.target;
  }
}
