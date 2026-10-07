import * as THREE from 'three';
import { BaseLevel, setControlValue } from '../core/BaseLevel';
import { entry, type CameraKey } from '../core/CameraRig';
import type { LevelMeta, TransitionTarget } from '../core/types';
import { mulberry32, pickByT, smoothstep } from '../core/math';
import { content } from '../content';
import { pointScale } from '../core/points';
import { boxFrom, pickObject } from '../interaction/pick';
import { nucleonJitter, nucleusLayout, nucleusSpin, NUCLEON_R } from './nucleus/cluster';
import { ATOM_END_DIST, NUCLEUS_APPROACH } from './nucleus/seam';

/**
 * Level 8 — a single silicon atom. Units: stylised (~5 pm per unit).
 * Electron density is sampled from hydrogen-like orbitals with Clementi-Raimondi
 * effective nuclear charges, then radially compressed (r^0.62) so 1s and 3p fit one frame.
 */
const C = content.levels.atom;

export const meta: LevelMeta = {
  ...C.meta,
  unitMeters: 5e-12,
  weight: 1.1,
};

interface Shell {
  n: number;
  l: number;
  zeff: number;
  electrons: number;
  /** Real p-orbital axes to populate (empty for s). */
  axes: THREE.Vector3[];
  color: number;
  /** Sprite count and per-sprite opacity: inner shells are tiny and dense, so they get fewer, fainter points. */
  points: number;
  alpha: number;
}

const SHELLS: Shell[] = [
  { n: 1, l: 0, zeff: 13.575, electrons: 2, axes: [], color: 0xffffff, points: 4000, alpha: 0.16 },
  { n: 2, l: 0, zeff: 9.02, electrons: 2, axes: [], color: 0xe4ffd2, points: 6000, alpha: 0.12 },
  {
    n: 2,
    l: 1,
    zeff: 9.945,
    electrons: 6,
    axes: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
    color: 0xb4ec6a,
    points: 14000,
    alpha: 0.07,
  },
  { n: 3, l: 0, zeff: 4.903, electrons: 2, axes: [], color: 0x8fdc2a, points: 22000, alpha: 0.32 },
  // Hund's rule: the two 3p electrons sit in different orbitals (px, py) -> visible lobes.
  {
    n: 3,
    l: 1,
    zeff: 4.285,
    electrons: 2,
    axes: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)],
    color: 0x5fd0a0,
    points: 40000,
    alpha: 0.55,
  },
];

const RADIAL_K = 12.4; // display units per a0^0.62
const RADIAL_EXP = 0.62;
/** Radius of the drawn nucleus cluster. */
const NUCLEUS_R = 1.4;

export class AtomLevel extends BaseLevel {
  readonly meta = meta;
  private cloudMat!: THREE.ShaderMaterial;
  private nucleus!: THREE.InstancedMesh;
  private nucleonBase: THREE.Vector3[] = [];
  private nucleusGroup = new THREE.Group();
  /** Mean display radius per shell (for picking + brackets). */
  private shellR: number[] = [];
  /** Orbital visibility: current (animated) and target per shell. */
  private show = [1, 1, 1, 1, 1];
  private showTarget = [1, 1, 1, 1, 1];
  private m = new THREE.Matrix4();
  private target: TransitionTarget = {
    position: new THREE.Vector3(),
    radius: NUCLEUS_R,
    approach: NUCLEUS_APPROACH.clone(),
  };
  private jitter = new THREE.Vector3();
  /** Light at the nucleus: scaled with it while it shrinks, so the nucleons stay lit the same. */
  private core!: THREE.PointLight;
  private spinScale = 1;

  constructor(ctx: ConstructorParameters<typeof BaseLevel>[0]) {
    super(ctx);
    this.near = 0.05;
    this.far = 2000;
    this.bloom = 1.25;
    this.bokeh = 0.8;
    this.sectionNormal = [0, 0, 1];
    this.followCaption = C.follow;
  }

  protected cameraKeys(): CameraKey[] {
    return [
      ...entry({ t: 0, pos: [0, 34, 130], look: [0, 0, 0] }, 0.68),
      { t: 0.3, pos: [70, 26, 78], look: [0, 0, 0] },
      { t: 0.6, pos: [30, 48, 30], look: [0, 0, 0] },
      { t: 0.85, pos: [9, 4, 14], look: [0, 0, 0] },
      { t: 1.0, pos: [3.6, 1.6, 4.6], look: [0, 0, 0] },
    ];
  }

  protected build() {
    this.scene.background = new THREE.Color(0x020405);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.15));
    this.core = new THREE.PointLight(0xe8ffd8, 40, 30, 2);
    this.scene.add(this.core);
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(5, 8, 6);
    this.scene.add(key);

    this.buildNucleus();
    this.buildCloud();
    // The dive moves the camera after update(), so the shrink is applied at render time.
    this.scene.onBeforeRender = (_r, _s, camera) => this.applyRealSize(camera);
  }

  /** 1 = drawn ~10⁴× too large; falls with the camera distance during the dive, to true size. */
  private realSize(camera: THREE.Camera) {
    if (this.ctx.view.freeCamera) return 1;
    return Math.min(1, camera.position.length() / ATOM_END_DIST);
  }

  /**
   * Diving in, the nucleus shrinks back to its real size as fast as the camera closes in: it holds
   * its size on screen while the cloud thins out around it, and reaches the next scale true to
   * scale. The light at its centre scales with it, so the nucleons stay lit the same.
   */
  private applyRealSize(camera: THREE.Camera) {
    const real = this.realSize(camera);
    this.nucleusGroup.scale.setScalar(this.spinScale * real);
    this.nucleusGroup.updateMatrixWorld(true);
    this.core.intensity = 40 * real * real;
    this.core.distance = 30 * real;
    this.cloudMat.uniforms.uFade.value = smoothstep(0.12, 0.7, real);
  }

  private buildNucleus() {
    const { positions: pts, proton: isProton } = nucleusLayout();
    this.nucleonBase = pts;

    const geo = new THREE.SphereGeometry(NUCLEON_R, 28, 20);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.25,
      emissive: 0x1a2a10,
    });
    this.nucleus = new THREE.InstancedMesh(geo, mat, pts.length);
    const proton = new THREE.Color(0xfff6ea);
    const neutron = new THREE.Color(0x5f9a12);
    pts.forEach((_, i) => this.nucleus.setColorAt(i, isProton[i] ? proton : neutron));
    pts.forEach((p, i) => this.nucleus.setMatrixAt(i, this.m.makeTranslation(p.x, p.y, p.z)));
    this.nucleus.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.nucleusGroup.add(this.nucleus);
    this.scene.add(this.nucleusGroup);
    this.pickables.push(pickObject(this.nucleusGroup, C.entities.nucleus, 2));
  }

  private buildCloud() {
    const rng = mulberry32(14);
    const total = SHELLS.reduce((s, sh) => s + sh.points, 0);
    const positions = new Float32Array(total * 3);
    const shellIdx = new Float32Array(total);
    const alpha = new Float32Array(total);
    const rand = new Float32Array(total);
    const colors = new Float32Array(total * 3);
    let k = 0;
    const dir = new THREE.Vector3();
    const c = new THREE.Color();

    const radSum = SHELLS.map(() => 0);
    SHELLS.forEach((sh, si) => {
      const n = sh.points;
      const sampleR = radialSampler(sh.n, sh.l, sh.zeff);
      c.set(sh.color);
      for (let i = 0; i < n; i++) {
        const r = sampleR(rng());
        if (sh.l === 0) {
          randomUnit(dir, rng);
        } else {
          // |Y_1m|^2 ∝ cos^2 to the orbital axis -> rejection sample.
          const axis = sh.axes[i % sh.axes.length];
          do randomUnit(dir, rng);
          while (rng() > dir.dot(axis) ** 2);
        }
        const rd = RADIAL_K * Math.pow(r, RADIAL_EXP);
        radSum[si] += rd;
        positions[k * 3] = dir.x * rd;
        positions[k * 3 + 1] = dir.y * rd;
        positions[k * 3 + 2] = dir.z * rd;
        shellIdx[k] = si;
        alpha[k] = sh.alpha;
        rand[k] = rng();
        colors[k * 3] = c.r;
        colors[k * 3 + 1] = c.g;
        colors[k * 3 + 2] = c.b;
        k++;
      }
    });

    this.shellR = radSum.map((sum, si) => sum / SHELLS[si].points);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aShell', new THREE.BufferAttribute(shellIdx, 1));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.cloudMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      clipping: true, // Section view slices the cloud open
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 0.32 },
        uScale: { value: 1 },
        uShow: { value: this.show },
        uFade: { value: 1 },
      },
      vertexShader: /* glsl */ `
        #include <clipping_planes_pars_vertex>
        attribute float aShell;
        attribute float aRand;
        attribute float aAlpha;
        uniform float uShow[5];
        uniform float uTime;
        uniform float uSize;
        uniform float uScale;
        uniform float uFade;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          // Slow breathing pulse travelling outward through the shells.
          float pulse = sin(uTime * 0.9 - aShell * 0.9);
          vec3 p = position * (1.0 + 0.025 * pulse);
          // Tiny per-point shimmer so the cloud never looks frozen.
          p += 0.15 * vec3(sin(uTime * 1.7 + aRand * 40.0), cos(uTime * 1.3 + aRand * 31.0), sin(uTime * 1.1 + aRand * 17.0));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vec4 mvPosition = mv;
          #include <clipping_planes_vertex>
          float dist = -mv.z;
          gl_Position = projectionMatrix * mv;
          gl_PointSize = min(uSize * uScale * (0.6 + aRand * 0.8) / dist, 48.0);
          vColor = color * (0.75 + 0.35 * pulse);
          // Fade points that get too close to the lens.
          vAlpha = smoothstep(0.8, 6.0, dist) * aAlpha * uShow[int(aShell + 0.5)] * uFade;
        }
      `,
      fragmentShader: /* glsl */ `
        #include <clipping_planes_pars_fragment>
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          #include <clipping_planes_fragment>
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(uv, uv);
          if (r2 > 1.0) discard;
          float a = exp(-r2 * 3.5) * vAlpha;
          gl_FragColor = vec4(vColor * a, a);
        }
      `,
    });
    const cloud = new THREE.Points(geo, this.cloudMat);
    cloud.frustumCulled = false;
    this.scene.add(cloud);

    // Invisible proxy so the cloud can be hovered: the shell is picked from how close the ray
    // passes to the nucleus.
    const outer = Math.max(...this.shellR) * 1.6;
    const proxy = new THREE.Mesh(new THREE.SphereGeometry(outer, 16, 12), new THREE.MeshBasicMaterial());
    proxy.visible = false;
    this.scene.add(proxy);
    this.pickables.push({
      object: proxy,
      resolve: (hit) => {
        const ray = new THREE.Ray(
          this.ctx.camera.position.clone(),
          hit.point.clone().sub(this.ctx.camera.position).normalize(),
        );
        const d = Math.sqrt(ray.distanceSqToPoint(new THREE.Vector3()));
        const n = d < (this.shellR[0] + this.shellR[1]) / 2 ? 1 : d < (this.shellR[2] + this.shellR[3]) / 2 ? 2 : 3;
        const r = n === 1 ? this.shellR[0] : n === 2 ? this.shellR[2] : this.shellR[4];
        return { key: `shell${n}`, info: C.entities.shells[n], box: boxFrom(-r, -r, -r, r, r, r) };
      },
    });

    this.controls = [
      {
        kind: 'choice',
        label: C.controls.orbitals,
        options: ['All', '1s', '2s', '2p', '3s', '3p'],
        value: 'All',
        onChange: (v) => {
          const k = ['1s', '2s', '2p', '3s', '3p'].indexOf(v);
          this.showTarget = this.showTarget.map((_, i) => (k < 0 || i === k ? 1 : 0));
        },
      },
    ];
  }

  protected animate(t: number, dt: number, time: number) {
    this.cloudMat.uniforms.uTime.value = time;
    for (let i = 0; i < 5; i++) this.show[i] += (this.showTarget[i] - this.show[i]) * Math.min(1, dt * 5);
    this.cloudMat.uniforms.uScale.value = pointScale(this.ctx.renderer, this.ctx.camera);

    // Nucleons jitter (zero-point motion, purely decorative); the next scale moves them the same way.
    for (let i = 0; i < this.nucleonBase.length; i++) {
      const p = nucleonJitter(i, time, this.jitter).add(this.nucleonBase[i]);
      this.nucleus.setMatrixAt(i, this.m.makeTranslation(p.x, p.y, p.z));
    }
    this.nucleus.instanceMatrix.needsUpdate = true;
    const spin = nucleusSpin(time);
    this.nucleusGroup.rotation.y = spin.angle;
    this.spinScale = spin.scale;

    this.caption = pickByT(t, [0.25, 0.5, 0.78], C.captions);
  }

  onExploreChange(active: boolean) {
    if (!active) this.showTarget = [1, 1, 1, 1, 1];
    else setControlValue(this.controls[0], 'All');
  }

  /** Spirals in and settles into a 3p lobe: a cloud, not a dot. */
  followPoint(t: number, out: THREE.Vector3) {
    const u = smoothstep(0.02, 0.9, t);
    const r = 90 * (1 - u) + 24 * u;
    const a = u * Math.PI * 6;
    // Settle onto the +x lobe of the 3p orbital
    return out.set(r * Math.cos(a), r * 0.3 * Math.sin(a * 0.7) * (1 - u), r * Math.sin(a) * (1 - u * 0.85));
  }

  getTransitionTarget() {
    this.target.radius = NUCLEUS_R * this.realSize(this.ctx.camera);
    return this.target;
  }
}

function randomUnit(out: THREE.Vector3, rng: () => number) {
  const z = rng() * 2 - 1;
  const a = rng() * Math.PI * 2;
  const s = Math.sqrt(1 - z * z);
  return out.set(Math.cos(a) * s, Math.sin(a) * s, z);
}

/** Inverse-CDF sampler for the hydrogen-like radial distribution r² R_nl(r)² (r in Bohr radii). */
function radialSampler(n: number, l: number, z: number) {
  const R = (r: number) => {
    const rho = (2 * z * r) / n;
    const e = Math.exp(-rho / 2);
    if (n === 1) return e;
    if (n === 2) return l === 0 ? (2 - rho) * e : rho * e;
    return l === 0 ? (6 - 6 * rho + rho * rho) * e : rho * (4 - rho) * e;
  };
  const bins = 2048;
  const rMax = ((n * n) / z) * 6;
  const cdf = new Float64Array(bins + 1);
  for (let i = 1; i <= bins; i++) {
    const r = (i / bins) * rMax;
    const v = R(r);
    cdf[i] = cdf[i - 1] + r * r * v * v;
  }
  const total = cdf[bins];
  return (u: number) => {
    const target = u * total;
    let lo = 0;
    let hi = bins;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const prev = cdf[Math.max(0, lo - 1)];
    const frac = (target - prev) / Math.max(cdf[lo] - prev, 1e-12);
    return ((Math.max(0, lo - 1) + frac) / bins) * rMax;
  };
}
