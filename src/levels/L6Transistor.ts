import * as THREE from 'three';
import { BaseLevel } from '../core/BaseLevel';
import type { CameraKey } from '../core/CameraRig';
import type { LevelMeta, TransitionTarget } from '../core/types';
import { mulberry32, smoothstep } from '../core/math';
import { pointScale } from '../core/points';

/**
 * Level 6 — FinFETs. Units: nanometres.
 * Dimensions are representative of a 5/4 nm-class process (TSMC does not publish exact
 * 4N figures): fin pitch ~28 nm, contacted gate pitch ~51 nm, fin width ~7 nm.
 */
export const meta: LevelMeta = {
  name: 'FinFET transistors',
  scale: '50 nm',
  description: 'Each gate wraps a silicon fin on three sides; a voltage on it opens a channel for electrons.',
  unitMeters: 1e-9,
  weight: 1.1,
};

const FIN_PITCH = 28;
const FIN_W = 7;
const FIN_H = 46;
const CPP = 51;
const GATE_L = 16;
const N_FINS = 12;
const N_GATES = 14;
const ELECTRONS = 1600;
const CENTER_FIN = N_FINS / 2;
/** The transistor we zoom into sits on the front-most fin so nothing blocks the view. */
const FOCUS_FIN = N_FINS - 1;
const CENTER_GATE = N_GATES / 2;

export class TransistorLevel extends BaseLevel {
  readonly meta = meta;
  private gateMat!: THREE.MeshStandardMaterial;
  private focusFinMat!: THREE.MeshStandardMaterial;
  private dielectricMat!: THREE.MeshStandardMaterial;
  private electronMat!: THREE.ShaderMaterial;
  private electrons!: THREE.BufferAttribute;
  private eVel = new Float32Array(ELECTRONS);
  private gateOn = 0;
  private finZ = (i: number) => (i - CENTER_FIN) * FIN_PITCH;
  private gateX = (i: number) => (i - CENTER_GATE) * CPP;
  private target: TransitionTarget;

  constructor(ctx: ConstructorParameters<typeof BaseLevel>[0]) {
    super(ctx);
    this.near = 0.5;
    this.far = 6000;
    this.bloom = 1.2;
    this.bokeh = 0.6;
    this.target = {
      position: new THREE.Vector3(this.gateX(CENTER_GATE), FIN_H * 0.6, this.finZ(FOCUS_FIN)),
      radius: 4,
      approach: new THREE.Vector3(0.1, 0.2, 0.97).normalize(),
    };
  }

  protected cameraKeys(): CameraKey[] {
    const cx = this.gateX(CENTER_GATE);
    const cz = this.finZ(FOCUS_FIN);
    return [
      { t: 0.0, pos: [420, 380, 520], look: [0, 0, 0] },
      { t: 0.3, pos: [cx + 170, 160, cz + 230], look: [cx, 20, cz - 40] },
      { t: 0.55, pos: [cx + 70, 80, cz + 120], look: [cx, 25, cz] },
      // Straight-on to the gate: source epi on the left, drain on the right.
      { t: 0.8, pos: [cx + 2, 36, cz + 80], look: [cx, 24, cz] },
      { t: 1.0, pos: [cx + 3, 30, cz + 34], look: [cx, FIN_H * 0.6, cz] },
    ];
  }

  protected build() {
    const s = this.scene;
    s.background = new THREE.Color(0x030506);
    s.environmentIntensity = 0.45;
    s.add(new THREE.HemisphereLight(0xe6f3e0, 0x060806, 0.3));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(200, 400, 300);
    s.add(key);
    const rim = new THREE.DirectionalLight(0x76b900, 1.4);
    rim.position.set(-300, 100, -200);
    s.add(rim);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const lenX = N_GATES * CPP + CPP;
    const lenZ = N_FINS * FIN_PITCH + FIN_PITCH;

    // Substrate + shallow-trench-isolation oxide
    const sub = new THREE.Mesh(unit, new THREE.MeshStandardMaterial({ color: 0x1f242b, roughness: 0.5, metalness: 0.3 }));
    sub.scale.set(lenX, 60, lenZ);
    sub.position.y = -50;
    s.add(sub);
    const sti = new THREE.Mesh(
      unit,
      new THREE.MeshStandardMaterial({ color: 0x1b3445, roughness: 0.15, transparent: true, opacity: 0.6, depthWrite: false }),
    );
    sti.scale.set(lenX, 20, lenZ);
    sti.position.y = -10;
    s.add(sti);

    // Fins. The focused one is a separate translucent mesh so we can see electrons inside it.
    const finMat = new THREE.MeshStandardMaterial({ color: 0x55606e, roughness: 0.35, metalness: 0.4 });
    const fins = new THREE.InstancedMesh(unit, finMat, N_FINS - 1);
    for (let i = 0; i < N_FINS - 1; i++) {
      fins.setMatrixAt(i, m.compose(pos.set(0, (FIN_H - 20) / 2, this.finZ(i)), q, scl.set(lenX, FIN_H + 20, FIN_W)));
    }
    s.add(fins);
    this.focusFinMat = finMat.clone();
    this.focusFinMat.transparent = true;
    const focusFin = new THREE.Mesh(unit, this.focusFinMat);
    focusFin.scale.set(lenX, FIN_H + 20, FIN_W);
    focusFin.position.set(0, (FIN_H - 20) / 2, this.finZ(FOCUS_FIN));
    s.add(focusFin);

    // Gates (metal gate stacks wrapping every fin)
    this.gateMat = new THREE.MeshStandardMaterial({
      color: 0x8e98a6,
      metalness: 0.9,
      roughness: 0.3,
      transparent: true,
      opacity: 1,
      emissive: 0x76b900,
      emissiveIntensity: 0,
    });
    const gates = new THREE.InstancedMesh(unit, this.gateMat, N_GATES);
    const gateH = FIN_H + 34;
    for (let i = 0; i < N_GATES; i++) {
      gates.setMatrixAt(i, m.compose(pos.set(this.gateX(i), gateH / 2, 0), q, scl.set(GATE_L, gateH, lenZ - 8)));
    }
    s.add(gates);

    // Gate caps + spacers
    const caps = new THREE.InstancedMesh(
      unit,
      new THREE.MeshStandardMaterial({ color: 0x2b3440, roughness: 0.4 }),
      N_GATES,
    );
    for (let i = 0; i < N_GATES; i++) {
      caps.setMatrixAt(i, m.compose(pos.set(this.gateX(i), gateH + 6, 0), q, scl.set(GATE_L + 8, 12, lenZ - 8)));
    }
    s.add(caps);

    // Raised source/drain epitaxy: diamond-shaped SiP / SiGe crystals between gates
    const epiGeo = new THREE.OctahedronGeometry(1, 0);
    const epi = new THREE.InstancedMesh(
      epiGeo,
      new THREE.MeshStandardMaterial({ color: 0x5d6570, roughness: 0.45, metalness: 0.3, flatShading: true }),
      (N_GATES - 1) * N_FINS,
    );
    let k = 0;
    for (let g = 0; g < N_GATES - 1; g++) {
      for (let f = 0; f < N_FINS; f++) {
        epi.setMatrixAt(
          k++,
          m.compose(pos.set(this.gateX(g) + CPP / 2, FIN_H * 0.72, this.finZ(f)), q, scl.set(CPP / 2 - 9, 22, 12)),
        );
      }
    }
    s.add(epi);

    // Trench contacts on top of the S/D
    const rng = mulberry32(6);
    const contacts = new THREE.InstancedMesh(
      unit,
      new THREE.MeshStandardMaterial({ color: 0xc7cdd6, metalness: 1, roughness: 0.25 }),
      N_GATES - 1,
    );
    for (let g = 0; g < N_GATES - 1; g++) {
      const w = lenZ * (0.3 + rng() * 0.5);
      contacts.setMatrixAt(g, m.compose(pos.set(this.gateX(g) + CPP / 2, FIN_H + 18, -w / 2 + (rng() - 0.5) * 40), q, scl.set(14, 24, w)));
    }
    s.add(contacts);

    // High-k dielectric shell around the focused fin, under the focused gate
    this.dielectricMat = new THREE.MeshStandardMaterial({
      color: 0x76b900,
      emissive: 0x9cff3a,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });
    const shell = new THREE.Mesh(unit, this.dielectricMat);
    shell.scale.set(GATE_L + 0.5, FIN_H + 2, FIN_W + 3);
    shell.position.set(this.gateX(CENTER_GATE), FIN_H / 2 + 1, this.finZ(FOCUS_FIN));
    s.add(shell);

    this.buildElectrons();
  }

  private buildElectrons() {
    const rng = mulberry32(13);
    const pos = new Float32Array(ELECTRONS * 3);
    const cx = this.gateX(CENTER_GATE);
    const cz = this.finZ(FOCUS_FIN);
    for (let i = 0; i < ELECTRONS; i++) {
      pos[i * 3] = cx - CPP + rng() * CPP * 2;
      pos[i * 3 + 1] = 4 + rng() * (FIN_H - 6);
      pos[i * 3 + 2] = cz + (rng() - 0.5) * (FIN_W - 1.5);
      this.eVel[i] = 0.6 + rng() * 0.8;
    }
    const geo = new THREE.BufferGeometry();
    this.electrons = new THREE.BufferAttribute(pos, 3);
    this.electrons.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.electrons);
    this.electronMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 1 }, uSize: { value: 1.3 }, uOn: { value: 0 } },
      vertexShader: /* glsl */ `
        uniform float uScale;
        uniform float uSize;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(uSize * uScale / -mv.z, 1.0, 40.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOn;
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(uv, uv);
          if (r2 > 1.0) discard;
          float a = exp(-r2 * 4.0) * (0.25 + 0.75 * uOn);
          gl_FragColor = vec4(vec3(0.75, 1.0, 0.55) * a * 1.8, a);
        }
      `,
    });
    const pts = new THREE.Points(geo, this.electronMat);
    pts.frustumCulled = false;
    pts.renderOrder = 10; // after the translucent gate + dielectric
    this.scene.add(pts);
  }

  protected animate(t: number, dt: number, time: number) {
    // Gate voltage: square-ish clock, ~0.6 Hz in "slow motion".
    const v = smoothstep(-0.25, 0.25, Math.sin(time * 1.9));
    this.gateOn = v;
    this.gateMat.emissiveIntensity = 0.6 * v * (1 - smoothstep(0.45, 0.7, t) * 0.7);
    this.dielectricMat.emissiveIntensity = 0.2 + 1.1 * v;
    this.dielectricMat.opacity = 0.12 + 0.14 * smoothstep(0.35, 0.6, t);
    // Fade gates out as we approach so the channel is visible
    this.gateMat.opacity = 1 - 0.88 * smoothstep(0.45, 0.75, t);
    this.gateMat.depthWrite = this.gateMat.opacity > 0.95;
    this.focusFinMat.opacity = 1 - 0.7 * smoothstep(0.5, 0.78, t);
    this.focusFinMat.depthWrite = this.focusFinMat.opacity > 0.95;

    // Electrons drift source -> drain while the gate is on
    const arr = this.electrons.array as Float32Array;
    const cx = this.gateX(CENTER_GATE);
    const x0 = cx - CPP;
    const x1 = cx + CPP;
    for (let i = 0; i < ELECTRONS; i++) {
      const j = i * 3;
      // Under the gate (the channel) electrons only move when the gate is on;
      // in source/drain they jitter thermally regardless.
      const inChannel = Math.abs(arr[j] - cx) < GATE_L * 0.6;
      const speed = 60 * this.eVel[i] * (inChannel ? v : 0.25 + 0.75 * v);
      arr[j] += speed * dt;
      if (!inChannel || v > 0.2) {
        arr[j + 1] += Math.sin(time * 9 + i) * dt * 4;
      }
      if (arr[j] > x1) arr[j] = x0;
    }
    this.electrons.needsUpdate = true;
    this.electronMat.uniforms.uScale.value = pointScale(this.ctx.renderer, this.ctx.camera);
    this.electronMat.uniforms.uOn.value = 0.4 + 0.6 * v;

    this.caption =
      t < 0.25
        ? 'FinFET array · fin pitch ~28 nm · gate pitch ~51 nm'
        : t < 0.5
          ? 'Gate wraps the silicon fin on three sides'
          : t < 0.75
            ? 'High-k dielectric (HfO₂, ~1–2 nm) insulates gate from channel'
            : this.gateOn > 0.5
              ? 'Gate ON → electrons flow source → drain'
              : 'Gate OFF → channel pinched off';
  }

  getTransitionTarget() {
    return this.target;
  }
}
