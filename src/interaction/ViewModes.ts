import * as THREE from 'three';
import type { Level, LevelControl, ThermalSpec } from '../core/types';

export type ViewMode = 'Normal' | 'X-Ray' | 'Section' | 'Thermal';

const AMBIENT_C = 25;
const THROTTLE_C = 90;

/**
 * Global view modes for Explore, applied on top of whatever level is active:
 *  - X-Ray: every standard-material mesh becomes a Fresnel ghost; the selected object stays solid
 *  - Section: a clipping plane slices the scene, with a glowing cut outline
 *  - Thermal: a lumped heat model (level-provided) drives a thermal-camera palette
 * Materials are swapped, never edited, and always restored before the level is disposed.
 */
export class ViewModes {
  mode: ViewMode = 'Normal';
  section = 0.5;
  private level: Level | null = null;
  private swapped = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private xrayMat = makeShellMaterial('xray');
  private neutralMat = makeShellMaterial('thermal');
  private plane = new THREE.Plane();
  private bounds = new THREE.Box3();
  private normal = new THREE.Vector3(0, 0, 1);
  private cut: THREE.Group | null = null;
  private focus: THREE.Object3D | null = null;
  thermal: ThermalSim | null = null;

  constructor(private renderer: THREE.WebGLRenderer) {
    (this.neutralMat.uniforms.uColor.value as THREE.Color).set(0x161a2e);
  }

  attach(level: Level) {
    this.level = level;
    this.mode = 'Normal';
  }

  /** Must run before the level is disposed: restores its own materials. */
  detach() {
    this.setMode('Normal');
    this.level = null;
  }

  available(): ViewMode[] {
    const modes: ViewMode[] = ['Normal', 'X-Ray', 'Section'];
    if (this.level?.thermal) modes.push('Thermal');
    return modes;
  }

  setMode(mode: ViewMode) {
    this.restore();
    this.renderer.clippingPlanes = [];
    if (this.cut) {
      this.cut.parent?.remove(this.cut);
      disposeTree(this.cut);
      this.cut = null;
    }
    this.thermal?.dispose();
    this.thermal = null;
    this.mode = mode;
    const level = this.level;
    if (!level) return;
    if (mode === 'Normal') {
      level.onViewModeChange?.(mode);
      return;
    }

    level.onViewModeChange?.(mode);
    if (mode === 'X-Ray') this.applyXray();
    else if (mode === 'Section') this.applySection();
    else if (mode === 'Thermal' && level.thermal) {
      this.thermal = new ThermalSim(level.thermal);
      this.thermal.apply(level.scene, (mesh, mat) => this.swap(mesh, mat), this.neutralMat);
    }
  }

  /** In X-Ray the selected object keeps its real material: an instant "isolate". */
  setFocus(object: THREE.Object3D | null) {
    this.focus = object;
    if (this.mode === 'X-Ray') {
      this.restore();
      this.applyXray();
    }
  }

  update(dt: number) {
    if (this.mode === 'Section') this.placePlane();
    this.thermal?.step(dt * 2.5); // time-lapse: heat visibly spreads in a few seconds
  }

  /** Mode-specific controls for the inspector. */
  controls(onModeChange: (m: ViewMode) => void): LevelControl[] {
    const list: LevelControl[] = [
      {
        kind: 'choice',
        label: 'View',
        options: this.available(),
        value: this.mode,
        onChange: (v) => onModeChange(v as ViewMode),
      },
    ];
    if (this.mode === 'Section') {
      list.push({
        kind: 'slider',
        label: 'Cut position',
        min: 0,
        max: 100,
        step: 1,
        value: Math.round(this.section * 100),
        format: (v) => `${Math.round(v)}%`,
        onInput: (v) => (this.section = v / 100),
      });
    }
    if (this.thermal) list.push(...this.thermal.controls());
    return list;
  }

  // ---------------------------------------------------------------- internals
  private swap(mesh: THREE.Mesh, mat: THREE.Material) {
    if (!this.swapped.has(mesh)) this.swapped.set(mesh, mesh.material);
    mesh.material = mat;
  }

  private restore() {
    this.swapped.forEach((orig, mesh) => (mesh.material = orig));
    this.swapped.clear();
  }

  private isUnderFocus(o: THREE.Object3D) {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === this.focus) return true;
    return false;
  }

  private applyXray() {
    this.level?.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible || this.isUnderFocus(mesh)) return;
      const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (
        (m as THREE.MeshStandardMaterial).isMeshStandardMaterial ||
        (m as THREE.MeshBasicMaterial).isMeshBasicMaterial
      ) {
        this.swap(mesh, this.xrayMat);
      }
    });
  }

  private applySection() {
    const level = this.level!;
    this.bounds.makeEmpty();
    level.scene.traverse((o) => {
      if (((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints) && o.visible) this.bounds.expandByObject(o);
    });
    if (this.bounds.isEmpty()) return;
    this.normal.set(...(level.sectionNormal ?? [0, 0, 1])).normalize();
    this.renderer.clippingPlanes = [this.plane];

    // Cut indicator: faint fill + bright outline, sized to the scene.
    const size = this.bounds.getSize(new THREE.Vector3()).length();
    const g = new THREE.Group();
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({
        color: 0x76b900,
        transparent: true,
        opacity: 0.06,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(size, size)),
      new THREE.LineBasicMaterial({ color: 0x9cff3a, transparent: true, opacity: 0.8, toneMapped: false }),
    );
    g.add(quad, edge);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.normal);
    g.renderOrder = 998;
    level.scene.add(g);
    this.cut = g;
    this.placePlane();
  }

  private placePlane() {
    const c = this.bounds.getCenter(new THREE.Vector3());
    const half = this.bounds.getSize(new THREE.Vector3()).multiply(this.normal).length() / 2;
    // section = 1: nothing cut; 0: everything cut. The side the normal points to is removed.
    const p = c.addScaledVector(this.normal, (this.section * 2 - 1) * half * 1.02);
    this.plane.setFromNormalAndCoplanarPoint(this.normal.clone().negate(), p);
    if (this.cut) this.cut.position.copy(p).addScaledVector(this.normal, -half * 0.002);
  }
}

// ------------------------------------------------------------------ thermal model

/**
 * Lumped-capacitance heat network: dT/dt = (P + Σ G·ΔT + G_air·(T_amb − T)) / C.
 * Integrated with small explicit steps. Heat visibly flows from the die outwards.
 */
export class ThermalSim {
  load = 1;
  fan = 1;
  throttle = 1;
  private T = new Map<string, number>();
  private mats = new Map<string, THREE.ShaderMaterial>();

  constructor(private spec: ThermalSpec) {
    for (const n of spec.nodes) {
      this.T.set(n.id, AMBIENT_C);
      this.mats.set(n.id, makeShellMaterial(n.ghost ? 'ghost' : 'thermal'));
    }
  }

  apply(scene: THREE.Scene, swap: (m: THREE.Mesh, mat: THREE.Material) => void, neutral: THREE.Material) {
    const owned = new Set<THREE.Object3D>();
    for (const n of this.spec.nodes) {
      const mat = this.mats.get(n.id)!;
      for (const obj of n.objects) {
        obj.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            swap(o as THREE.Mesh, mat);
            owned.add(o);
          }
        });
      }
    }
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.visible && !owned.has(mesh) && !(mesh.material as THREE.Material).transparent)
        swap(mesh, neutral);
    });
    this.paint();
  }

  temp(id: string) {
    return this.T.get(id) ?? AMBIENT_C;
  }

  private power(n: ThermalSpec['nodes'][number]) {
    const p = (n.power ?? 0) * this.load;
    return n.id === this.spec.throttleNode ? p * this.throttle : p;
  }

  step(dt: number) {
    const steps = Math.min(60, Math.ceil(dt / 0.004));
    const h = dt / steps;
    const byId = new Map(this.spec.nodes.map((n) => [n.id, n]));
    const flow = new Map<string, number>();
    for (let s = 0; s < steps; s++) {
      for (const n of this.spec.nodes) {
        const t = this.T.get(n.id)!;
        const air = (n.toAir ?? 0) * (n.fanCooled ? 0.12 + 0.88 * this.fan : 1);
        flow.set(n.id, this.power(n) + air * (AMBIENT_C - t));
      }
      for (const [a, b, g] of this.spec.links) {
        const q = g * (this.T.get(b)! - this.T.get(a)!);
        flow.set(a, flow.get(a)! + q);
        flow.set(b, flow.get(b)! - q);
      }
      for (const n of this.spec.nodes) {
        this.T.set(n.id, this.T.get(n.id)! + (flow.get(n.id)! / byId.get(n.id)!.capacity) * h);
      }
    }
    // Throttling: the GPU sheds clocks (power) above 90 °C and recovers slowly.
    const tn = this.spec.throttleNode;
    if (tn) {
      const t = this.T.get(tn)!;
      this.throttle =
        t > THROTTLE_C ? Math.max(0.35, this.throttle - dt * 0.6) : Math.min(1, this.throttle + dt * 0.15);
    }
    this.paint();
  }

  private paint() {
    for (const n of this.spec.nodes) {
      const c = this.mats.get(n.id)!.uniforms.uColor.value as THREE.Color;
      thermalColor(this.T.get(n.id)!, c);
    }
  }

  totalPower() {
    return this.spec.nodes.reduce((s, n) => s + this.power(n), 0);
  }

  controls(): LevelControl[] {
    const list: LevelControl[] = [
      {
        kind: 'slider',
        label: 'GPU load',
        min: 0,
        max: 100,
        step: 1,
        value: Math.round(this.load * 100),
        format: (v) => `${Math.round(v)}%`,
        onInput: (v) => (this.load = v / 100),
      },
    ];
    if (this.spec.nodes.some((n) => n.fanCooled)) {
      list.push({
        kind: 'choice',
        label: 'Fans',
        options: ['Stop', 'Idle', 'Load'],
        value: this.fan > 0.7 ? 'Load' : this.fan > 0.2 ? 'Idle' : 'Stop',
        onChange: (v) => (this.fan = v === 'Stop' ? 0 : v === 'Idle' ? 0.45 : 1),
      });
    }
    list.push({ kind: 'readout', label: 'Board power', get: () => `${Math.round(this.totalPower())} W` });
    for (const n of this.spec.nodes) {
      if (n.readout) list.push({ kind: 'readout', label: n.label, get: () => `${this.temp(n.id).toFixed(0)} °C` });
    }
    if (this.spec.throttleNode) {
      const tn = this.spec.throttleNode;
      const pTn = this.spec.nodes.find((n) => n.id === tn)?.power ?? 0;
      list.push({
        kind: 'readout',
        label: 'Hotspot (est.)',
        get: () => `${(this.temp(tn) + 0.025 * pTn * this.load * this.throttle).toFixed(0)} °C`,
      });
      list.push({
        kind: 'readout',
        label: 'Clocks',
        get: () => (this.throttle < 0.98 ? `THROTTLING ${Math.round(this.throttle * 100)}%` : 'full boost'),
      });
    }
    list.push({ kind: 'readout', label: 'Model', get: () => 'illustrative, not measured' });
    return list;
  }

  dispose() {
    this.mats.forEach((m) => m.dispose());
  }
}

/** Thermal-camera palette ("ironbow"): indigo → magenta → orange → pale yellow. */
const STOPS: [number, number][] = [
  [25, 0x0d0a3a],
  [33, 0x3a1294],
  [42, 0x8a1a9e],
  [52, 0xd0206a],
  [62, 0xf04a22],
  [72, 0xff8a14],
  [82, 0xffc52e],
  [92, 0xfff3a0],
  [105, 0xffffff],
];
const _a = new THREE.Color();
const _b = new THREE.Color();
export function thermalColor(t: number, out: THREE.Color) {
  if (t <= STOPS[0][0]) return out.setHex(STOPS[0][1]);
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const k = (t - STOPS[i - 1][0]) / (STOPS[i][0] - STOPS[i - 1][0]);
      return out.copy(_a.setHex(STOPS[i - 1][1])).lerp(_b.setHex(STOPS[i][1]), k);
    }
  }
  return out.setHex(STOPS[STOPS.length - 1][1]);
}

// ------------------------------------------------------------------ materials

/**
 * One shader for both looks, instancing-aware via three's chunks:
 *  xray    — additive Fresnel ghost (edges bright, faces nearly invisible)
 *  thermal — solid, flat palette colour with gentle shape shading
 */
function makeShellMaterial(kind: 'xray' | 'thermal' | 'ghost') {
  const xray = kind === 'xray';
  const see = kind !== 'thermal';
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(xray ? 0x9cff3a : 0xffffff) } },
    transparent: see,
    depthWrite: !see,
    blending: xray ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: see ? THREE.DoubleSide : THREE.FrontSide,
    clipping: true,
    vertexShader: /* glsl */ `
      #include <common>
      #include <clipping_planes_pars_vertex>
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        #include <beginnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <project_vertex>
        #include <clipping_planes_vertex>
        vN = normalize(transformedNormal);
        vV = -mvPosition.xyz;
      }
    `,
    fragmentShader: see
      ? /* glsl */ `
      #include <clipping_planes_pars_fragment>
      uniform vec3 uColor;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        #include <clipping_planes_fragment>
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        ${xray ? 'float a = pow(f, 2.2) * 0.85 + 0.035;' : 'float a = pow(f, 2.0) * 0.55 + 0.1;'}
        gl_FragColor = vec4(uColor * ${xray ? 'a' : '1.0'}, a);
      }`
      : /* glsl */ `
      #include <clipping_planes_pars_fragment>
      uniform vec3 uColor;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        #include <clipping_planes_fragment>
        float ndv = abs(dot(normalize(vN), normalize(vV)));
        vec3 c = uColor * (0.55 + 0.45 * ndv);
        // hot parts glow a little (bloom picks it up)
        float heat = max(max(uColor.r, uColor.g), uColor.b);
        gl_FragColor = vec4(c * (1.0 + 0.6 * smoothstep(0.85, 1.0, uColor.g)) * mix(1.0, 1.15, heat), 1.0);
      }`,
  });
}

function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    m.geometry?.dispose();
    (m.material as THREE.Material | undefined)?.dispose?.();
  });
}
