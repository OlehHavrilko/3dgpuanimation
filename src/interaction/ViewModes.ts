import * as THREE from 'three';
import type { Level, LevelControl, ThermalSpec } from '../core/types';
import { content } from '../content';
import type { SectionStack } from '../core/sectionStack';

const T = content.ui;

export type ViewMode = 'Normal' | 'X-Ray' | 'Section' | 'Thermal';

const AMBIENT_C = 25;
const THROTTLE_C = 90;

/**
 * Global view modes for Explore, applied on top of whatever level is active:
 *  - X-Ray: every standard-material mesh becomes a Fresnel ghost; the selected object stays solid
 *  - Section: a clipping plane slices the scene; cut solids show a filled, hatched face in their
 *    own material colour (layer by layer: copper reads as copper, laminate as laminate)
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
  private caps = new SectionCaps();
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
    this.caps.clear();
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
        label: T.views.view,
        options: this.available(),
        value: this.mode,
        onChange: (v) => onModeChange(v as ViewMode),
      },
    ];
    if (this.mode === 'Section') {
      list.push({
        kind: 'slider',
        label: T.views.cut,
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
        opacity: 0.02,
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
    this.caps.build(level.scene, size);
    this.placePlane();
  }

  private placePlane() {
    const c = this.bounds.getCenter(new THREE.Vector3());
    const half = this.bounds.getSize(new THREE.Vector3()).multiply(this.normal).length() / 2;
    // section = 1: nothing cut; 0: everything cut. The side the normal points to is removed.
    const p = c.addScaledVector(this.normal, (this.section * 2 - 1) * half * 1.02);
    this.plane.setFromNormalAndCoplanarPoint(this.normal.clone().negate(), p);
    if (this.cut) this.cut.position.copy(p).addScaledVector(this.normal, -half * 0.002);
    this.caps.setPlane(this.normal, p);
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
        label: T.thermal.load,
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
        label: T.thermal.fans,
        options: ['Stop', 'Idle', 'Load'],
        value: this.fan > 0.7 ? 'Load' : this.fan > 0.2 ? 'Idle' : 'Stop',
        onChange: (v) => (this.fan = v === 'Stop' ? 0 : v === 'Idle' ? 0.45 : 1),
      });
    }
    list.push({ kind: 'readout', label: T.thermal.boardPower, get: () => `${Math.round(this.totalPower())} W` });
    for (const n of this.spec.nodes) {
      if (n.readout) list.push({ kind: 'readout', label: n.label, get: () => `${this.temp(n.id).toFixed(0)} °C` });
    }
    if (this.spec.throttleNode) {
      const tn = this.spec.throttleNode;
      const pTn = this.spec.nodes.find((n) => n.id === tn)?.power ?? 0;
      list.push({
        kind: 'readout',
        label: T.thermal.hotspot,
        get: () => `${(this.temp(tn) + 0.025 * pTn * this.load * this.throttle).toFixed(0)} °C`,
      });
      list.push({
        kind: 'readout',
        label: T.thermal.clocks,
        get: () => (this.throttle < 0.98 ? T.thermal.throttling(Math.round(this.throttle * 100)) : T.thermal.fullBoost),
      });
    }
    list.push({ kind: 'readout', label: T.thermal.model, get: () => T.thermal.illustrative });
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

// ------------------------------------------------------------------ section caps

/**
 * Filled cut faces without a stencil buffer. Every opaque mesh gets a twin that draws only its
 * back faces, unlit, in the mesh's own colour with a hatch laid out in the cut plane. Where the
 * clipping plane opens a closed solid, the eye looks into the solid and sees those back faces:
 * the cut reads as a filled cross-section. Where nothing is cut, the front faces hide the twin.
 * Twins share the original geometry (and instance matrices) and are drawn after it, so a
 * double-sided original never z-fights them.
 */
class SectionCaps {
  private twins: THREE.Mesh[] = [];
  private materials = new Map<string, THREE.ShaderMaterial>();
  /** Shared by every cap material: one update moves the hatch for all of them. */
  private shared = {
    uOrigin: { value: new THREE.Vector3() },
    uNormal: { value: new THREE.Vector3(0, 0, 1) },
    uAxisU: { value: new THREE.Vector3(1, 0, 0) },
    uAxisV: { value: new THREE.Vector3(0, 1, 0) },
    uPitch: { value: 1 },
  };

  build(scene: THREE.Object3D, size: number) {
    this.clear();
    // About 70 hatch lines across the scene, whatever its units.
    this.shared.uPitch.value = size / 70;
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.visible && !m.userData.sectionCap) meshes.push(m);
    });
    for (const mesh of meshes) {
      const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material & {
        color?: THREE.Color;
        uniforms?: Record<string, THREE.IUniform>;
      };
      if (!mat || (mat.transparent && mat.opacity < 0.6) || mat.blending === THREE.AdditiveBlending) continue;
      if (mat.side === THREE.BackSide || OPEN_GEOMETRY.has(mesh.geometry.type)) continue;
      const color = mat.color ?? (mat.uniforms?.uColor?.value as THREE.Color | undefined) ?? FALLBACK_CAP;
      const stack = mesh.userData.section as SectionStack | undefined;
      const capMat = stack ? this.layered(color, stack) : this.material(color);
      const inst = mesh as THREE.InstancedMesh;
      let twin: THREE.Mesh;
      if (inst.isInstancedMesh) {
        const t = new THREE.InstancedMesh(inst.geometry, capMat, inst.count);
        t.instanceMatrix = inst.instanceMatrix;
        twin = t;
      } else {
        twin = new THREE.Mesh(mesh.geometry, capMat);
      }
      twin.userData.sectionCap = true;
      twin.frustumCulled = false;
      twin.renderOrder = mesh.renderOrder + 1;
      twin.raycast = () => {};
      mesh.add(twin);
      this.twins.push(twin);
    }
  }

  setPlane(normal: THREE.Vector3, point: THREE.Vector3) {
    this.shared.uOrigin.value.copy(point);
    this.shared.uNormal.value.copy(normal);
    const u = this.shared.uAxisU.value;
    u.set(0, 1, 0);
    if (Math.abs(normal.dot(u)) > 0.9) u.set(1, 0, 0);
    u.cross(normal).normalize();
    this.shared.uAxisV.value.crossVectors(normal, u).normalize();
  }

  clear() {
    for (const t of this.twins) t.removeFromParent();
    this.twins = [];
    this.materials.forEach((m) => m.dispose());
    this.materials.clear();
  }

  /** Parts with an inner structure (a multilayer board) get their own material. */
  private layered(color: THREE.Color, stack: SectionStack) {
    const m = makeCapMaterial(color, this.shared, stack);
    this.materials.set(`layers-${this.materials.size}`, m);
    return m;
  }

  private material(color: THREE.Color) {
    const key = color.getHexString();
    let m = this.materials.get(key);
    if (!m) {
      m = makeCapMaterial(color, this.shared);
      this.materials.set(key, m);
    }
    return m;
  }
}

const FALLBACK_CAP = new THREE.Color(0x8a8f96);
/** Surfaces without a volume: there is nothing inside them to show as a cut. */
const OPEN_GEOMETRY = new Set(['PlaneGeometry', 'ShapeGeometry', 'CircleGeometry', 'RingGeometry']);

const MAX_LAYERS = 32;

function makeCapMaterial(color: THREE.Color, shared: Record<string, THREE.IUniform>, stack?: SectionStack) {
  const edges = new Array<number>(MAX_LAYERS).fill(0);
  const colors = Array.from({ length: MAX_LAYERS }, () => new THREE.Color());
  const n = Math.min(stack?.layers.length ?? 0, MAX_LAYERS);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += stack!.layers[i].thickness;
    edges[i] = acc;
    colors[i].set(stack!.layers[i].color);
  }
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uColor: { value: color.clone() },
      uLayerAxis: { value: new THREE.Vector3(...(stack?.axis ?? [0, 1, 0])) },
      uLayerStart: { value: stack?.start ?? 0 },
      uLayerEdge: { value: edges },
      uLayerColor: { value: colors },
    },
    defines: { LAYERS: n },
    side: THREE.BackSide,
    clipping: true,
    vertexShader: /* glsl */ `
      #include <common>
      #include <clipping_planes_pars_vertex>
      varying vec3 vWorld;
      varying vec3 vLocal;
      varying vec3 vCamLocal;
      void main() {
        #include <begin_vertex>
        vLocal = transformed;
        #include <project_vertex>
        #include <clipping_planes_vertex>
        mat4 toWorld = modelMatrix;
        #ifdef USE_INSTANCING
          toWorld = modelMatrix * instanceMatrix;
        #endif
        vWorld = (toWorld * vec4(transformed, 1.0)).xyz;
        vCamLocal = (inverse(toWorld) * vec4(cameraPosition, 1.0)).xyz;
      }
    `,
    fragmentShader: /* glsl */ `
      #include <clipping_planes_pars_fragment>
      uniform vec3 uColor;
      uniform vec3 uOrigin;
      uniform vec3 uAxisU;
      uniform vec3 uAxisV;
      uniform float uPitch;
      uniform vec3 uNormal;
      uniform vec3 uLayerAxis;
      uniform float uLayerStart;
      uniform float uLayerEdge[${MAX_LAYERS}];
      uniform vec3 uLayerColor[${MAX_LAYERS}];
      varying vec3 vWorld;
      varying vec3 vLocal;
      varying vec3 vCamLocal;

      vec3 baseColor(vec3 local) {
        #if LAYERS > 0
          float h = dot(local, uLayerAxis) - uLayerStart;
          for (int i = 0; i < LAYERS; i++) {
            if (h <= uLayerEdge[i]) return uLayerColor[i];
          }
          return uLayerColor[LAYERS - 1];
        #else
          return uColor;
        #endif
      }

      void main() {
        #include <clipping_planes_fragment>
        // The back face we are drawing lies somewhere inside the solid; what the eye should see
        // is the solid where the view ray crosses the cut plane. Same ray, in world and local
        // space (the map between them is affine, so the ray parameter is shared).
        vec3 ray = vWorld - cameraPosition;
        float denom = dot(ray, uNormal);
        float t = abs(denom) > 1e-6 ? clamp(dot(uOrigin - cameraPosition, uNormal) / denom, 0.0, 1.0) : 1.0;
        vec3 onPlane = cameraPosition + ray * t;
        vec3 local = vCamLocal + (vLocal - vCamLocal) * t;
        // Engineering-drawing hatch at 45 degrees, in the plane of the cut.
        vec3 d = onPlane - uOrigin;
        float s = (dot(d, uAxisU) + dot(d, uAxisV)) / uPitch;
        float w = fwidth(s);
        float dist = 0.5 - abs(fract(s) - 0.5); // 0 on a line, 0.5 between two
        float line = 1.0 - smoothstep(0.09, 0.09 + w * 1.5, dist);
        vec3 c = baseColor(local) * 0.85 + 0.03;
        // A layered part already reads as a section: keep its hatch faint.
        gl_FragColor = vec4(mix(c, c * 0.45, line * (LAYERS > 0 ? 0.25 : 0.6)), 1.0);
      }
    `,
  });
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
