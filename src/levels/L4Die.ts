import * as THREE from 'three';
import { BaseLevel } from '../core/BaseLevel';
import type { CameraKey } from '../core/CameraRig';
import type { LevelMeta, TransitionTarget } from '../core/types';
import { mulberry32, smoothstep } from '../core/math';

/**
 * Level 4 — the GB202 die. Units: millimetres.
 * The floorplan follows NVIDIA's published GB202 block diagram (12 GPCs x 16 SMs,
 * a central L2, 16 x 32-bit GDDR7 controllers); the physical placement is schematic.
 * The surface is a custom shader: thin-film interference in the oxide/passivation
 * stack gives the angle-dependent rainbow you see on real dies.
 */
export const meta: LevelMeta = {
  name: 'GB202 die',
  scale: '1 cm',
  description: 'Blackwell, TSMC 4N, ~750 mm², 92.2 billion transistors.',
  unitMeters: 0.001,
  weight: 1.1,
};

const DIE_W = 29;
const DIE_H = 26;
const EDGE = 2.0; // memory-PHY ring width
const L2_HALF = 2.0; // half-height of the central L2 band
const GPC_COLS = 6;
const SM_COLS = 2;
const SM_ROWS = 8;
const SMS = GPC_COLS * 2 * SM_COLS * SM_ROWS; // 192
const SMS_ENABLED = 170; // RTX 5090

export class DieLevel extends BaseLevel {
  readonly meta = meta;
  private mat!: THREE.ShaderMaterial;
  private target: TransitionTarget;

  constructor(ctx: ConstructorParameters<typeof BaseLevel>[0]) {
    super(ctx);
    this.near = 0.02;
    this.far = 500;
    this.bloom = 1.15;
    this.bokeh = 1.3;
    // Dive into SM #3 of the third GPC in the top row.
    this.target = { position: smCenter(2, 1, 0, 3), radius: 0.9, approach: new THREE.Vector3(0.15, 0.9, 0.4).normalize() };
  }

  protected cameraKeys(): CameraKey[] {
    const p = this.target.position;
    return [
      { t: 0.0, pos: [0, 34, 40], look: [0, 0, 0] },
      { t: 0.2, pos: [-34, 13, 26], look: [0, 0, 0] },
      { t: 0.45, pos: [-4, 44, 10], look: [0, 0, 0] },
      { t: 0.68, pos: [30, 12, -24], look: [0, 0, 0] },
      { t: 0.86, pos: [p.x + 10, 9, p.z + 14], look: [p.x * 0.6, 0, p.z * 0.6] },
      { t: 1.0, pos: [p.x + 4, 5, p.z + 7], look: [p.x, 0, p.z] },
    ];
  }

  protected build() {
    const s = this.scene;
    s.add(new THREE.AmbientLight(0xffffff, 0.3));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(20, 40, 10);
    s.add(key);

    // Which SMs are fused off on an RTX 5090 (22 of 192), deterministic pick.
    const disabled = new Uint8Array(SMS);
    const rng = mulberry32(5090);
    let off = 0;
    while (off < SMS - SMS_ENABLED) {
      const i = Math.floor(rng() * SMS);
      if (!disabled[i]) {
        disabled[i] = 255;
        off++;
      }
    }
    const smTex = new THREE.DataTexture(disabled, SMS, 1, THREE.RedFormat, THREE.UnsignedByteType);
    smTex.needsUpdate = true;

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uHl: { value: new THREE.Vector4() },
        uSmReveal: { value: 0 },
        uDisabled: { value: smTex },
        uLightDir: { value: new THREE.Vector3(0.4, 1, 0.25).normalize() },
      },
      vertexShader: /* glsl */ `
        varying vec2 vP;
        varying vec3 vWorld;
        void main() {
          vP = position.xy;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: FRAG,
      defines: {
        DIE_W: DIE_W.toFixed(2),
        DIE_H: DIE_H.toFixed(2),
        EDGE: EDGE.toFixed(2),
        L2_HALF: L2_HALF.toFixed(2),
        GPC_COLS: GPC_COLS.toFixed(1),
        SM_COLS: SM_COLS.toFixed(1),
        SM_ROWS: SM_ROWS.toFixed(1),
        SMS: SMS.toFixed(1),
      },
    });

    // PlaneGeometry lies in XY; rotate so the die faces +Y. Local y maps to world -z.
    const die = new THREE.Mesh(new THREE.PlaneGeometry(DIE_W, DIE_H, 1, 1), this.mat);
    die.rotation.x = -Math.PI / 2;
    s.add(die);

    // Die edge + substrate below for context
    const side = new THREE.Mesh(
      new THREE.BoxGeometry(DIE_W, 0.78, DIE_H),
      new THREE.MeshStandardMaterial({ color: 0x5c6470, metalness: 0.9, roughness: 0.3 }),
    );
    side.position.y = -0.4;
    s.add(side);
    const substrate = new THREE.Mesh(
      new THREE.BoxGeometry(50, 1.3, 50),
      new THREE.MeshStandardMaterial({ color: 0x1d2a18, roughness: 0.6, metalness: 0.2 }),
    );
    substrate.position.y = -1.6;
    s.add(substrate);
  }

  protected animate(t: number, _dt: number, time: number) {
    const u = this.mat.uniforms;
    u.uTime.value = time;
    // Highlight sequence: GPC -> SM -> L2 -> memory controllers.
    const bump = (a: number, b: number) => smoothstep(a, a + 0.05, t) * (1 - smoothstep(b - 0.05, b, t));
    const gpc = bump(0.12, 0.34);
    const sm = bump(0.32, 0.54) + smoothstep(0.84, 0.96, t);
    const l2 = bump(0.52, 0.7);
    const mc = bump(0.68, 0.86);
    (u.uHl.value as THREE.Vector4).set(gpc, sm, l2, mc);
    u.uSmReveal.value = smoothstep(0.32, 0.5, t) * SMS;

    this.caption =
      t < 0.12
        ? 'Thin-film interference: oxide thickness paints the colours'
        : t < 0.33
          ? '12 Graphics Processing Clusters (GPC)'
          : t < 0.53
            ? `${SMS} Streaming Multiprocessors · ${SMS_ENABLED} enabled on RTX 5090 · 21,760 CUDA cores`
            : t < 0.69
              ? 'L2 cache · 128 MB on die (96 MB enabled)'
              : t < 0.86
                ? '16 × 32-bit GDDR7 memory controllers = 512-bit bus'
                : 'Zooming into one SM';
  }

  getTransitionTarget() {
    return this.target;
  }
}

/** World-space centre of an SM (gpcCol 0..5, row 0 = top (-z) / 1 = bottom, smCol 0..1, smRow 0..7). */
function smCenter(gpcCol: number, row: number, smCol: number, smRow: number) {
  const innerW = DIE_W - 2 * EDGE;
  const gpcW = innerW / GPC_COLS;
  const gpcH = DIE_H / 2 - EDGE - L2_HALF;
  const x = -innerW / 2 + gpcW * (gpcCol + (smCol + 0.5) / SM_COLS);
  // Plane-local y: row 0 is the +y half (world -z after rotation).
  const yLocal0 = L2_HALF + 0.35 + (gpcH - 0.35) * ((smRow + 0.5) / SM_ROWS);
  const yLocal = row === 0 ? yLocal0 : -yLocal0;
  return new THREE.Vector3(x, 0, -yLocal);
}

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec4 uHl;
  uniform float uSmReveal;
  uniform sampler2D uDisabled;
  uniform vec3 uLightDir;
  varying vec2 vP;
  varying vec3 vWorld;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  // Signed distance to the border of an axis-aligned rect (negative inside).
  float rectDist(vec2 p, vec2 lo, vec2 hi) {
    vec2 c = (lo + hi) * 0.5;
    vec2 h = (hi - lo) * 0.5;
    vec2 d = abs(p - c) - h;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }

  // Thin-film reflectance for three wavelengths (nm), film index n on silicon.
  vec3 thinFilm(float thickness, float cosI) {
    float n = 1.46;
    float sinT2 = (1.0 - cosI * cosI) / (n * n);
    float cosT = sqrt(max(0.0, 1.0 - sinT2));
    float opd = 2.0 * n * thickness * cosT;
    vec3 lambda = vec3(640.0, 535.0, 455.0);
    return 0.5 + 0.5 * cos(6.2831853 * opd / lambda);
  }

  void main() {
    vec2 p = vP;
    vec2 half_ = vec2(DIE_W, DIE_H) * 0.5;
    float px = fwidth(p.x) * 1.5;

    // ---- classify the floorplan
    float cat = 0.0;         // 0 misc, 1 MC/PHY, 2 L2, 3 GPC-frontend, 4 SM
    float edge = 1e3;        // distance to the nearest block boundary
    float gpcEdge = 1e3;
    float smEdge = 1e3;
    float l2Edge = 1e3;
    float mcEdge = 1e3;
    float smId = -1.0;
    float detail = 0.0;

    vec2 a = abs(p);
    if (a.x > half_.x - EDGE || a.y > half_.y - EDGE) {
      // Memory controller + GDDR7 PHY ring: 4 per side.
      cat = 1.0;
      bool vertical = a.x > half_.x - EDGE && a.x - (half_.x - EDGE) > a.y - (half_.y - EDGE);
      float along = vertical ? p.y : p.x;
      float span = vertical ? DIE_H - 2.0 * EDGE : DIE_W - 2.0 * EDGE;
      float slot = clamp(floor((along + span * 0.5) / (span / 4.0)), 0.0, 3.0);
      float lo = -span * 0.5 + slot * span / 4.0 + 0.25;
      float hi = lo + span / 4.0 - 0.5;
      vec2 r0 = vertical ? vec2(sign(p.x) * (half_.x - EDGE) , lo) : vec2(lo, sign(p.y) * (half_.y - EDGE));
      vec2 r1 = vertical ? vec2(sign(p.x) * (half_.x - 0.25), hi) : vec2(hi, sign(p.y) * (half_.y - 0.25));
      mcEdge = abs(rectDist(p, min(r0, r1), max(r0, r1)));
      if (rectDist(p, min(r0, r1), max(r0, r1)) > 0.0) cat = 0.0;
      detail = step(0.5, fract((vertical ? p.x : p.y) * 6.0));
    } else if (a.y < L2_HALF) {
      // Central L2 band, split by the hub (GigaThread, PCIe 5.0, media, display) in the middle.
      if (a.x < 2.6) {
        cat = 0.0;
        detail = step(0.5, fract(p.x * 2.0 + floor(p.y * 2.0) * 0.5));
      } else {
        cat = 2.0;
        float side = sign(p.x);
        vec2 lo = vec2(side > 0.0 ? 2.8 : -(half_.x - EDGE - 0.2), -L2_HALF + 0.2);
        vec2 hi = vec2(side > 0.0 ? half_.x - EDGE - 0.2 : -2.8, L2_HALF - 0.2);
        l2Edge = abs(rectDist(p, lo, hi));
        vec2 bank = fract(p * vec2(2.2, 3.0));
        detail = step(0.08, bank.x) * step(0.1, bank.y);
      }
    } else {
      // GPC grid
      float innerW = DIE_W - 2.0 * EDGE;
      float gpcW = innerW / GPC_COLS;
      float gpcH = half_.y - EDGE - L2_HALF;
      float col = clamp(floor((p.x + innerW * 0.5) / gpcW), 0.0, GPC_COLS - 1.0);
      float row = p.y > 0.0 ? 0.0 : 1.0;
      float x0 = -innerW * 0.5 + col * gpcW;
      float yIn = a.y - L2_HALF; // 0 at the L2 band, gpcH at the PHY ring
      gpcEdge = abs(rectDist(vec2(p.x, yIn), vec2(x0 + 0.12, 0.12), vec2(x0 + gpcW - 0.12, gpcH - 0.12)));
      if (yIn < 0.35) {
        cat = 3.0; // raster / ROP front end strip
        detail = step(0.5, fract(p.x * 4.0));
      } else {
        cat = 4.0;
        float smW = gpcW / SM_COLS;
        float smH = (gpcH - 0.35) / SM_ROWS;
        float sc = clamp(floor((p.x - x0) / smW), 0.0, SM_COLS - 1.0);
        float sr = clamp(floor((yIn - 0.35) / smH), 0.0, SM_ROWS - 1.0);
        vec2 lo = vec2(x0 + sc * smW + 0.06, 0.35 + sr * smH + 0.05);
        vec2 hi = lo + vec2(smW - 0.12, smH - 0.1);
        smEdge = abs(rectDist(vec2(p.x, yIn), lo, hi));
        smId = ((row * GPC_COLS + col) * SM_COLS + sc) * SM_ROWS + sr;
        // SM internals: 4 processing blocks + tensor cores + L1/shared memory
        vec2 q = (vec2(p.x, yIn) - lo) / (hi - lo);
        detail = q.x < 0.78 ? step(0.12, fract(q.x * 4.0 / 0.78)) * step(0.15, fract(q.y * 2.0)) : 0.5 + 0.5 * step(0.5, fract(q.y * 10.0));
      }
    }

    // ---- film thickness by block type + fine structure + a slow shimmer
    float thick = cat == 1.0 ? 560.0 : cat == 2.0 ? 430.0 : cat == 3.0 ? 360.0 : cat == 4.0 ? 300.0 : 480.0;
    thick += detail * 45.0 + (hash(floor(p * 3.0)) - 0.5) * 20.0;
    thick += 18.0 * sin(p.x * 0.3 + p.y * 0.2 + uTime * 0.15);

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = vec3(0.0, 1.0, 0.0);
    float cosI = clamp(dot(N, V), 0.0, 1.0);
    vec3 film = thinFilm(thick, cosI);
    film = film * film; // deepen the interference colours

    vec3 base = vec3(0.025, 0.03, 0.04);
    vec3 col = base + film * vec3(0.5, 0.52, 0.62) * (0.4 + 0.6 * detail);
    // Specular + fake environment
    vec3 H = normalize(uLightDir + V);
    float spec = pow(max(dot(N, H), 0.0), 80.0);
    float fres = pow(1.0 - cosI, 4.0);
    col += spec * film * 1.4 + fres * vec3(0.25, 0.3, 0.35);

    // ---- highlights
    vec3 green = vec3(0.46, 0.73, 0.0);
    float line = 1.0 - smoothstep(0.0, px * 2.0, gpcEdge);
    col += green * uHl.x * (line * 3.0 + (cat >= 3.0 ? 0.12 : 0.0));

    if (smId >= 0.0) {
      float dis = texture2D(uDisabled, vec2((smId + 0.5) / SMS, 0.5)).r;
      float shown = step(smId, uSmReveal);
      float smLine = 1.0 - smoothstep(0.0, px * 2.0, smEdge);
      vec3 c = dis > 0.5 ? vec3(0.35, 0.35, 0.35) : green;
      col += c * uHl.y * shown * (smLine * 1.5 + 0.12);
    }
    float l2Line = 1.0 - smoothstep(0.0, px * 2.0, l2Edge);
    col += vec3(0.9, 1.0, 0.85) * uHl.z * (l2Line * 2.5 + (cat == 2.0 ? 0.2 : 0.0));
    float mcLine = 1.0 - smoothstep(0.0, px * 2.0, mcEdge);
    col += green * uHl.w * (mcLine * 3.0 + (cat == 1.0 ? 0.25 : 0.0));

    // Fine standard-cell rows, visible only when zoomed in
    float rows = step(0.5, fract(p.y * 40.0));
    col *= 1.0 - 0.12 * rows * smoothstep(0.02, 0.004, px);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
