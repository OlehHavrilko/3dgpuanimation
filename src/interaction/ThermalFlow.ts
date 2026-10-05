import * as THREE from 'three';
import type { ThermalSpec } from '../core/types';
import type { ThermalSim } from './ViewModes';

const PER_LINK = 22;
const PER_INLET = 700;
const AMBIENT_C = 25;
const _box = new THREE.Box3();
const _c = new THREE.Color();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _ctrl = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const HEAT_LOW = new THREE.Color(1.0, 0.42, 0.1);
const HEAT_HIGH = new THREE.Color(1.0, 0.9, 0.55);
const AIR_IN = new THREE.Color(0.3, 0.7, 1.0);
const AIR_WARM = new THREE.Color(1.0, 0.62, 0.18);
const AIR_HOT = new THREE.Color(1.0, 0.25, 0.12);

/**
 * Where the heat goes, drawn over the Thermal view:
 *  - conduction: sparks travel along every link of the heat network from the hotter part to
 *    the cooler one; how many are lit follows the heat flow in watts, colour the temperature
 *  - forced air (if the level has fans): air pulled in over each fan, swirled, pushed down
 *    through the fin stack and out, picking up the fins' temperature on the way
 * Purely a view of ThermalSim's state; it never feeds back into the model.
 */
export class ThermalFlow {
  readonly group = new THREE.Group();
  private centres = new Map<string, THREE.Vector3>();
  private refresh = 0;
  private links: { a: string; b: string; g: number }[];
  private linkPts: THREE.Points;
  private linkPhase: Float32Array;
  private air: THREE.Points | null = null;
  private airState: Float32Array | null = null; // per particle: angle, radius, s (0..1), speed jitter
  private airSpan = { top: 0, finTop: 0, finBottom: 0, bottom: 0 };
  private size: number;

  constructor(
    scene: THREE.Scene,
    private spec: ThermalSpec,
    private sim: ThermalSim,
  ) {
    const bounds = new THREE.Box3();
    for (const n of spec.nodes) for (const o of n.objects) bounds.expandByObject(o);
    this.size = bounds.isEmpty() ? 10 : bounds.getSize(_a).length();

    this.links = spec.links.map(([a, b, g]) => ({ a, b, g }));
    const n = this.links.length * PER_LINK;
    this.linkPts = makePoints(n, this.size * 0.014);
    this.linkPhase = Float32Array.from({ length: n }, (_, i) => (i % PER_LINK) / PER_LINK + Math.random() * 0.02);
    this.group.add(this.linkPts);

    if (spec.airflow) {
      const count = spec.airflow.inlets.length * PER_INLET;
      this.air = makePoints(count, this.size * 0.009);
      this.airState = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) this.respawn(i, Math.random());
      this.group.add(this.air);
    }
    this.group.renderOrder = 999;
    scene.add(this.group);
    this.measure();
  }

  /** Heat flow a → b in watts (positive: a is hotter). */
  linkFlow(a: string, b: string, g: number) {
    return g * (this.sim.temp(a) - this.sim.temp(b));
  }

  update(dt: number, fan: number) {
    this.refresh -= dt;
    if (this.refresh <= 0) {
      this.refresh = 0.5; // parts move (disassembly), but slowly
      this.measure();
    }
    this.updateLinks(dt);
    if (this.air) this.updateAir(dt, fan);
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const p = o as THREE.Points;
      if (p.isPoints) {
        p.geometry.dispose();
        (p.material as THREE.Material).dispose();
      }
    });
  }

  // ---------------------------------------------------------------- internals
  private measure() {
    for (const node of this.spec.nodes) {
      _box.makeEmpty();
      for (const o of node.objects) _box.expandByObject(o);
      if (!_box.isEmpty()) this.centres.set(node.id, _box.getCenter(new THREE.Vector3()));
    }
    // Parts that are not drawn at this scale (the cooler above the PCB): just above whatever
    // they are linked to.
    for (const node of this.spec.nodes) {
      if (this.centres.has(node.id)) continue;
      const other = this.links.find((l) => l.a === node.id || l.b === node.id);
      const c = other && this.centres.get(other.a === node.id ? other.b : other.a);
      if (c) this.centres.set(node.id, c.clone().add(new THREE.Vector3(0, this.size * 0.12, 0)));
    }
    const air = this.spec.airflow;
    if (air) {
      _box.makeEmpty();
      for (const o of this.spec.nodes.find((n) => n.id === air.through)?.objects ?? []) _box.expandByObject(o);
      const inletY = air.inlets.reduce((m, o) => Math.max(m, o.getWorldPosition(_a).y), -Infinity);
      const finTop = _box.isEmpty() ? inletY - air.radius * 0.3 : _box.max.y;
      const finBottom = _box.isEmpty() ? finTop - air.radius * 0.6 : _box.min.y;
      this.airSpan = {
        top: inletY + air.radius * 0.7,
        finTop,
        finBottom,
        bottom: finBottom - air.radius * 0.9,
      };
    }
  }

  /** Where heat arrives in/leaves a part: the fin stacks are under each fan, not at their centre. */
  private endpoint(id: string, k: number, out: THREE.Vector3): THREE.Vector3 | null {
    const air = this.spec.airflow;
    if (air && id === air.through && air.inlets.length) {
      air.inlets[k % air.inlets.length].getWorldPosition(out);
      out.y = (this.airSpan.finTop + this.airSpan.finBottom) / 2;
      return out;
    }
    const c = this.centres.get(id);
    return c ? out.copy(c) : null;
  }

  private updateLinks(dt: number) {
    const pos = this.linkPts.geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = this.linkPts.geometry.getAttribute('color') as THREE.BufferAttribute;
    const flows = this.links.map((l) => this.linkFlow(l.a, l.b, l.g));
    const maxFlow = Math.max(1, ...flows.map(Math.abs));
    this.links.forEach((l, li) => {
      const ca = this.centres.get(l.a);
      const cb = this.centres.get(l.b);
      const q = flows[li];
      const strength = Math.min(1, Math.sqrt(Math.abs(q) / maxFlow));
      const lit = Math.round(strength * PER_LINK);
      // Hot end first: particles always travel with the heat.
      const hot = q >= 0 ? l.a : l.b;
      const cold = q >= 0 ? l.b : l.a;
      // Heat, not temperature: a few degrees above ambient would be invisible on the thermal
      // palette, so sparks glow orange, towards pale yellow where the flow is strongest.
      _c.copy(HEAT_LOW).lerp(HEAT_HIGH, strength);
      for (let k = 0; k < PER_LINK; k++) {
        const i = li * PER_LINK + k;
        const from = ca && cb ? this.endpoint(hot, k, _from) : null;
        const to = from ? this.endpoint(cold, k, _to) : null;
        if (!from || !to || k >= lit || Math.abs(q) < 0.5) {
          pos.setXYZ(i, 0, -1e6, 0);
          continue;
        }
        let t = this.linkPhase[i] + dt * (0.25 + 0.6 * strength);
        t -= Math.floor(t);
        this.linkPhase[i] = t;
        // A gentle arc, so links between parts at the same height stay visible.
        _ctrl.addVectors(from, to).multiplyScalar(0.5);
        _ctrl.y += from.distanceTo(to) * 0.25;
        quadratic(from, _ctrl, to, t, _a);
        pos.setXYZ(i, _a.x, _a.y, _a.z);
        const fade = Math.sin(Math.PI * t);
        col.setXYZ(i, _c.r * fade * 2.2, _c.g * fade * 2.2, _c.b * fade * 2.2);
      }
    });
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  private respawn(i: number, s: number) {
    const st = this.airState!;
    st[i * 4] = Math.random() * Math.PI * 2;
    st[i * 4 + 1] = Math.sqrt(Math.random()); // uniform over the disc
    st[i * 4 + 2] = s;
    st[i * 4 + 3] = 0.75 + Math.random() * 0.5;
  }

  private updateAir(dt: number, fan: number) {
    const air = this.spec.airflow!;
    const st = this.airState!;
    const pos = this.air!.geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = this.air!.geometry.getAttribute('color') as THREE.BufferAttribute;
    const { top, finTop, finBottom, bottom } = this.airSpan;
    const span = Math.max(top - bottom, 1e-6);
    const finT = this.sim.temp(air.through);
    const speed = 0.08 + 0.55 * fan; // fraction of the path per second
    const swirl = 1.5 + 5 * fan;
    const perInlet = PER_INLET;
    for (let i = 0; i < pos.count; i++) {
      const inlet = air.inlets[Math.floor(i / perInlet)];
      inlet.getWorldPosition(_b);
      let s = st[i * 4 + 2] + dt * speed * st[i * 4 + 3];
      if (s >= 1) {
        this.respawn(i, s - 1);
        s = st[i * 4 + 2];
      }
      st[i * 4 + 2] = s;
      const y = top - s * span;
      // Swirl while still in the fan, then straight through the fins.
      const inFan = y > finTop ? 1 : 0;
      st[i * 4] += dt * swirl * inFan;
      const r = st[i * 4 + 1] * air.radius * (y > finTop ? 1 - 0.35 * ((y - finTop) / (top - finTop)) : 0.95);
      pos.setXYZ(i, _b.x + Math.cos(st[i * 4]) * r, y, _b.z + Math.sin(st[i * 4]) * r * 0.55);
      // Warms up while crossing the fins: cold blue air in, fin-temperature air out.
      // Coloured by how much it warmed (exhaust ~10–20 °C over intake), not on the absolute
      // thermal palette, where a few degrees of air would be invisible.
      const heat = 1 - THREE.MathUtils.smoothstep(y, finBottom, finTop);
      const rise = Math.max(0, finT - AMBIENT_C) * 0.85 * heat;
      const k = Math.min(1, rise / 15);
      _c.copy(AIR_IN).lerp(AIR_WARM, Math.min(1, k * 1.4));
      if (k > 0.7) _c.lerp(AIR_HOT, (k - 0.7) / 0.3);
      const fade = Math.min(1, s * 8) * Math.min(1, (1 - s) * 5) * (0.35 + 0.65 * fan) * 0.8;
      col.setXYZ(i, _c.r * fade, _c.g * fade, _c.b * fade);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }
}

function quadratic(a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, t: number, out: THREE.Vector3) {
  const u = 1 - t;
  return out.set(
    u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    u * u * a.z + 2 * u * t * c.z + t * t * b.z,
  );
}

function makePoints(count: number, size: number) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(count * 3).fill(-1e6), 3).setUsage(THREE.DynamicDrawUsage),
  );
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.PointsMaterial({
    size,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    // Drawn over the parts, like an annotation: air and heat flow through solids.
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    map: SPARK,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 999;
  return pts;
}

/** Soft round sprite, made once. */
const SPARK = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
})();
