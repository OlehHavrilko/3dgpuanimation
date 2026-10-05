import * as THREE from 'three';
import { BaseLevel, addGlowAttribute, makeInstanceGlow } from '../core/BaseLevel';
import type { CameraKey } from '../core/CameraRig';
import type { LevelMeta, TransitionTarget } from '../core/types';
import { mulberry32, pickByT, smoothstep } from '../core/math';
import { content } from '../content';
import type { EntityInfo } from '../core/types';
import { pickInstancedGroup, pickInstances } from '../interaction/pick';

/**
 * Level 5 — back-end-of-line interconnect, in cross-section. Units: micrometres.
 * A 4N-class stack: aluminium pad layer on top, two ultra-thick global copper layers,
 * then progressively finer copper down to ~28 nm pitch local wiring, contacts and the
 * transistors themselves. The block is cut at z = 0 and the camera stays in front of the
 * cut face, like an SEM cross-section. Each layer only extends as far as the camera can
 * see when it reaches it, which keeps instance counts sane.
 */
const C = content.levels.metal;

export const meta: LevelMeta = {
  ...C.meta,
  unitMeters: 1e-6,
  weight: 1.1,
};

interface MetalLayer {
  name: string;
  pitch: number;
  top: number;
  thick: number;
  span: number;
  alongZ: boolean;
}

const PITCHES = [10, 4, 4, 1.6, 1.6, 0.72, 0.72, 0.32, 0.16, 0.08, 0.064, 0.048, 0.04, 0.036, 0.028, 0.028];
const NAMES = C.layerNames;
const CPP = 0.051; // contacted gate pitch (µm)
const FIN_PITCH = 0.028;

export class MetalLevel extends BaseLevel {
  readonly meta = meta;
  private layers: MetalLayer[] = [];
  private glow!: THREE.InstancedBufferAttribute;
  private glowSeed: Float32Array = new Float32Array(0);
  private feolTop = 0;
  private target!: TransitionTarget;

  constructor(ctx: ConstructorParameters<typeof BaseLevel>[0]) {
    super(ctx);
    this.near = 0.002;
    this.far = 500;
    this.bloom = 1.1;
    this.bokeh = 1.2;
    this.sectionNormal = [0, 0, 1];
    this.followCaption = C.follow;
    this.layout();
  }

  private layout() {
    let y = 0;
    PITCHES.forEach((pitch, i) => {
      const thick = i === 0 ? 2.8 : pitch * 0.9;
      const span = Math.min(40, pitch * 90);
      this.layers.push({ name: NAMES[i], pitch, top: y, thick, span, alongZ: i % 2 === 1 });
      const next = PITCHES[i + 1] ?? pitch;
      y -= thick + Math.min(pitch, next) * 0.7;
    });
    this.feolTop = y;
    this.target = {
      position: new THREE.Vector3(0, this.feolTop - 0.05, 0),
      radius: 0.07,
      approach: new THREE.Vector3(0.3, 0.3, 0.9).normalize(),
    };
  }

  protected cameraKeys(): CameraKey[] {
    // One key every couple of layers: the camera descends and zooms with the pitch.
    const keys: CameraKey[] = [];
    const picks = [0, 2, 4, 6, 8, 10, 12, 15];
    picks.forEach((li, k) => {
      const l = this.layers[li];
      const yc = l.top - l.thick / 2;
      const dist = l.pitch * 9;
      keys.push({
        t: (k / picks.length) * 0.92,
        pos: [dist * 0.4, yc + dist * 0.18, dist],
        look: [0, yc - dist * 0.12, -l.pitch],
      });
    });
    const fy = this.feolTop;
    keys.push({ t: 1, pos: [0.09, fy + 0.05, 0.28], look: [0, fy - 0.05, 0] });
    return keys;
  }

  protected build() {
    const s = this.scene;
    s.background = new THREE.Color(0x030506);
    s.add(new THREE.HemisphereLight(0xeaf3e6, 0x060806, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 5, 8);
    s.add(key);
    const rim = new THREE.DirectionalLight(0x76b900, 1.6);
    rim.position.set(-6, 2, -4);
    s.add(rim);

    const rng = mulberry32(55);
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const q = new THREE.Quaternion();

    // ---- wires: one unit box, scaled per instance
    type Inst = [number, number, number, number, number, number]; // x,y,z,sx,sy,sz
    const copper: Inst[] = [];
    const alu: Inst[] = [];
    const vias: Inst[] = [];
    this.layers.forEach((l, li) => {
      const w = l.pitch * 0.5;
      const n = Math.floor(l.span / l.pitch);
      const yc = l.top - l.thick / 2;
      for (let i = 0; i < n; i++) {
        // x in [-span/2, span/2], z in [-span, 0]; z = 0 is the cut face.
        const acrossX = -l.span / 2 + (i + 0.5) * l.pitch;
        // Front-most tracks first: instances draw in order, so early-z rejects the ones behind.
        const acrossZ = -(i + 0.5) * l.pitch;
        // Split each track into segments with gaps (cell boundaries / line ends).
        let a = 0;
        while (a < l.span) {
          const len = l.pitch * (4 + rng() * 26);
          const b = Math.min(l.span, a + len);
          if (rng() > 0.12 || li === 0 || (l.alongZ && a === 0)) {
            const L = b - a;
            const inst: Inst = l.alongZ
              ? [acrossX, yc, -(a + b) / 2, w, l.thick, L]
              : [-l.span / 2 + (a + b) / 2, yc, acrossZ, L, l.thick, w];
            (li === 0 ? alu : copper).push(inst);
          }
          a = b + l.pitch * (0.6 + rng());
        }
      }
      // Vias down to the next layer
      const next = this.layers[li + 1];
      if (next) {
        const vh = l.top - l.thick - next.top;
        const vw = Math.min(l.pitch, next.pitch) * 0.45;
        const nv = Math.min(500, Math.floor((next.span / next.pitch) * 3));
        for (let i = 0; i < nv; i++) {
          // Snap to the coarser grid so vias line up with tracks
          const g = Math.max(l.pitch, next.pitch);
          const x = Math.round(((rng() - 0.5) * next.span * 0.95) / g) * g + g / 2;
          const z = -Math.round((rng() * next.span * 0.95) / g) * g - g / 2;
          vias.push([x, next.top + vh / 2, z, vw, vh, vw]);
        }
      }
    });

    const unit = new THREE.BoxGeometry(1, 1, 1);
    const copperMat = makeInstanceGlow(
      new THREE.MeshStandardMaterial({ color: 0xd9844c, metalness: 1, roughness: 0.3 }),
      0x9cff3a,
    );
    const fill = (mesh: THREE.InstancedMesh, list: Inst[]) => {
      list.forEach(([x, y, z, sx, sy, sz], i) => {
        mesh.setMatrixAt(i, m.compose(pos.set(x, y, z), q, scl.set(sx, sy, sz)));
      });
      s.add(mesh);
    };
    const copperMesh = new THREE.InstancedMesh(unit, copperMat, copper.length);
    fill(copperMesh, copper);
    this.glow = addGlowAttribute(copperMesh);
    // Which layer a wire belongs to follows from its height.
    const wireInfo = (i: number): EntityInfo | null => {
      copperMesh.getMatrixAt(i, m);
      pos.setFromMatrixPosition(m);
      const li = this.layers.findIndex((l) => pos.y <= l.top + 1e-6 && pos.y >= l.top - l.thick - 1e-6);
      return li < 0 ? null : this.layerInfo(li);
    };
    this.pickables.push(pickInstances(copperMesh, wireInfo));
    this.glowSeed = new Float32Array(copper.length).map(() => (rng() < 0.04 ? rng() * 100 : -1));

    const aluMesh = new THREE.InstancedMesh(
      unit.clone(),
      new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 1, roughness: 0.35 }),
      alu.length,
    );
    fill(aluMesh, alu);
    this.pickables.push(pickInstances(aluMesh, () => this.layerInfo(0)));
    const viaMesh = new THREE.InstancedMesh(
      unit.clone(),
      new THREE.MeshStandardMaterial({ color: 0xb06a3a, metalness: 1, roughness: 0.4 }),
      vias.length,
    );
    fill(viaMesh, vias);
    this.pickables.push(pickInstances(viaMesh, () => C.entities.via));

    // ---- low-k dielectric slabs (faint, so the copper reads)
    const dielectric = new THREE.MeshStandardMaterial({
      color: 0x7fa0b4,
      transparent: true,
      opacity: 0.07,
      roughness: 0.2,
      depthWrite: false,
    });
    this.layers.forEach((l, li) => {
      const next = this.layers[li + 1];
      const bottom = next ? next.top : this.feolTop;
      const h = l.top - bottom;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(l.span, h, l.span), dielectric);
      slab.position.set(0, l.top - h / 2, -l.span / 2);
      s.add(slab);
    });

    this.buildFeol(rng);
  }

  /** Contacts, gates and fins at the very bottom of the stack: the doorway to level 6. */
  private buildFeol(rng: () => number) {
    const s = this.scene;
    const span = 2.4;
    const y0 = this.feolTop;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();

    const nGates = Math.floor(span / CPP);
    const gates = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x9aa3b0, metalness: 0.8, roughness: 0.3, emissive: 0x2a4a10 }),
      nGates,
    );
    for (let i = 0; i < nGates; i++) {
      const x = -span / 2 + (i + 0.5) * CPP;
      gates.setMatrixAt(i, m.compose(pos.set(x, y0 - 0.03, -span / 2), q, scl.set(0.016, 0.05, span)));
    }
    s.add(gates);
    this.pickables.push(pickInstancedGroup(gates, C.entities.gateLines(Math.round(CPP * 1000))));

    const nFins = Math.floor(span / FIN_PITCH);
    const fins = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x6e7a88, metalness: 0.5, roughness: 0.4 }),
      nFins,
    );
    for (let i = 0; i < nFins; i++) {
      const z = -span + (i + 0.5) * FIN_PITCH;
      fins.setMatrixAt(i, m.compose(pos.set(0, y0 - 0.075, z), q, scl.set(span, 0.045, 0.007)));
    }
    s.add(fins);

    const contacts = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xb8bfc8, metalness: 1, roughness: 0.3 }),
      600,
    );
    for (let i = 0; i < 600; i++) {
      const x = Math.round(((rng() - 0.5) * span) / CPP) * CPP;
      const z = -Math.round((rng() * span) / FIN_PITCH) * FIN_PITCH - FIN_PITCH / 2;
      contacts.setMatrixAt(i, m.compose(pos.set(x, y0 + 0.01, z), q, scl.set(0.014, 0.03, 0.014)));
    }
    s.add(contacts);
    this.pickables.push(pickInstances(contacts, () => C.entities.contact));

    const substrate = new THREE.Mesh(
      new THREE.BoxGeometry(span, 0.4, span),
      new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.5, metalness: 0.3 }),
    );
    substrate.position.set(0, y0 - 0.1 - 0.2, -span / 2);
    s.add(substrate);
  }

  protected animate(t: number, _dt: number, time: number) {
    // Signal activity: a few wires pulse green.
    const arr = this.glow.array as Float32Array;
    for (let i = 0; i < arr.length; i++) {
      const sd = this.glowSeed[i];
      arr[i] = sd < 0 ? 0 : Math.pow(Math.max(0, Math.sin(time * 2.2 + sd)), 12) * 1.6;
    }
    this.glow.needsUpdate = true;

    const idx = Math.min(this.layers.length - 1, Math.floor((t / 0.92) * 8) * 2);
    const l = this.layers[idx];
    this.caption = pickByT(t, [0.12, 0.92], [C.captions.top, C.captions.layer(l.name, l.pitch), C.captions.feol]);
  }

  private layerInfo(li: number): EntityInfo {
    const l = this.layers[li];
    return C.entities.layer(l.name, l.pitch, l.alongZ, li);
  }

  /** Down the via stack: thick top metal to 28 nm wiring, then into a contact. */
  followPoint(t: number, out: THREE.Vector3) {
    const u = smoothstep(0.04, 0.99, t);
    // Ease in log space so it spends time in every layer, not just the thick top ones.
    const top = 0.5;
    const bottom = this.feolTop - 0.05;
    const y = top - (top - bottom) * (1 - Math.pow(1 - u, 2.2));
    return out.set(0, y, -0.004);
  }

  getTransitionTarget() {
    return this.target;
  }
}
