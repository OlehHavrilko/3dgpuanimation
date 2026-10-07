import * as THREE from 'three';
import { META } from './meta';
import { QUALITY } from '../core/quality';
import { BaseLevel, setControlValue } from '../core/BaseLevel';
import type { CameraKey } from '../core/CameraRig';
import type { TransitionTarget } from '../core/types';
import { pickByT, smoothstep } from '../core/math';
import { content } from '../content';
import { pointScale } from '../core/points';
import { pickInstancedGroup, pickInstances } from '../interaction/pick';
import { splineAt } from '../interaction/FollowTracer';

/**
 * Level 7 — crystalline silicon. Units: ångström.
 * Diamond cubic = FCC lattice + a second FCC offset by (¼,¼,¼)a, a = 5.431 Å.
 * Bonds are found from geometry (nearest-neighbour distance a·√3/4 ≈ 2.35 Å).
 */
const C = content.levels.lattice;

const meta = META[6];

const A = 5.431;
const CELLS = 4;
const ATOM_R = 0.62;
const BOND_R = 0.16;
const BOND_LEN = (A * Math.sqrt(3)) / 4;

const FCC = [
  [0, 0, 0],
  [0, 0.5, 0.5],
  [0.5, 0, 0.5],
  [0.5, 0.5, 0],
];

function latticeAtoms() {
  const pts: THREE.Vector3[] = [];
  const c = (CELLS * A) / 2;
  for (let i = 0; i < CELLS; i++)
    for (let j = 0; j < CELLS; j++)
      for (let k = 0; k < CELLS; k++)
        for (const off of [0, 0.25])
          for (const b of FCC) {
            pts.push(new THREE.Vector3((i + b[0] + off) * A - c, (j + b[1] + off) * A - c, (k + b[2] + off) * A - c));
          }
  return pts;
}

export class LatticeLevel extends BaseLevel {
  readonly meta = meta;
  private atoms = latticeAtoms();
  private centerIndex = 0;
  private dopants = new Map<number, 'P' | 'B'>();
  private atomMesh!: THREE.InstancedMesh;
  /** Which dopants are shown: scripted = both; Explore control can pick a type. */
  private doping: 'Mixed' | 'Intrinsic' | 'N-type' | 'P-type' = 'Mixed';
  private carriers!: THREE.Points;
  private carrierMat!: THREE.ShaderMaterial;
  private carrierPos!: THREE.BufferAttribute;
  private carrierAtoms: number[] = [];
  private bondGlow!: THREE.ShaderMaterial;
  private atomMat!: THREE.MeshPhysicalMaterial;
  private group = new THREE.Group();
  private target: TransitionTarget;

  constructor(ctx: ConstructorParameters<typeof BaseLevel>[0]) {
    super(ctx);
    this.near = 0.05;
    this.far = 1000;
    this.bloom = 1.15;
    this.bokeh = 1.2;
    this.sectionNormal = [0, 0, 1];
    this.followCaption = C.follow;
    // Atom closest to the centre is the one we dive into.
    let best = Infinity;
    this.atoms.forEach((p, i) => {
      const d = p.lengthSq();
      if (d < best) {
        best = d;
        this.centerIndex = i;
      }
    });
    // A handful of dopants: phosphorus (n-type donors) and one boron (p-type acceptor).
    const pick = (x: number, y: number, z: number) => {
      let bi = 0;
      let bd = Infinity;
      this.atoms.forEach((p, i) => {
        const d = p.distanceToSquared(new THREE.Vector3(x, y, z));
        if (d < bd && i !== this.centerIndex) {
          bd = d;
          bi = i;
        }
      });
      return bi;
    };
    this.dopants.set(pick(5, 3, -4), 'P');
    this.dopants.set(pick(-6, -2, 5), 'P');
    this.dopants.set(pick(3, -7, 2), 'P');
    this.dopants.set(pick(-4, 6, -6), 'B');
    this.target = {
      position: this.atoms[this.centerIndex].clone(),
      radius: ATOM_R * 1.2,
      approach: new THREE.Vector3(0.5, 0.4, 0.77).normalize(),
    };
  }

  protected cameraKeys(): CameraKey[] {
    const c = this.atoms[this.centerIndex];
    return [
      { t: 0.0, pos: [38, 26, 44], look: [0, 0, 0] },
      { t: 0.3, pos: [-44, 18, 30], look: [0, 0, 0] },
      // Looking down a <110> channel shows the famous hexagonal "honeycomb" tunnels.
      { t: 0.55, pos: [26, 3, 26], look: [0, 0, 0] },
      { t: 0.8, pos: [c.x + 9, c.y + 6, c.z + 11], look: [c.x, c.y, c.z] },
      { t: 1.0, pos: [c.x + 4.5, c.y + 3.2, c.z + 6], look: [c.x, c.y, c.z] },
    ];
  }

  protected build() {
    const s = this.scene;
    s.background = new THREE.Color(0x030506);
    s.environmentIntensity = 0.6;
    s.add(new THREE.HemisphereLight(0xeaf4e4, 0x060806, 0.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(20, 30, 25);
    s.add(key);
    const rim = new THREE.DirectionalLight(0x76b900, 1.8);
    rim.position.set(-25, -5, -20);
    s.add(rim);
    s.add(this.group);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    // Atoms
    this.atomMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.2,
      roughness: 0.3,
      clearcoat: 0.8,
      clearcoatRoughness: 0.3,
    });
    const atoms = new THREE.InstancedMesh(
      new THREE.SphereGeometry(ATOM_R, ...(QUALITY.tier === 'low' ? [14, 10] : [24, 16])),
      this.atomMat,
      this.atoms.length,
    );
    this.atoms.forEach((p, i) => {
      const scale = this.dopants.has(i) ? 1.15 : 1;
      atoms.setMatrixAt(i, m.compose(p, q.identity(), v.setScalar(scale)));
    });
    this.atomMesh = atoms;
    this.applyDoping();
    this.group.add(atoms);
    this.pickables.push(pickInstances(atoms, (i) => this.atomInfo(i)));

    // Bonds: every pair at the nearest-neighbour distance
    const bonds: [THREE.Vector3, THREE.Vector3][] = [];
    const tol = 0.05;
    for (let i = 0; i < this.atoms.length; i++) {
      for (let j = i + 1; j < this.atoms.length; j++) {
        const d = this.atoms[i].distanceTo(this.atoms[j]);
        if (Math.abs(d - BOND_LEN) < tol) bonds.push([this.atoms[i], this.atoms[j]]);
      }
    }
    const bondMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(BOND_R, BOND_R, 1, 10, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x5f6b78, metalness: 0.4, roughness: 0.4 }),
      bonds.length,
    );
    const mids = new Float32Array(bonds.length * 3);
    bonds.forEach(([a, b], i) => {
      const dir = v.subVectors(b, a);
      const len = dir.length();
      q.setFromUnitVectors(up, dir.normalize());
      const mid = a.clone().add(b).multiplyScalar(0.5);
      bondMesh.setMatrixAt(i, m.compose(mid, q, new THREE.Vector3(1, len, 1)));
      mids.set([mid.x, mid.y, mid.z], i * 3);
    });
    this.group.add(bondMesh);
    this.pickables.push(pickInstancedGroup(bondMesh, C.entities.bonds));
    this.buildCarriers();

    this.controls = [
      {
        kind: 'choice',
        label: C.controls.doping,
        options: ['Mixed', 'Intrinsic', 'N-type', 'P-type'],
        value: 'Mixed',
        onChange: (v) => {
          this.doping = v as 'Mixed' | 'Intrinsic' | 'N-type' | 'P-type';
          this.applyDoping();
        },
      },
    ];

    // Shared electron pairs: a soft glow at each bond centre
    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.BufferAttribute(mids, 3));
    this.bondGlow = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 1 }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        uniform float uScale;
        uniform float uTime;
        varying float vPulse;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          vPulse = 0.7 + 0.3 * sin(uTime * 1.5 + position.x * 0.7 + position.y * 0.5);
          gl_PointSize = clamp(1.1 * uScale / -mv.z, 1.0, 90.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vPulse;
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(uv, uv);
          if (r2 > 1.0) discard;
          float a = exp(-r2 * 5.0) * 0.55 * vPulse;
          gl_FragColor = vec4(vec3(0.55, 0.95, 0.3) * a, a);
        }
      `,
    });
    const glow = new THREE.Points(glowGeo, this.bondGlow);
    glow.frustumCulled = false;
    this.group.add(glow);

    // Highlight one conventional unit cell
    const cellGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(A, A, A));
    const cell = new THREE.LineSegments(
      cellGeo,
      new THREE.LineBasicMaterial({ color: 0x9cff3a, transparent: true, opacity: 0.85 }),
    );
    const c0 = (CELLS * A) / 2;
    cell.position.set(A / 2 - c0 + A, A / 2 - c0 + A * 2, A / 2 - c0 + A * 2);
    this.group.add(cell);
  }

  protected animate(t: number, _dt: number, time: number) {
    this.bondGlow.uniforms.uScale.value = pointScale(this.ctx.renderer, this.ctx.camera);
    this.bondGlow.uniforms.uTime.value = time;

    // Free carriers wander around their dopant: electron (P) or hole (B).
    const arr = this.carrierPos.array as Float32Array;
    this.carrierAtoms.forEach((ai, k) => {
      const c = this.atoms[ai];
      const a = time * (0.6 + k * 0.13) + k * 2.1;
      const r = 2.6 + 0.6 * Math.sin(time * 0.7 + k);
      arr[k * 3] = c.x + Math.cos(a) * r;
      arr[k * 3 + 1] = c.y + Math.sin(a * 1.3) * r * 0.6;
      arr[k * 3 + 2] = c.z + Math.sin(a) * r;
    });
    this.carrierPos.needsUpdate = true;
    this.carrierMat.uniforms.uScale.value = pointScale(this.ctx.renderer, this.ctx.camera);

    this.caption = pickByT(t, [0.25, 0.5, 0.75], C.captions);
  }

  /** Recolour atoms for the current doping mode and show the matching free carriers. */
  private applyDoping() {
    const si = new THREE.Color(0x6f7b88);
    const pCol = new THREE.Color(0xf6fff0).multiplyScalar(2.2);
    const bCol = new THREE.Color(0xffb347).multiplyScalar(1.8);
    const centerCol = new THREE.Color(0xb6f06a).multiplyScalar(1.4);
    this.atoms.forEach((_, i) => {
      const dop = this.visibleDopant(i);
      this.atomMesh.setColorAt(i, dop === 'P' ? pCol : dop === 'B' ? bCol : i === this.centerIndex ? centerCol : si);
    });
    if (this.atomMesh.instanceColor) this.atomMesh.instanceColor.needsUpdate = true;
    if (this.carrierMat) {
      this.carrierMat.uniforms.uShowP.value = this.doping === 'N-type' || this.doping === 'Mixed' ? 1 : 0;
      this.carrierMat.uniforms.uShowB.value = this.doping === 'P-type' || this.doping === 'Mixed' ? 1 : 0;
    }
  }

  private visibleDopant(i: number) {
    const d = this.dopants.get(i);
    if (!d || this.doping === 'Intrinsic') return undefined;
    if (this.doping === 'N-type' && d !== 'P') return undefined;
    if (this.doping === 'P-type' && d !== 'B') return undefined;
    return d;
  }

  private atomInfo(i: number) {
    const d = this.visibleDopant(i);
    const p = this.atoms[i];
    const pos = `${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)} Å`;
    if (d === 'P') return C.entities.phosphorus(pos);
    if (d === 'B') return C.entities.boron(pos);
    return C.entities.silicon(pos, i === this.centerIndex);
  }

  /** Point sprites for the donor electrons (filled) and acceptor holes (rings). */
  private buildCarriers() {
    this.carrierAtoms = [...this.dopants.keys()];
    const kinds = new Float32Array(this.carrierAtoms.map((i) => (this.dopants.get(i) === 'P' ? 0 : 1)));
    const geo = new THREE.BufferGeometry();
    this.carrierPos = new THREE.BufferAttribute(new Float32Array(this.carrierAtoms.length * 3), 3);
    geo.setAttribute('position', this.carrierPos);
    geo.setAttribute('aKind', new THREE.BufferAttribute(kinds, 1));
    this.carrierMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 1 }, uShowP: { value: 1 }, uShowB: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aKind;
        uniform float uScale;
        uniform float uShowP;
        uniform float uShowB;
        varying float vKind;
        varying float vShow;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(1.1 * uScale / -mv.z, 2.0, 70.0);
          vKind = aKind;
          vShow = aKind < 0.5 ? uShowP : uShowB;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vKind;
        varying float vShow;
        void main() {
          if (vShow < 0.5) discard;
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float r = length(uv);
          if (r > 1.0) discard;
          // electron: bright core; hole: hollow amber ring
          float a = vKind < 0.5 ? exp(-r * r * 6.0) : smoothstep(0.55, 0.7, r) * (1.0 - smoothstep(0.85, 1.0, r));
          vec3 c = vKind < 0.5 ? vec3(0.75, 1.0, 0.45) : vec3(1.0, 0.7, 0.3);
          gl_FragColor = vec4(c * a * 1.6, a);
        }
      `,
    });
    this.carriers = new THREE.Points(geo, this.carrierMat);
    this.carriers.frustumCulled = false;
    this.group.add(this.carriers);
    this.applyDoping();
  }

  onExploreChange(active: boolean) {
    this.doping = 'Mixed';
    if (active) setControlValue(this.controls[0], 'Mixed');
    this.applyDoping();
  }

  /** Through the crystal from bond to bond, towards the atom we dive into. */
  followPoint(t: number, out: THREE.Vector3) {
    if (!this.followCache) {
      const c = this.atoms[this.centerIndex];
      // Walk the bond network: from an edge atom, greedily step to the neighbour nearest the centre.
      let cur = this.atoms.reduce((best, p) => (p.x + p.y + p.z > best.x + best.y + best.z ? p : best));
      const pts: [number, number, number][] = [[cur.x + 4, cur.y + 4, cur.z + 4]];
      for (let guard = 0; guard < 40 && cur.distanceTo(c) > 0.1; guard++) {
        pts.push([cur.x, cur.y, cur.z]);
        let next = cur;
        let bestD = Infinity;
        for (const a of this.atoms) {
          if (Math.abs(a.distanceTo(cur) - 2.35) > 0.06) continue;
          const d = a.distanceTo(c);
          if (d < bestD) {
            bestD = d;
            next = a;
          }
        }
        if (next === cur) break;
        cur = next;
      }
      pts.push([c.x, c.y, c.z]);
      this.followCache = pts;
    }
    return splineAt(this.followCache, smoothstep(0.06, 0.98, t), out);
  }

  private followCache: [number, number, number][] | null = null;

  getTransitionTarget() {
    return this.target;
  }
}
