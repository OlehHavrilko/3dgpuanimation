import * as THREE from 'three';
import { BaseLevel, addGlowAttribute, addRimLight, makeInstanceGlow, setControlValue } from '../core/BaseLevel';
import { entry, type CameraKey } from '../core/CameraRig';
import type { LevelMeta, TransitionTarget } from '../core/types';
import { mulberry32, pickByT, smoothstep } from '../core/math';
import { content } from '../content';
import { pointScale } from '../core/points';
import { pickInstances, pickObject } from '../interaction/pick';
import { splineAt } from '../interaction/FollowTracer';

/**
 * Level 6 — FinFETs. Units: nanometres.
 * Dimensions are representative of a 5/4 nm-class process (TSMC does not publish exact
 * 4N figures): fin pitch ~28 nm, contacted gate pitch ~51 nm, fin width ~7 nm.
 *
 * Every gate switches on its own clock phase, so a wave of activity ripples across the
 * array: the high-k collars around each fin and the gate tops glow while a gate is on.
 * Only the transistor we zoom into turns translucent, revealing electrons that flow in a
 * thin inversion layer just under the fin surface.
 */
const C = content.levels.transistor;

export const meta: LevelMeta = {
  ...C.meta,
  unitMeters: 1e-9,
  weight: 1.1,
};

const FIN_PITCH = 28;
const FIN_W = 7;
const FIN_H = 46;
const CPP = 51;
const GATE_L = 16;
const GATE_H = FIN_H + 30;
const N_FINS = 12;
const N_GATES = 14;
const CENTER_FIN = N_FINS / 2;
const CENTER_GATE = N_GATES / 2;
/** The transistor we zoom into sits on the front-most fin so nothing blocks the view. */
const FOCUS_FIN = N_FINS - 1;
const ELECTRONS = 900;
const TRAIL = 3; // head + 2 trail sprites per electron

const GREEN = 0x76b900;
const GREEN_HOT = 0x9cff3a;

export class TransistorLevel extends BaseLevel {
  readonly meta = meta;
  private focusGateMat!: THREE.MeshStandardMaterial;
  private focusCapMat!: THREE.MeshStandardMaterial;
  private focusFinMat!: THREE.MeshStandardMaterial;
  private dielectricMat!: THREE.MeshStandardMaterial;
  private collarGlow!: THREE.InstancedBufferAttribute;
  private capGlow!: THREE.InstancedBufferAttribute;
  private collarGate: Uint8Array = new Uint8Array(0);
  private capGate: Uint8Array = new Uint8Array(0);
  private electronMat!: THREE.ShaderMaterial;
  private ePos!: THREE.BufferAttribute;
  private head = new Float32Array(ELECTRONS * 3);
  private eVel = new Float32Array(ELECTRONS);
  /** Respawn jitter: seeded, so a given frame sequence always draws the same electrons. */
  private eRng = mulberry32(61);
  private gateOn = 0;
  /** Explore controls: gate mode and clock speed. */
  private gateMode: 'OFF' | 'ON' | 'CLOCK' | 'MANUAL' = 'CLOCK';
  /** Manual gate voltage (V); threshold ~0.3 V, full inversion by ~0.45 V. */
  private vg = 0.75;
  /** Rolling logic trace of the focused transistor (CLOCK mode). */
  private bits = '';
  private lastBit = -1;
  private clockSpeed = 1;
  private clockT = 0;
  private finZ = (i: number) => (i - CENTER_FIN) * FIN_PITCH;
  private gateX = (i: number) => (i - CENTER_GATE) * CPP;
  private target: TransitionTarget;

  constructor(ctx: ConstructorParameters<typeof BaseLevel>[0]) {
    super(ctx);
    this.near = 0.5;
    this.far = 6000;
    this.bloom = 1.25;
    this.bokeh = 0.5;
    this.sectionNormal = [0, 0, 1];
    this.followCaption = C.follow;
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
      ...entry({ t: 0, pos: [460, 330, 560], look: [0, 0, 0] }, 0.3),
      { t: 0.3, pos: [cx + 190, 150, cz + 230], look: [cx, 20, cz - 50] },
      { t: 0.55, pos: [cx + 85, 78, cz + 120], look: [cx, 25, cz] },
      // Straight-on to the focused gate: source epi on the left, drain on the right.
      { t: 0.8, pos: [cx + 4, 38, cz + 82], look: [cx, 24, cz] },
      { t: 1.0, pos: [cx + 3, 30, cz + 34], look: [cx, FIN_H * 0.6, cz] },
    ];
  }

  /** On-state (0..1) of gate i. Gates run the same clock with a phase shift. */
  private gateState(i: number) {
    const phase = i === CENTER_GATE ? 0 : i * 0.9 + 1.3;
    return smoothstep(-0.25, 0.25, Math.sin(this.clockT * 1.9 + phase));
  }

  protected build() {
    const s = this.scene;
    s.background = new THREE.Color(0x020405);
    s.fog = new THREE.FogExp2(0x020405, 0.0011);
    s.environmentIntensity = 0.35;
    s.add(new THREE.HemisphereLight(0xdfe9ff, 0x050806, 0.18));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(260, 420, 380);
    s.add(key);
    const fill = new THREE.DirectionalLight(0x4a78ff, 0.9);
    fill.position.set(-400, 60, 120);
    s.add(fill);
    const rim = new THREE.DirectionalLight(GREEN, 0.8);
    rim.position.set(-250, 160, -380);
    s.add(rim);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const lenX = N_GATES * CPP + CPP;
    const lenZ = N_FINS * FIN_PITCH + FIN_PITCH;
    const fz = this.finZ(FOCUS_FIN);
    const cx = this.gateX(CENTER_GATE);

    // ---- substrate + shallow-trench-isolation oxide (dark glass)
    const sub = new THREE.Mesh(
      unit,
      new THREE.MeshStandardMaterial({ color: 0x0c0f13, roughness: 0.6, metalness: 0.2 }),
    );
    sub.scale.set(lenX + 200, 60, lenZ + 200);
    sub.position.y = -50;
    s.add(sub);
    const sti = new THREE.Mesh(
      unit,
      new THREE.MeshPhysicalMaterial({
        color: 0x0d2130,
        roughness: 0.08,
        metalness: 0,
        clearcoat: 1,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }),
    );
    sti.scale.set(lenX + 200, 20, lenZ + 200);
    sti.position.y = -10;
    s.add(sti);
    this.pickables.push(pickObject(sti, C.entities.sti));

    // ---- fins (silicon). The focused one is separate so it can turn translucent.
    const finMat = addRimLight(
      new THREE.MeshStandardMaterial({ color: 0x566170, roughness: 0.3, metalness: 0.5 }),
      GREEN,
      0.18,
    );
    const fins = new THREE.InstancedMesh(unit, finMat, N_FINS - 1);
    for (let i = 0; i < N_FINS - 1; i++) {
      fins.setMatrixAt(i, m.compose(pos.set(0, (FIN_H - 20) / 2, this.finZ(i)), q, scl.set(lenX, FIN_H + 20, FIN_W)));
    }
    s.add(fins);
    const finInfo = C.entities.fin(FIN_W, FIN_H, FIN_PITCH);
    this.pickables.push(pickInstances(fins, () => finInfo));
    this.focusFinMat = addRimLight(
      new THREE.MeshStandardMaterial({ color: 0x566170, roughness: 0.3, metalness: 0.5, transparent: true }),
      GREEN,
      0.18,
    );
    const focusFin = new THREE.Mesh(unit, this.focusFinMat);
    focusFin.scale.set(lenX, FIN_H + 20, FIN_W);
    focusFin.position.set(0, (FIN_H - 20) / 2, fz);
    s.add(focusFin);
    this.pickables.push(pickObject(focusFin, finInfo));

    // ---- high-k collars: where each fin passes through each gate. None under the focused gate:
    // it turns translucent and has its own shell, and a row of collars behind it would read as a slab.
    const collarMat = makeInstanceGlow(new THREE.MeshStandardMaterial({ color: 0x0f1a08, roughness: 0.4 }), GREEN_HOT);
    const collars = new THREE.InstancedMesh(unit, collarMat, (N_GATES - 1) * N_FINS);
    const collarGate: number[] = [];
    let k = 0;
    for (let g = 0; g < N_GATES; g++) {
      for (let f = 0; f < N_FINS; f++) {
        if (g === CENTER_GATE) continue;
        collars.setMatrixAt(
          k++,
          m.compose(
            pos.set(this.gateX(g), (FIN_H + 1.5) / 2, this.finZ(f)),
            q,
            scl.set(GATE_L + 2.4, FIN_H + 1.5, FIN_W + 2.4),
          ),
        );
        collarGate.push(g);
      }
    }
    this.collarGate = Uint8Array.from(collarGate);
    this.collarGlow = addGlowAttribute(collars);
    s.add(collars);
    const collarInfo = C.entities.collar;
    this.pickables.push(pickInstances(collars, () => collarInfo));

    // ---- gates (metal stacks wrapping every fin) + SiN caps with a glowing contact line
    const gateMat = addRimLight(
      new THREE.MeshStandardMaterial({ color: 0x9ba3ae, metalness: 1, roughness: 0.4 }),
      0xd8ffe0,
      0.1,
      4,
    );
    const gates = new THREE.InstancedMesh(unit, gateMat, N_GATES - 1);
    const capMat = makeInstanceGlow(new THREE.MeshStandardMaterial({ color: 0x161c23, roughness: 0.45 }), GREEN_HOT);
    const caps = new THREE.InstancedMesh(unit, capMat, N_GATES - 1);
    const capGate: number[] = [];
    k = 0;
    for (let i = 0; i < N_GATES; i++) {
      if (i === CENTER_GATE) continue;
      gates.setMatrixAt(k, m.compose(pos.set(this.gateX(i), GATE_H / 2, 0), q, scl.set(GATE_L, GATE_H, lenZ - 8)));
      caps.setMatrixAt(k, m.compose(pos.set(this.gateX(i), GATE_H + 4, 0), q, scl.set(GATE_L + 6, 8, lenZ - 8)));
      capGate.push(i);
      k++;
    }
    this.capGate = Uint8Array.from(capGate);
    this.capGlow = addGlowAttribute(caps);
    s.add(gates, caps);
    const gateInfo = C.entities.gate(GATE_L, CPP);
    this.pickables.push(
      pickInstances(gates, () => gateInfo),
      pickInstances(caps, () => C.entities.gateCap),
    );

    // The focused gate: its own translucent materials.
    this.focusGateMat = addRimLight(
      new THREE.MeshStandardMaterial({
        color: 0x9ba3ae,
        metalness: 1,
        roughness: 0.4,
        transparent: true,
        emissive: GREEN,
        emissiveIntensity: 0,
      }),
      0xd8ffe0,
      0.4,
    );
    const focusGate = new THREE.Mesh(unit, this.focusGateMat);
    focusGate.scale.set(GATE_L, GATE_H, lenZ - 8);
    focusGate.position.set(cx, GATE_H / 2, 0);
    s.add(focusGate);
    this.pickables.push(pickObject(focusGate, { ...gateInfo, title: C.entities.gateFocusedTitle }));
    this.focusCapMat = new THREE.MeshStandardMaterial({
      color: 0x161c23,
      roughness: 0.45,
      transparent: true,
      emissive: GREEN_HOT,
      emissiveIntensity: 0,
    });
    const focusCap = new THREE.Mesh(unit, this.focusCapMat);
    focusCap.scale.set(GATE_L + 6, 8, lenZ - 8);
    focusCap.position.set(cx, GATE_H + 4, 0);
    s.add(focusCap);

    // ---- raised source/drain epitaxy: faceted SiP crystals between gates
    const epiMat = addRimLight(
      new THREE.MeshStandardMaterial({ color: 0x777d86, roughness: 0.32, metalness: 0.45, flatShading: true }),
      GREEN,
      0.5,
    );
    const epi = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), epiMat, (N_GATES - 1) * N_FINS);
    k = 0;
    for (let g = 0; g < N_GATES - 1; g++) {
      for (let f = 0; f < N_FINS; f++) {
        epi.setMatrixAt(
          k++,
          m.compose(pos.set(this.gateX(g) + CPP / 2, FIN_H * 0.74, this.finZ(f)), q, scl.set(CPP / 2 - 11, 17, 11.5)),
        );
      }
    }
    s.add(epi);
    this.pickables.push(pickInstances(epi, () => C.entities.sourceDrain));

    // ---- trench contacts (tungsten) + a few M0 copper lines, kept off the focused fin
    const rng = mulberry32(6);
    const tungsten = addRimLight(
      new THREE.MeshStandardMaterial({ color: 0xc4cad3, metalness: 1, roughness: 0.22 }),
      0xffffff,
      0.15,
    );
    const contacts = new THREE.InstancedMesh(unit, tungsten, N_GATES - 1);
    for (let g = 0; g < N_GATES - 1; g++) {
      const w = 60 + rng() * 140;
      const z0 = fz - 26 - w / 2 - rng() * 60;
      contacts.setMatrixAt(g, m.compose(pos.set(this.gateX(g) + CPP / 2, FIN_H + 22, z0), q, scl.set(13, 34, w)));
    }
    s.add(contacts);
    this.pickables.push(pickInstances(contacts, () => C.entities.trenchContact));
    const copper = addRimLight(
      new THREE.MeshStandardMaterial({ color: 0xd9844c, metalness: 1, roughness: 0.3 }),
      0xffb070,
      0.25,
    );
    const m0 = new THREE.InstancedMesh(unit, copper, 6);
    for (let i = 0; i < 6; i++) {
      const z = fz - 60 - i * 2 * FIN_PITCH;
      const len = lenX * (0.35 + rng() * 0.45);
      const x = (rng() - 0.5) * (lenX - len);
      m0.setMatrixAt(i, m.compose(pos.set(x, FIN_H + 52, z), q, scl.set(len, 14, 12)));
    }
    s.add(m0);
    this.pickables.push(pickInstances(m0, () => C.entities.m0));

    this.controls = [
      {
        kind: 'choice',
        label: C.controls.drive,
        options: ['OFF', 'ON', 'CLOCK', 'MANUAL'],
        value: 'CLOCK',
        onChange: (v) => (this.gateMode = v as 'OFF' | 'ON' | 'CLOCK' | 'MANUAL'),
      },
      {
        kind: 'slider',
        label: C.controls.voltage,
        min: 0,
        max: 0.8,
        step: 0.01,
        value: this.vg,
        format: (v) => `${v.toFixed(2)} V`,
        onInput: (v) => {
          this.vg = v;
          this.gateMode = 'MANUAL';
        },
      },
      {
        kind: 'slider',
        label: C.controls.clock,
        min: 0.1,
        max: 3,
        step: 0.05,
        value: 1,
        format: (v) => `${v.toFixed(2)}×`,
        onInput: (v) => (this.clockSpeed = v),
      },
      {
        kind: 'readout',
        label: C.readouts.mode,
        get: () =>
          this.gateMode === 'MANUAL'
            ? C.readouts.manual(this.vg)
            : (content.ui.options[this.gateMode] ?? this.gateMode),
      },
      {
        kind: 'readout',
        label: C.readouts.channel,
        get: () => C.readouts.channelState(this.gateOn),
      },
      {
        kind: 'readout',
        label: C.readouts.current,
        get: () => `${'▮'.repeat(Math.round(this.gateOn * 10)).padEnd(10, '▯')} ${Math.round(this.gateOn * 100)}%`,
      },
      { kind: 'readout', label: C.readouts.logic, get: () => this.bits.split('').join(' ') || '—' },
    ];

    // ---- glowing high-k shell around the focused channel
    // Mostly clear, with glowing edges (Fresnel) so it reads as a thin shell, not a slab.
    this.dielectricMat = addRimLight(
      new THREE.MeshStandardMaterial({
        color: GREEN,
        emissive: GREEN_HOT,
        emissiveIntensity: 0.2,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
      }),
      GREEN_HOT,
      2.0,
      2,
    );
    const shell = new THREE.Mesh(unit, this.dielectricMat);
    shell.scale.set(GATE_L + 0.6, FIN_H + 2, FIN_W + 2.4);
    shell.position.set(cx, FIN_H / 2 + 1, fz);
    s.add(shell);

    this.buildElectrons();
  }

  private buildElectrons() {
    const rng = mulberry32(13);
    const cx = this.gateX(CENTER_GATE);
    const fz = this.finZ(FOCUS_FIN);
    // Inversion layer: electrons hug the two sidewalls and the top of the fin.
    for (let i = 0; i < ELECTRONS; i++) {
      const surf = rng();
      const depth = 0.5 + rng() * 1.3;
      let y: number;
      let z: number;
      if (surf < 0.4) {
        y = 4 + rng() * (FIN_H - 6);
        z = fz - FIN_W / 2 + depth;
      } else if (surf < 0.8) {
        y = 4 + rng() * (FIN_H - 6);
        z = fz + FIN_W / 2 - depth;
      } else {
        y = FIN_H - depth;
        z = fz + (rng() - 0.5) * (FIN_W - 2);
      }
      this.head[i * 3] = cx - CPP + rng() * CPP * 2;
      this.head[i * 3 + 1] = y;
      this.head[i * 3 + 2] = z;
      this.eVel[i] = 0.6 + rng() * 0.8;
    }
    const n = ELECTRONS * TRAIL;
    const positions = new Float32Array(n * 3);
    const alpha = new Float32Array(n);
    for (let i = 0; i < ELECTRONS; i++) {
      for (let j = 0; j < TRAIL; j++) alpha[i * TRAIL + j] = j === 0 ? 1 : j === 1 ? 0.42 : 0.16;
    }
    const geo = new THREE.BufferGeometry();
    this.ePos = new THREE.BufferAttribute(positions, 3);
    this.ePos.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.ePos);
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    this.electronMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uScale: { value: 1 },
        uSize: { value: 1.25 },
        uOn: { value: 0 },
        uCx: { value: cx },
        uHalfGate: { value: GATE_L / 2 },
      },
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        uniform float uScale;
        uniform float uSize;
        uniform float uOn;
        uniform float uCx;
        uniform float uHalfGate;
        varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(uSize * uScale * (0.55 + 0.45 * aAlpha) / -mv.z, 1.0, 36.0);
          // The channel under the gate empties when the gate is off.
          float inChannel = 1.0 - smoothstep(uHalfGate - 1.0, uHalfGate + 1.0, abs(position.x - uCx));
          vA = aAlpha * mix(1.0, uOn, inChannel);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(uv, uv);
          if (r2 > 1.0) discard;
          float core = exp(-r2 * 9.0);
          float halo = exp(-r2 * 2.5) * 0.35;
          float a = (core + halo) * vA;
          gl_FragColor = vec4(mix(vec3(0.55, 1.0, 0.3), vec3(1.0), core) * a * 1.6, a);
        }
      `,
    });
    const pts = new THREE.Points(geo, this.electronMat);
    pts.frustumCulled = false;
    pts.renderOrder = 10; // after the translucent gate + dielectric
    this.scene.add(pts);
  }

  protected animate(t: number, dt: number, time: number) {
    this.clockT += dt * this.clockSpeed;
    // ---- array activity: every gate on its own phase
    const cArr = this.collarGlow.array as Float32Array;
    for (let i = 0; i < cArr.length; i++) cArr[i] = 0.12 + 1.1 * this.gateState(this.collarGate[i]);
    this.collarGlow.needsUpdate = true;
    const gArr = this.capGlow.array as Float32Array;
    for (let i = 0; i < gArr.length; i++) gArr[i] = 0.04 + 0.45 * this.gateState(this.capGate[i]);
    this.capGlow.needsUpdate = true;

    // ---- the focused transistor
    const v =
      this.gateMode === 'OFF'
        ? 0
        : this.gateMode === 'ON'
          ? 1
          : this.gateMode === 'MANUAL'
            ? smoothstep(0.24, 0.45, this.vg) // threshold ~0.3 V
            : this.gateState(CENTER_GATE);
    // Logic trace: record a bit on every transition through the midpoint.
    const bit = v > 0.5 ? 1 : 0;
    if (bit !== this.lastBit) {
      this.lastBit = bit;
      this.bits = (this.bits + bit).slice(-12);
    }
    this.gateOn = v;
    const reveal = smoothstep(0.45, 0.75, t);
    this.focusGateMat.opacity = 1 - 0.9 * reveal;
    this.focusGateMat.depthWrite = this.focusGateMat.opacity > 0.95;
    this.focusGateMat.emissiveIntensity = 0.35 * v * (1 - reveal);
    this.focusCapMat.opacity = 1 - 0.85 * reveal;
    this.focusCapMat.depthWrite = this.focusCapMat.opacity > 0.95;
    this.focusCapMat.emissiveIntensity = 0.04 + 0.45 * v;
    this.focusFinMat.opacity = 1 - 0.72 * smoothstep(0.5, 0.78, t);
    this.focusFinMat.depthWrite = this.focusFinMat.opacity > 0.95;
    this.dielectricMat.emissiveIntensity = (0.1 + 0.5 * v) * (1 - 0.6 * reveal);
    this.dielectricMat.opacity = 0.08 + 0.06 * reveal;
    (this.dielectricMat.userData.rim as { value: number }).value = 0.8 + 2.2 * v;

    // ---- electrons: drift source -> drain; pile up at the barrier while the gate is off
    const cx = this.gateX(CENTER_GATE);
    const x0 = cx - CPP;
    const x1 = cx + CPP;
    const barrier = cx - GATE_L / 2 - 1;
    const h = this.head;
    const out = this.ePos.array as Float32Array;
    for (let i = 0; i < ELECTRONS; i++) {
      const j = i * 3;
      const speed = 55 * this.eVel[i] * (0.3 + 0.7 * v);
      let nx = h[j] + speed * dt;
      if (v < 0.5 && h[j] <= barrier && nx > barrier) nx = barrier - this.eRng() * 3;
      if (nx > x1) nx = x0 + this.eRng() * 4;
      h[j] = nx;
      const jitter = Math.sin(time * 11 + i * 1.7) * 0.25;
      const trail = speed * 0.035;
      for (let s = 0; s < TRAIL; s++) {
        const o = (i * TRAIL + s) * 3;
        out[o] = Math.max(x0, nx - trail * s);
        out[o + 1] = h[j + 1] + jitter;
        out[o + 2] = h[j + 2];
      }
    }
    this.ePos.needsUpdate = true;
    this.electronMat.uniforms.uScale.value = pointScale(this.ctx.renderer, this.ctx.camera);
    this.electronMat.uniforms.uOn.value = v;

    this.caption = pickByT(
      t,
      [0.25, 0.5, 0.75],
      [C.captions.array, C.captions.clocks, C.captions.dielectric, this.gateOn > 0.5 ? C.captions.on : C.captions.off],
    );
  }

  onExploreChange(active: boolean) {
    if (!active) {
      this.gateMode = 'CLOCK';
      this.clockSpeed = 1;
      this.vg = 0.75;
      setControlValue(this.controls[0], 'CLOCK');
      setControlValue(this.controls[1], 0.75);
      setControlValue(this.controls[2], 1);
    }
  }

  /** Down a contact into the source, then into the channel the gate has opened. */
  followPoint(t: number, out: THREE.Vector3) {
    const cx = this.gateX(CENTER_GATE);
    const fz = this.finZ(FOCUS_FIN);
    const path = (this.followCache ??= [
      [cx - CPP / 2, FIN_H + 70, fz + 6],
      [cx - CPP / 2, FIN_H + 10, fz + 2],
      [cx - CPP / 2, FIN_H * 0.7, fz],
      [cx - GATE_L, FIN_H * 0.62, fz + FIN_W / 2 - 1],
      [cx, FIN_H * 0.6, fz + FIN_W / 2 - 1],
    ]);
    return splineAt(path, smoothstep(0.06, 0.98, t), out);
  }

  private followCache: [number, number, number][] | null = null;

  getTransitionTarget() {
    return this.target;
  }
}
