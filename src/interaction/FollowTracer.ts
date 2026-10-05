import * as THREE from 'three';
import type { Level } from '../core/types';

const TRAIL = 48;

/**
 * The "followed electron": a bright head with a fading tail, drawn at a fixed on-screen size
 * so it reads the same at 30 cm and at 0.2 nm. Each level says where it is (followPoint);
 * the tracer just remembers recent positions for the tail.
 */
export class FollowTracer {
  private points: THREE.Points;
  private positions = new Float32Array(TRAIL * 3);
  private attr: THREE.BufferAttribute;
  private filled = 0;
  private head = new THREE.Vector3();
  private last = new THREE.Vector3();

  constructor() {
    const geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.positions, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.attr);
    const age = new Float32Array(TRAIL).map((_, i) => i / (TRAIL - 1));
    geo.setAttribute('aAge', new THREE.BufferAttribute(age, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uPixelRatio: { value: 1 }, uCount: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aAge;
        uniform float uPixelRatio;
        uniform float uCount;
        varying float vA;
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          float idx = aAge * ${TRAIL - 1}.0;
          vA = idx < uCount ? pow(1.0 - aAge, 1.6) : 0.0;
          gl_PointSize = mix(26.0, 4.0, pow(aAge, 0.5)) * uPixelRatio;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(uv, uv);
          if (r2 > 1.0 || vA <= 0.0) discard;
          float core = exp(-r2 * 10.0);
          float halo = exp(-r2 * 3.0) * 0.45;
          vec3 c = mix(vec3(0.6, 1.0, 0.3), vec3(1.0), core);
          gl_FragColor = vec4(c * (core + halo) * vA * 1.8, (core + halo) * vA);
        }
      `,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 1000;
    this.points.visible = false;
  }

  attach(level: Level) {
    level.scene.add(this.points);
    this.filled = 0;
  }

  detach(scene: THREE.Scene) {
    scene.remove(this.points);
  }

  update(level: Level | null, active: boolean, t: number, pixelRatio: number) {
    const pt = active && level?.followPoint ? level.followPoint(t, this.head) : null;
    this.points.visible = !!pt;
    if (!pt) {
      this.filled = 0;
      return;
    }
    // Shift the tail only when the head moved, so a paused electron does not collapse its tail.
    const moved = this.filled === 0 || this.head.distanceToSquared(this.last) > 1e-12;
    if (moved) {
      this.positions.copyWithin(3, 0, (TRAIL - 1) * 3);
      this.filled = Math.min(TRAIL, this.filled + 1);
      this.last.copy(this.head);
    }
    this.positions[0] = this.head.x;
    this.positions[1] = this.head.y;
    this.positions[2] = this.head.z;
    this.attr.needsUpdate = true;
    const mat = this.points.material as THREE.ShaderMaterial;
    mat.uniforms.uPixelRatio.value = pixelRatio;
    mat.uniforms.uCount.value = this.filled;
  }
}

/** Point on a polyline/spline at u in [0, 1], cached per level instance. */
export function splineAt(points: [number, number, number][], u: number, out: THREE.Vector3) {
  const key = points as unknown as { __curve?: THREE.CatmullRomCurve3 };
  key.__curve ??= new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(...p)),
    false,
    'centripetal',
    0.5,
  );
  return key.__curve.getPointAt(THREE.MathUtils.clamp(u, 0, 1), out);
}
