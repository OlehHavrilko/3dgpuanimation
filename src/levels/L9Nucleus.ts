import * as THREE from 'three';
import { META } from './meta';
import { BaseLevel, setControlValue } from '../core/BaseLevel';
import type { CameraKey } from '../core/CameraRig';
import type { PickHit, TransitionTarget } from '../core/types';
import { mulberry32, pickByT, smoothstep } from '../core/math';
import { content } from '../content';
import { pointScale } from '../core/points';
import { boxFrom, pickInstances, pickObject } from '../interaction/pick';
import { NUCLEON_R, nucleonJitter, nucleusLayout, nucleusSpin } from './nucleus/cluster';
import { ATOM_END_DIST, NUCLEUS_APPROACH, NUCLEUS_SCALE } from './nucleus/seam';

/**
 * Level 9 — the silicon-28 nucleus, then one of its protons opened up: three valence quarks
 * joined by a Y-shaped gluon flux tube, a shimmering gluon field and short-lived sea pairs.
 * Units: 0.1 fm per unit, at true scale (a proton is 8.4 units in radius).
 *
 * The atom scale draws the same nucleus ~10⁴ times too large; during its dive it shrinks the
 * nucleus back to its real size while the camera closes in, so this level's first frame is the
 * same picture at the same physical scale. Quarks, colours and sea pairs are a picture of
 * quantum fields, not of little balls: the content and the accuracy notes say so.
 */
const C = content.levels.nucleus;

const meta = META[8];

const PROTON_R = NUCLEON_R * NUCLEUS_SCALE;
/** Colour charge, by convention red / green / blue (it has nothing to do with light). */
const COLOUR = [new THREE.Color(1.0, 0.24, 0.22), new THREE.Color(0.25, 1.0, 0.36), new THREE.Color(0.3, 0.5, 1.0)];
/** Seconds between gluon exchanges, and how long a gluon takes to cross. */
const EXCHANGE = 1.5;
const CROSS = 0.55;
const WHITE = new THREE.Color(1, 1, 1);
const PROTON_COLOUR = new THREE.Color(0xfff6ea);
const SEA_PAIRS = 22;
const FIELD_POINTS = 2600;
const LAYERS = ['All', 'Valence', 'Gluons', 'Sea'] as const;

interface Quark {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  /** Lissajous parameters of its wandering inside the proton. */
  base: THREE.Vector3;
  freq: THREE.Vector3;
  phase: THREE.Vector3;
  pos: THREE.Vector3;
  colour: THREE.Color;
}

export class NucleusLevel extends BaseLevel {
  readonly meta = meta;
  private nucleusGroup = new THREE.Group();
  private others!: THREE.InstancedMesh;
  private coreLight!: THREE.PointLight;
  private othersMat!: THREE.MeshPhysicalMaterial;
  /** Instance -> nucleon index in the layout (the dive proton is drawn on its own). */
  private otherIndex: number[] = [];
  private diveMesh!: THREE.Mesh;
  private diveMat!: THREE.MeshPhysicalMaterial;
  private shellMat!: THREE.ShaderMaterial;
  /** Everything inside the opened proton, centred on it. */
  private inside = new THREE.Group();
  private quarks: Quark[] = [];
  private tubes: THREE.Mesh[] = [];
  private tubeMats: THREE.ShaderMaterial[] = [];
  private tubeGroup = new THREE.Group();
  private haloGeo!: THREE.BufferGeometry;
  private haloMat!: THREE.ShaderMaterial;
  private fieldMat!: THREE.ShaderMaterial;
  private seaMat!: THREE.ShaderMaterial;
  private readonly protonRest = new THREE.Vector3();
  private readonly protonNow = new THREE.Vector3();
  private readonly junction = new THREE.Vector3();
  /** Explore "Show" filter: current (eased) and target weights for valence, gluons, sea. */
  private layer = [1, 1, 1];
  private layerTarget = [1, 1, 1];
  private m = new THREE.Matrix4();
  private v = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private dir = new THREE.Vector3();
  private gluonColour = new THREE.Color();
  private target: TransitionTarget = { position: new THREE.Vector3(), radius: PROTON_R };

  constructor(ctx: ConstructorParameters<typeof BaseLevel>[0]) {
    super(ctx);
    this.near = 0.2;
    this.far = 4000;
    this.bloom = 1.25;
    this.bokeh = 0.8;
    this.sectionNormal = [0, 0, 1];
    this.followCaption = C.follow;
  }

  protected cameraKeys(): CameraKey[] {
    const { positions, diveProton } = nucleusLayout();
    const py = positions[diveProton].y * NUCLEUS_SCALE;
    const a = NUCLEUS_APPROACH;
    const at = (d: number): [number, number, number] => [a.x * d, a.y * d, a.z * d];
    return [
      // First frame = where the atom's dive ends: the nucleus at the same size and angle.
      { t: 0, pos: at(ATOM_END_DIST * NUCLEUS_SCALE), look: [0, 0, 0] },
      { t: 0.14, pos: at(150), look: [0, 0, 0] },
      { t: 0.34, pos: [55, 40, 95], look: [0, 8, 0] },
      { t: 0.52, pos: [10, py + 14, 34], look: [0, py + 1, 0] },
      { t: 0.72, pos: [4, py + 6, 19], look: [0, py, 0] },
      { t: 1.0, pos: [2.5, py + 3.5, 13.5], look: [0, py, 0] },
    ];
  }

  protected build() {
    this.scene.background = new THREE.Color(0x020405);
    // The atom scene's lights, scaled with the nucleus (inverse-square: intensity × 20²).
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.15));
    this.coreLight = new THREE.PointLight(0xe8ffd8, 40 * NUCLEUS_SCALE ** 2, 30 * NUCLEUS_SCALE, 2);
    this.scene.add(this.coreLight);
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(5, 8, 6);
    this.scene.add(key);

    this.buildNucleus();
    this.buildProton();
    this.buildControls();
  }

  private buildNucleus() {
    const { positions, proton, diveProton } = nucleusLayout();
    this.protonRest.copy(positions[diveProton]).multiplyScalar(NUCLEUS_SCALE);
    const geo = new THREE.SphereGeometry(NUCLEON_R, 28, 20);
    const makeMat = () =>
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.35,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.25,
        emissive: 0x1a2a10,
      });
    const protonCol = PROTON_COLOUR;
    const neutronCol = new THREE.Color(0x5f9a12);

    this.othersMat = makeMat();
    this.othersMat.transparent = true;
    this.others = new THREE.InstancedMesh(geo, this.othersMat, positions.length - 1);
    positions.forEach((p, i) => {
      if (i === diveProton) return;
      const k = this.otherIndex.length;
      this.otherIndex.push(i);
      this.others.setColorAt(k, proton[i] ? protonCol : neutronCol);
      this.others.setMatrixAt(k, this.m.makeTranslation(p.x, p.y, p.z));
    });
    this.others.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.nucleusGroup.add(this.others);

    // The proton the camera flies into: its own mesh so it can turn see-through.
    this.diveMat = makeMat();
    this.diveMat.color.copy(protonCol);
    this.diveMat.transparent = true;
    this.diveMesh = new THREE.Mesh(geo, this.diveMat);
    this.diveMesh.position.copy(positions[diveProton]);
    this.nucleusGroup.add(this.diveMesh);
    this.nucleusGroup.scale.setScalar(NUCLEUS_SCALE);
    this.scene.add(this.nucleusGroup);

    this.pickables.push(
      pickInstances(this.others, (k) => (proton[this.otherIndex[k]] ? C.entities.proton : C.entities.neutron), 1),
    );
  }

  private buildProton() {
    this.scene.add(this.inside);

    // A fuzzy boundary, not a surface: a Fresnel glow that fades towards the middle.
    this.shellMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      clipping: true,
      uniforms: { uFade: { value: 0 }, uTime: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.86, 0.72) } },
      vertexShader: /* glsl */ `
        #include <clipping_planes_pars_vertex>
        varying vec3 vN;
        varying vec3 vV;
        varying vec3 vP;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          #include <clipping_planes_vertex>
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mvPosition.xyz);
          vP = position;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        #include <clipping_planes_pars_fragment>
        uniform float uFade;
        uniform float uTime;
        uniform vec3 uColor;
        varying vec3 vN;
        varying vec3 vV;
        varying vec3 vP;
        void main() {
          #include <clipping_planes_fragment>
          float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
          float ripple = 0.75 + 0.25 * sin(vP.x * 0.9 + uTime * 1.3) * sin(vP.y * 0.8 - uTime * 1.1) * sin(vP.z * 0.7 + uTime);
          float a = uFade * (0.03 + 0.55 * pow(rim, 2.4)) * ripple;
          gl_FragColor = vec4(uColor * a, a);
        }
      `,
    });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(PROTON_R, 48, 32), this.shellMat);
    this.inside.add(shell);
    this.pickables.push({
      object: shell,
      priority: 1.5,
      resolve: (hit): PickHit | null => {
        if (this.shellMat.uniforms.uFade.value < 0.3) return null; // still the solid proton
        // Deep inside and with the sea on screen: the sea; otherwise the proton itself.
        const cam = this.ctx.camera.position;
        const ray = new THREE.Ray(cam.clone(), hit.point.clone().sub(cam).normalize());
        const deep = Math.sqrt(ray.distanceSqToPoint(this.protonNow)) < PROTON_R * 0.5;
        const seaOn = this.seaMat.uniforms.uFade.value > 0.4;
        const r = PROTON_R;
        const c = this.protonNow;
        const box = boxFrom(c.x - r, c.y - r, c.z - r, c.x + r, c.y + r, c.z + r);
        return deep && seaOn
          ? { key: 'sea', info: C.entities.sea, box }
          : { key: 'proton', info: C.entities.proton, box, object: shell };
      },
    });

    this.buildQuarks();
    this.buildTubes();
    this.buildField();
    this.buildSea();
  }

  private buildQuarks() {
    const rng = mulberry32(93);
    const geo = new THREE.SphereGeometry(0.75, 20, 14);
    // Up, up, down: placed on a triangle, each wandering on its own Lissajous path.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const mat = new THREE.MeshBasicMaterial({ color: COLOUR[i].clone(), transparent: true });
      const mesh = new THREE.Mesh(geo, mat);
      this.inside.add(mesh);
      this.quarks.push({
        mesh,
        mat,
        base: new THREE.Vector3(Math.cos(a) * 3.1, (rng() - 0.5) * 1.6, Math.sin(a) * 3.1),
        freq: new THREE.Vector3(0.55 + rng() * 0.5, 0.45 + rng() * 0.5, 0.6 + rng() * 0.5),
        phase: new THREE.Vector3(rng() * 6.28, rng() * 6.28, rng() * 6.28),
        pos: new THREE.Vector3(),
        colour: COLOUR[i].clone(),
      });
      this.pickables.push(pickObject(mesh, i < 2 ? C.entities.up : C.entities.down, 3));
    }

    // Soft halos around the quarks plus the gluon in flight (4th point).
    this.haloGeo = new THREE.BufferGeometry();
    this.haloGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    this.haloGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(12), 3));
    this.haloGeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array([5, 5, 5, 3]), 1));
    this.haloGeo.setAttribute('aFlash', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1]), 1));
    this.haloMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      uniforms: { uScale: { value: 1 }, uFade: { value: 0 }, uFlash: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aFlash;
        uniform float uScale;
        uniform float uFade;
        uniform float uFlash;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = min(aSize * uScale / -mv.z, 220.0);
          vColor = color;
          vAlpha = uFade * mix(0.55, uFlash, aFlash);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(uv, uv);
          if (r2 > 1.0) discard;
          float a = exp(-r2 * 4.0) * vAlpha;
          gl_FragColor = vec4(vColor * a, a);
        }
      `,
    });
    const halos = new THREE.Points(this.haloGeo, this.haloMat);
    halos.frustumCulled = false;
    this.inside.add(halos);
  }

  /** The Y-shaped flux tube: one glowing cylinder from each quark to the junction. */
  private buildTubes() {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
    geo.translate(0, 0.5, 0); // y = 0 at the quark, 1 at the junction
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        clipping: true,
        uniforms: {
          uFade: { value: 0 },
          uTime: { value: 0 },
          uColor: { value: new THREE.Color() },
          uLength: { value: 1 },
        },
        vertexShader: /* glsl */ `
          #include <clipping_planes_pars_vertex>
          varying vec3 vN;
          varying vec3 vV;
          varying float vY;
          void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            #include <clipping_planes_vertex>
            vN = normalize(normalMatrix * normal);
            vV = normalize(-mvPosition.xyz);
            vY = position.y;
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: /* glsl */ `
          #include <clipping_planes_pars_fragment>
          uniform float uFade;
          uniform float uTime;
          uniform float uLength;
          uniform vec3 uColor;
          varying vec3 vN;
          varying vec3 vV;
          varying float vY;
          void main() {
            #include <clipping_planes_fragment>
            // Bright core, soft edge; energy flows from the quark towards the junction.
            float core = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
            float flow = 0.62 + 0.38 * sin(vY * uLength * 1.7 - uTime * 7.0);
            vec3 col = mix(uColor, vec3(1.0, 0.95, 0.85), smoothstep(0.35, 1.0, vY));
            float a = uFade * core * flow * 0.85;
            gl_FragColor = vec4(col * a, a);
          }
        `,
      });
      const tube = new THREE.Mesh(geo, mat);
      tube.frustumCulled = false;
      this.tubeMats.push(mat);
      this.tubes.push(tube);
      this.tubeGroup.add(tube);
    }
    this.inside.add(this.tubeGroup);
    this.pickables.push(pickObject(this.tubeGroup, C.entities.gluon, 2));
  }

  /** The gluon field: a faint, restless haze of colour filling the proton. */
  private buildField() {
    const rng = mulberry32(51);
    const n = FIELD_POINTS;
    const pos = new Float32Array(n * 3);
    const rand = new Float32Array(n * 3);
    const dir = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      randomUnit(dir, rng);
      // Denser towards the middle, thinning out at the (fuzzy) edge.
      const r = PROTON_R * 0.92 * Math.pow(rng(), 0.55);
      pos.set([dir.x * r, dir.y * r, dir.z * r], i * 3);
      rand.set([rng(), rng(), rng()], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 3));
    this.fieldMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      clipping: true,
      uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, uFade: { value: 0 } },
      vertexShader: /* glsl */ `
        #include <clipping_planes_pars_vertex>
        attribute vec3 aRand;
        uniform float uTime;
        uniform float uScale;
        uniform float uFade;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec3 p = position + 0.9 * vec3(
            sin(uTime * (0.7 + aRand.x) + aRand.y * 40.0),
            sin(uTime * (0.6 + aRand.y) + aRand.z * 40.0),
            sin(uTime * (0.8 + aRand.z) + aRand.x * 40.0));
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          #include <clipping_planes_vertex>
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = min((0.5 + aRand.x * 0.7) * uScale / -mvPosition.z, 40.0);
          // Colour charge sloshing around: hue drifts per point.
          float h = fract(aRand.z + uTime * 0.07 * (aRand.y - 0.5));
          vColor = clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0) * 0.8 + 0.2;
          float flicker = 0.55 + 0.45 * sin(uTime * (2.0 + aRand.x * 3.0) + aRand.y * 20.0);
          vAlpha = uFade * 0.13 * flicker * smoothstep(0.6, 3.0, -mvPosition.z);
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
          float a = exp(-r2 * 3.0) * vAlpha;
          gl_FragColor = vec4(vColor * a, a);
        }
      `,
    });
    const field = new THREE.Points(geo, this.fieldMat);
    field.frustumCulled = false;
    this.inside.add(field);
  }

  /** Sea quarks: pairs that split, drift apart a little and annihilate, all in the shader. */
  private buildSea() {
    const rng = mulberry32(77);
    const n = SEA_PAIRS * 2;
    const centre = new Float32Array(n * 3);
    const dir = new Float32Array(n * 3);
    const life = new Float32Array(n * 3); // sign, phase, rate
    const colour = new Float32Array(n * 3);
    const v = new THREE.Vector3();
    const c = new THREE.Color();
    for (let k = 0; k < SEA_PAIRS; k++) {
      randomUnit(v, rng);
      const r = PROTON_R * 0.75 * Math.cbrt(rng());
      const cx = v.x * r;
      const cy = v.y * r;
      const cz = v.z * r;
      randomUnit(v, rng);
      const phase = rng();
      const rate = 0.25 + rng() * 0.3;
      c.copy(COLOUR[k % 3]);
      for (let s = 0; s < 2; s++) {
        const i = k * 2 + s;
        centre.set([cx, cy, cz], i * 3);
        dir.set([v.x, v.y, v.z], i * 3);
        life.set([s === 0 ? 1 : -1, phase, rate], i * 3);
        // The antiquark carries the anticolour.
        if (s === 0) colour.set([c.r, c.g, c.b], i * 3);
        else colour.set([1 - c.r * 0.75, 1 - c.g * 0.75, 1 - c.b * 0.75], i * 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(centre, 3));
    geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(life, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colour, 3));
    this.seaMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      clipping: true,
      uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, uFade: { value: 0 } },
      vertexShader: /* glsl */ `
        #include <clipping_planes_pars_vertex>
        attribute vec3 aDir;
        attribute vec3 aLife;
        uniform float uTime;
        uniform float uScale;
        uniform float uFade;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float c = fract(uTime * aLife.z + aLife.y);
          // Born together, drift apart, meet again and vanish; then a quiet gap.
          float alive = smoothstep(0.0, 0.08, c) * (1.0 - smoothstep(0.5, 0.62, c));
          float sep = 1.6 * sin(3.14159 * clamp(c / 0.62, 0.0, 1.0));
          vec3 p = position + aDir * sep * aLife.x;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          #include <clipping_planes_vertex>
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = min(2.2 * uScale / -mvPosition.z, 90.0);
          vColor = color;
          vAlpha = uFade * alive * 0.8;
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
          float a = (exp(-r2 * 6.0) + 0.25 * exp(-r2 * 1.5)) * vAlpha;
          gl_FragColor = vec4(vColor * a, a);
        }
      `,
    });
    const sea = new THREE.Points(geo, this.seaMat);
    sea.frustumCulled = false;
    this.inside.add(sea);
  }

  private buildControls() {
    this.controls = [
      {
        kind: 'choice',
        label: C.controls.layer,
        options: [...LAYERS],
        value: 'All',
        onChange: (v) => {
          const k = LAYERS.indexOf(v as (typeof LAYERS)[number]) - 1;
          this.layerTarget = this.layerTarget.map((_, i) => (k < 0 || i === k ? 1 : 0));
        },
      },
    ];
  }

  protected animate(t: number, dt: number, time: number) {
    const ease = Math.min(1, dt * 5);
    for (let i = 0; i < 3; i++) this.layer[i] += (this.layerTarget[i] - this.layer[i]) * ease;

    // Nucleus: the atom scene's spin, breathing and jitter, at 20× the size.
    const { positions } = nucleusLayout();
    const spin = nucleusSpin(time);
    this.nucleusGroup.rotation.y = spin.angle;
    this.nucleusGroup.scale.setScalar(NUCLEUS_SCALE * spin.scale);
    this.otherIndex.forEach((i, k) => {
      const p = nucleonJitter(i, time, this.v).add(positions[i]);
      this.others.setMatrixAt(k, this.m.makeTranslation(p.x, p.y, p.z));
    });
    this.others.instanceMatrix.needsUpdate = true;
    const { diveProton } = nucleusLayout();
    this.diveMesh.position.copy(nucleonJitter(diveProton, time, this.v).add(positions[diveProton]));
    this.nucleusGroup.updateMatrixWorld();
    this.protonNow.copy(this.diveMesh.position).applyMatrix4(this.nucleusGroup.matrixWorld);
    this.inside.position.copy(this.protonNow);
    this.target.position.copy(this.protonNow);

    // Keep the opened proton steady on screen: the camera rides along with its jitter.
    if (!this.ctx.view.freeCamera) {
      const follow = smoothstep(0.3, 0.55, t);
      this.v.subVectors(this.protonNow, this.protonRest).multiplyScalar(follow);
      this.ctx.camera.position.add(this.v);
      this.lookAt.add(this.v);
      this.ctx.camera.lookAt(this.lookAt);
    }

    // Story beats: the other nucleons dim, the proton turns see-through, its insides appear.
    const open = smoothstep(0.4, 0.62, t);
    // The other nucleons step back into a faint ghost so the opened proton reads against black.
    const ghost = 1 - smoothstep(0.36, 0.66, t);
    this.othersMat.opacity = ghost;
    this.othersMat.depthWrite = ghost > 0.99;
    this.others.visible = ghost > 0.01;
    // The atom scene's glowing look only has to match at the hand-over; up close the nucleons
    // calm down to a lit surface, so they read as spheres rather than one bloom.
    const calm = smoothstep(0.06, 0.32, t);
    this.coreLight.intensity = 40 * NUCLEUS_SCALE ** 2 * (1 - 0.8 * calm);
    const tone = 1 - 0.45 * calm;
    this.othersMat.color.setScalar(tone);
    this.diveMat.color.copy(PROTON_COLOUR).multiplyScalar(tone);
    this.othersMat.envMapIntensity = this.diveMat.envMapIntensity = 1 - 0.5 * calm;
    this.bloom = 1.25 - 0.5 * calm + 0.5 * smoothstep(0.5, 0.7, t);
    this.diveMat.opacity = 1 - open;
    this.diveMat.depthWrite = open < 0.02;
    this.diveMesh.visible = open < 0.995;
    this.shellMat.uniforms.uFade.value = smoothstep(0.38, 0.58, t);
    this.shellMat.uniforms.uTime.value = time;
    const valence = smoothstep(0.45, 0.62, t) * this.layer[0];
    const gluons = smoothstep(0.48, 0.66, t) * this.layer[1];
    const sea = smoothstep(0.72, 0.88, t) * this.layer[2];
    this.inside.visible = open > 0.001;

    const scale = pointScale(this.ctx.renderer, this.ctx.camera);
    this.fieldMat.uniforms.uTime.value = time;
    this.fieldMat.uniforms.uScale.value = scale;
    this.fieldMat.uniforms.uFade.value = gluons;
    this.seaMat.uniforms.uTime.value = time;
    this.seaMat.uniforms.uScale.value = scale;
    this.seaMat.uniforms.uFade.value = sea;
    this.haloMat.uniforms.uScale.value = scale;
    this.haloMat.uniforms.uFade.value = valence;

    this.animateQuarks(time, valence, gluons);
    this.caption = pickByT(t, [0.2, 0.42, 0.66, 0.84], C.captions);
  }

  /**
   * Valence quarks wander, and every EXCHANGE seconds a gluon carries colour from one quark to
   * another through the junction: the two swap colours, so the proton stays colour-neutral.
   * Everything is a function of `time`, so a frame is reproducible.
   */
  private animateQuarks(time: number, valence: number, gluons: number) {
    const k = Math.floor(time / EXCHANGE);
    const into = time - k * EXCHANGE;
    // Colour assignment after k exchanges (pairs cycle 01, 12, 20; period 6).
    const perm = [0, 1, 2];
    const pairs = [
      [0, 1],
      [1, 2],
      [2, 0],
    ];
    for (let s = 0; s < ((k % 6) + 6) % 6; s++) {
      const [a, b] = pairs[s % 3];
      [perm[a], perm[b]] = [perm[b], perm[a]];
    }
    const [from, to] = pairs[((k % 3) + 3) % 3];
    const flight = into / CROSS;
    const swap = smoothstep(0.85, 1.15, flight);

    this.junction.set(0, 0, 0);
    this.quarks.forEach((qk, i) => {
      qk.pos.set(
        qk.base.x + 1.4 * Math.sin(time * qk.freq.x + qk.phase.x),
        qk.base.y + 1.4 * Math.sin(time * qk.freq.y + qk.phase.y),
        qk.base.z + 1.4 * Math.sin(time * qk.freq.z + qk.phase.z),
      );
      qk.mesh.position.copy(qk.pos);
      this.junction.add(qk.pos);
      // The two quarks of this exchange trade colours as the gluon arrives.
      const own = COLOUR[perm[i]];
      const other = i === from ? COLOUR[perm[to]] : i === to ? COLOUR[perm[from]] : own;
      qk.colour.copy(own).lerp(other, swap);
      qk.mat.color.copy(qk.colour).multiplyScalar(2.4);
      qk.mat.opacity = valence;
      qk.mesh.visible = valence > 0.01;
    });
    this.junction.multiplyScalar(1 / 3);

    const pos = this.haloGeo.attributes.position as THREE.BufferAttribute;
    const col = this.haloGeo.attributes.color as THREE.BufferAttribute;
    this.quarks.forEach((qk, i) => {
      pos.setXYZ(i, qk.pos.x, qk.pos.y, qk.pos.z);
      col.setXYZ(i, qk.colour.r, qk.colour.g, qk.colour.b);
    });

    // Tubes: quark -> junction, coloured by the quark at their end.
    const up = this.v.set(0, 1, 0);
    this.tubeGroup.visible = gluons > 0.01;
    this.tubes.forEach((tube, i) => {
      const a = this.quarks[i].pos;
      const d = this.dir.copy(this.junction).sub(a);
      const len = Math.max(d.length(), 1e-3);
      tube.position.copy(a);
      tube.quaternion.copy(this.q.setFromUnitVectors(up, d.divideScalar(len)));
      const w = 0.6 + 0.08 * Math.sin(time * 3 + i * 2);
      tube.scale.set(w, len, w);
      const u = this.tubeMats[i].uniforms;
      u.uFade.value = gluons;
      u.uTime.value = time;
      u.uLength.value = len;
      (u.uColor.value as THREE.Color).copy(this.quarks[i].colour);
    });

    // The gluon in flight: quark `from` -> junction -> quark `to`.
    const g = Math.min(1, Math.max(0, flight));
    const p =
      g < 0.5
        ? this.dir.copy(this.quarks[from].pos).lerp(this.junction, g * 2)
        : this.dir.copy(this.junction).lerp(this.quarks[to].pos, g * 2 - 1);
    pos.setXYZ(3, p.x, p.y, p.z);
    const gc = this.gluonColour.copy(COLOUR[perm[from]]).lerp(WHITE, 0.5);
    col.setXYZ(3, gc.r, gc.g, gc.b);
    this.haloMat.uniforms.uFlash.value = flight <= 1 ? Math.sin(Math.PI * g) * gluons : 0;
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  onExploreChange(active: boolean) {
    this.layerTarget = [1, 1, 1];
    if (active) setControlValue(this.controls[0], 'All');
  }

  followPoint() {
    return null;
  }

  getTransitionTarget() {
    return this.target;
  }

  getFocus() {
    return this.lookAt;
  }
}

function randomUnit(out: THREE.Vector3, rng: () => number) {
  const z = rng() * 2 - 1;
  const a = rng() * Math.PI * 2;
  const s = Math.sqrt(1 - z * z);
  return out.set(Math.cos(a) * s, Math.sin(a) * s, z);
}
