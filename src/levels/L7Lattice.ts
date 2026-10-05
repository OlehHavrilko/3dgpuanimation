import * as THREE from 'three';
import { BaseLevel } from '../core/BaseLevel';
import type { CameraKey } from '../core/CameraRig';
import type { LevelMeta, TransitionTarget } from '../core/types';
import { pointScale } from '../core/points';

/**
 * Level 7 — crystalline silicon. Units: ångström.
 * Diamond cubic = FCC lattice + a second FCC offset by (¼,¼,¼)a, a = 5.431 Å.
 * Bonds are found from geometry (nearest-neighbour distance a·√3/4 ≈ 2.35 Å).
 */
export const meta: LevelMeta = {
  name: 'Silicon lattice',
  scale: '2 nm',
  description: 'Inside the fin: a diamond-cubic crystal, every atom bonded to four neighbours.',
  unitMeters: 1e-10,
  weight: 1,
};

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
    const atoms = new THREE.InstancedMesh(new THREE.SphereGeometry(ATOM_R, 24, 16), this.atomMat, this.atoms.length);
    const si = new THREE.Color(0x6f7b88);
    const pCol = new THREE.Color(0xf6fff0).multiplyScalar(2.2);
    const bCol = new THREE.Color(0xffb347).multiplyScalar(1.8);
    const centerCol = new THREE.Color(0xb6f06a).multiplyScalar(1.4);
    this.atoms.forEach((p, i) => {
      const dop = this.dopants.get(i);
      const scale = dop ? 1.15 : 1;
      atoms.setMatrixAt(i, m.compose(p, q.identity(), v.setScalar(scale)));
      atoms.setColorAt(i, dop === 'P' ? pCol : dop === 'B' ? bCol : i === this.centerIndex ? centerCol : si);
    });
    this.group.add(atoms);

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

    this.caption =
      t < 0.25
        ? 'Diamond-cubic Si · a = 5.431 Å (green box = one unit cell, 8 atoms)'
        : t < 0.5
          ? '4 covalent bonds per atom · 2.35 Å · 109.5° — glow = shared electron pairs'
          : t < 0.75
            ? 'Dopants: phosphorus (white) donates an electron · boron (amber) leaves a hole'
            : '5 × 10²² atoms per cm³ — zooming into one of them';
  }

  getTransitionTarget() {
    return this.target;
  }
}
