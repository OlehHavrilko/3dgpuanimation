import * as THREE from 'three';
import { BaseLevel, setControlValue } from '../core/BaseLevel';
import type { CameraKey } from '../core/CameraRig';
import type { LevelMeta, TransitionTarget } from '../core/types';
import { mulberry32, smoothstep, smootherstep } from '../core/math';
import { canvasTexture, route45 } from '../core/canvas';
import { pickInstancedGroup, pickObject } from '../interaction/pick';

/**
 * Level 3 — the GB202 package. Units: millimetres.
 * A flip-chip BGA: bare die on micro-bumps, organic build-up substrate around a
 * glass-fibre core, and a field of solder balls underneath. Layer thicknesses are
 * exaggerated ~5x so they read on screen.
 */
export const meta: LevelMeta = {
  name: 'GB202 package',
  scale: '5 cm',
  description: 'Flip-chip BGA: the die sits face-down on an organic substrate that fans its pins out to the board.',
  unitMeters: 0.001,
  weight: 1,
};

/** Inspector text per substrate layer type. */
const LAYER_NOTES: Record<string, [string, string][]> = {
  'Solder mask': [
    ['Material', 'epoxy resist'],
    ['Role', 'protects bottom copper'],
  ],
  'Top solder mask': [
    ['Material', 'epoxy resist'],
    ['Role', 'protects top copper'],
  ],
  ABF: [
    ['Material', 'Ajinomoto build-up film'],
    ['Role', 'dielectric between copper layers'],
  ],
  'Glass-fibre core + PTH': [
    ['Material', 'glass-weave epoxy'],
    ['Vias', 'plated through-holes'],
    ['Role', 'stiffness'],
  ],
};

const SIZE = 50;
const GAP = 4.2; // exploded spacing between layers

interface Layer {
  name: string;
  thickness: number;
  mesh: THREE.Object3D;
  baseY: number;
}

export class PackageLevel extends BaseLevel {
  readonly meta = meta;
  private layers: Layer[] = [];
  private balls!: THREE.InstancedMesh;
  private ballsBaseY = 0;
  private dieGroup = new THREE.Group();
  private dieBaseY = 0;
  private bumps!: THREE.InstancedMesh;
  private bumpsBaseY = 0;
  private target: TransitionTarget = {
    position: new THREE.Vector3(),
    radius: 11,
    approach: new THREE.Vector3(0.1, 0.95, 0.3).normalize(),
  };

  constructor(ctx: ConstructorParameters<typeof BaseLevel>[0]) {
    super(ctx);
    this.near = 0.2;
    this.far = 2000;
    this.bloom = 1.0;
    this.bokeh = 1.6;
    this.sectionNormal = [0, 0, 1];
    this.followCaption =
      'Up through a solder ball, the copper layers of the substrate and a C4 micro-bump: now it is inside the silicon.';
  }

  protected cameraKeys(): CameraKey[] {
    const top = this.topAtFullPeel();
    return [
      { t: 0.0, pos: [55, 70, 85], look: [0, 0, 0] },
      { t: 0.3, pos: [95, 30, 70], look: [0, 12, 0] },
      { t: 0.55, pos: [70, 12, -80], look: [0, 16, 0] },
      { t: 0.78, pos: [-40, top + 50, 55], look: [0, top - 6, 0] },
      { t: 1.0, pos: [8, top + 36, 26], look: [0, top, 0] },
    ];
  }

  /** y of the die's top surface when the stack is fully peeled. */
  private topAtFullPeel() {
    // balls (0.3) + 9 substrate layers (1.98) + bumps/underfill (0.3), die lifted GAP * 10.4, die top +1.08
    return 0.3 + 1.98 + 0.3 + GAP * 10.4 + 1.08;
  }

  protected build() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xe8f5e0, 0x050806, 0.45));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(60, 120, 80);
    s.add(key);
    const rim = new THREE.DirectionalLight(0x76b900, 2.0);
    rim.position.set(-80, 30, -60);
    s.add(rim);
    const glow = new THREE.PointLight(0x9cff3a, 160, 140, 1.4);
    glow.position.set(0, 25, 0);
    s.add(glow);

    const routingA = this.routingTexture(11, false);
    const routingB = this.routingTexture(23, true);

    const copperMat = (map: THREE.Texture) =>
      new THREE.MeshStandardMaterial({ map, metalness: 0.75, roughness: 0.35, color: 0xffffff });
    const abf = new THREE.MeshPhysicalMaterial({
      color: 0xd8c27a,
      roughness: 0.35,
      metalness: 0,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x3a2a14, roughness: 0.6, map: this.coreTexture() });
    const maskMat = new THREE.MeshStandardMaterial({ color: 0x2d4a1e, roughness: 0.45, metalness: 0.1 });

    const stack: [string, number, THREE.Material][] = [
      ['Solder mask', 0.1, maskMat],
      ['Copper L8', 0.12, copperMat(routingB)],
      ['ABF', 0.2, abf],
      ['Copper L7', 0.12, copperMat(routingA)],
      ['Glass-fibre core + PTH', 0.8, coreMat],
      ['Copper L2', 0.12, copperMat(routingB)],
      ['ABF', 0.2, abf],
      ['Copper L1', 0.12, copperMat(routingA)],
      ['Top solder mask', 0.1, maskMat],
    ];
    let y = 0.3; // above the balls
    stack.forEach(([name, th, mat]) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(SIZE, th, SIZE), mat);
      mesh.position.y = y + th / 2;
      this.layers.push({ name, thickness: th, mesh, baseY: y + th / 2 });
      s.add(mesh);
      const copper = name.startsWith('Copper');
      this.pickables.push(
        pickObject(mesh, {
          title: name,
          kind: 'Package substrate · layer',
          specs: copper
            ? [
                ['Material', 'copper'],
                ['Role', 'fans die signals out to the balls'],
                ['Drawn thickness', `${th} mm (×5)`],
              ]
            : [...(LAYER_NOTES[name] ?? []), ['Drawn thickness', `${th} mm (×5)`]],
        }),
      );
      y += th;
    });

    // Land-side capacitors on the top surface, ringed around the die
    const capMat = new THREE.MeshStandardMaterial({ color: 0xa47c4c, roughness: 0.45, metalness: 0.3 });
    const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1.0, 0.5, 0.5), capMat, 120);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 120; i++) {
      const side = i % 4;
      const u = (Math.floor(i / 4) / 29 - 0.5) * 42;
      const off = 19.5 + (i % 8 < 4 ? 0 : 1.5);
      const [x, z] = side === 0 ? [u, -off] : side === 1 ? [off, u] : side === 2 ? [u, off] : [-off, u];
      m.makeRotationY(side % 2 ? Math.PI / 2 : 0).setPosition(x, 0.25, z);
      caps.setMatrixAt(i, m);
    }
    const topLayer = this.layers[this.layers.length - 1].mesh;
    caps.position.y = 0.05;
    topLayer.add(caps);

    // C4 micro-bumps between die and substrate
    const bumpGeo = new THREE.SphereGeometry(0.16, 8, 6);
    const bumpMat = new THREE.MeshStandardMaterial({ color: 0xd8dde3, metalness: 1, roughness: 0.25 });
    const nx = 58;
    const nz = 52;
    this.bumps = new THREE.InstancedMesh(bumpGeo, bumpMat, nx * nz);
    let k = 0;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        m.makeTranslation((i - (nx - 1) / 2) * 0.48, 0, (j - (nz - 1) / 2) * 0.48);
        this.bumps.setMatrixAt(k++, m);
      }
    }
    this.bumpsBaseY = y + 0.15;
    this.bumps.position.y = this.bumpsBaseY;
    s.add(this.bumps);
    this.pickables.push(
      pickInstancedGroup(this.bumps, {
        title: 'C4 micro-bumps',
        kind: 'Die attach',
        specs: [
          ['Modelled', (nx * nz).toLocaleString('en-US')],
          ['Pitch (drawn)', '0.48 mm'],
        ],
        note: 'The die is flipped face-down: these solder bumps carry every signal and every amp between silicon and substrate.',
      }),
    );

    // Die: ~29 x 26 mm (~750 mm²) bare silicon + underfill
    const underfill = new THREE.Mesh(
      new THREE.BoxGeometry(30.2, 0.3, 27.2),
      new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.7, transparent: true, opacity: 0.6 }),
    );
    underfill.position.y = 0.15;
    this.dieGroup.add(underfill);
    const die = new THREE.Mesh(
      new THREE.BoxGeometry(29, 0.78, 26),
      new THREE.MeshStandardMaterial({ color: 0x5d6674, metalness: 1, roughness: 0.16 }),
    );
    die.position.y = 0.3 + 0.39;
    this.dieGroup.add(die);
    this.dieBaseY = y + 0.3;
    this.dieGroup.position.y = this.dieBaseY;
    s.add(this.dieGroup);
    this.pickables.push(
      pickObject(
        this.dieGroup,
        {
          title: 'GB202 die',
          kind: 'Silicon · Blackwell',
          specs: [
            ['Area', '~750 mm²'],
            ['Transistors', '92.2 billion'],
            ['Process', 'TSMC 4N'],
          ],
          note: 'Dive in to see the floorplan (next scale).',
        },
        1,
      ),
    );

    // BGA solder balls under the substrate (~5000)
    const n = 72;
    const pitch = 0.66;
    const ballGeo = new THREE.SphereGeometry(0.27, 8, 6); // ~5000 instances: keep it light
    const ballMat = new THREE.MeshStandardMaterial({ color: 0xc9cdd3, metalness: 1, roughness: 0.28 });
    const pos: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const ci = i - (n - 1) / 2;
        const cj = j - (n - 1) / 2;
        if (Math.abs(ci) < 5 && Math.abs(cj) < 5) continue; // depopulated centre
        if (Math.abs(ci) + Math.abs(cj) > n - 6) continue; // chamfered corners
        pos.push([ci * pitch, cj * pitch]);
      }
    }
    this.balls = new THREE.InstancedMesh(ballGeo, ballMat, pos.length);
    pos.forEach(([x, z], i) => this.balls.setMatrixAt(i, m.makeTranslation(x, 0, z)));
    this.ballsBaseY = 0.15;
    this.balls.position.y = this.ballsBaseY;
    s.add(this.balls);
    this.ballCount = pos.length;
    this.pickables.push(
      pickInstancedGroup(this.balls, {
        title: 'BGA solder balls',
        kind: 'Package → board',
        specs: [
          ['Modelled', pos.length.toLocaleString('en-US')],
          ['Pitch (drawn)', `${pitch} mm`],
        ],
        note: 'Power, ground and I/O: most balls carry current to and from the board, not data.',
      }),
    );

    this.controls = [
      {
        kind: 'slider',
        label: 'Peel apart',
        min: 0,
        max: 100,
        step: 1,
        value: 0,
        format: (v) => `${Math.round(v)}%`,
        onInput: (v) => (this.peelOverride = v / 100),
      },
    ];
  }

  private ballCount = 0;
  private peelOverride: number | null = null;
  private lastPeel = 0;

  private routingTexture(seed: number, dense: boolean) {
    const rng = mulberry32(seed);
    return canvasTexture(1024, 1024, (g, w, h) => {
      g.fillStyle = '#21160c';
      g.fillRect(0, 0, w, h);
      g.lineCap = 'round';
      const sc = w / SIZE;
      const cnt = dense ? 900 : 520;
      for (let i = 0; i < cnt; i++) {
        // Fan-out: traces radiate from the die area toward the edges
        const a = rng() * Math.PI * 2;
        const r0 = 6 + rng() * 8;
        const r1 = r0 + 6 + rng() * 16;
        const x0 = Math.cos(a) * r0 + SIZE / 2;
        const y0 = Math.sin(a) * r0 + SIZE / 2;
        const x1 = Math.cos(a) * r1 + SIZE / 2;
        const y1 = Math.sin(a) * r1 + SIZE / 2;
        const pts = route45(x0, y0, x1, y1, rng());
        g.strokeStyle = `rgba(222, 140, 74, ${0.55 + rng() * 0.45})`;
        g.lineWidth = sc * (0.08 + rng() * 0.08);
        g.beginPath();
        pts.forEach(([x, y], j) => (j ? g.lineTo(x * sc, y * sc) : g.moveTo(x * sc, y * sc)));
        g.stroke();
        g.fillStyle = '#e6a066';
        g.beginPath();
        g.arc(x1 * sc, y1 * sc, sc * 0.18, 0, Math.PI * 2);
        g.fill();
      }
      // Power/ground plane hatch in the corners
      g.fillStyle = 'rgba(200, 120, 60, 0.35)';
      for (let i = 0; i < 4; i++) {
        const x = i % 2 ? w - w * 0.22 : 0;
        const y = i < 2 ? 0 : h - h * 0.22;
        g.fillRect(x, y, w * 0.22, h * 0.22);
      }
    });
  }

  private coreTexture() {
    const rng = mulberry32(5);
    return canvasTexture(1024, 1024, (g, w, h) => {
      g.fillStyle = '#5a4424';
      g.fillRect(0, 0, w, h);
      // glass weave
      g.strokeStyle = 'rgba(255, 230, 170, 0.08)';
      g.lineWidth = 6;
      for (let i = 0; i < w; i += 14) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i, h);
        g.stroke();
        g.beginPath();
        g.moveTo(0, i);
        g.lineTo(w, i);
        g.stroke();
      }
      // plated through-holes
      for (let i = 0; i < 700; i++) {
        const x = rng() * w;
        const y = rng() * h;
        g.fillStyle = '#d9894c';
        g.beginPath();
        g.arc(x, y, 5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#1a1108';
        g.beginPath();
        g.arc(x, y, 2.5, 0, Math.PI * 2);
        g.fill();
      }
    });
  }

  protected animate(t: number, dt: number) {
    const scripted = smootherstep(0.12, 0.55, t);
    const e =
      this.peelOverride === null ? scripted : this.lastPeel + (this.peelOverride - this.lastPeel) * Math.min(1, dt * 8);
    this.lastPeel = e;
    // Peel: every layer rises by its index; die and bumps ride on top.
    this.layers.forEach((l, i) => (l.mesh.position.y = l.baseY + e * GAP * (i + 1)));
    const n = this.layers.length;
    this.bumps.position.y = this.bumpsBaseY + e * GAP * (n + 0.7);
    this.dieGroup.position.y = this.dieBaseY + e * GAP * (n + 1.4);
    this.balls.position.y = this.ballsBaseY - e * 2.5;
    this.target.position.set(0, this.dieGroup.position.y + 1.08, 0);

    const layerName = this.layers[Math.min(n - 1, Math.floor((1 - Math.min(1, (t - 0.25) / 0.35)) * n))]?.name;
    this.caption =
      t < 0.12
        ? 'Flip-chip BGA: GB202 die on an organic substrate'
        : t < 0.25
          ? 'Peeling the substrate apart (thicknesses ×5)'
          : t < 0.6
            ? `Build-up stack · ${layerName}`
            : t < 0.8
              ? `${this.ballCount.toLocaleString('en-US')} BGA balls below · ~${(58 * 52).toLocaleString('en-US')} C4 bumps above`
              : 'Die: TSMC 4N · ~750 mm² · 92.2 billion transistors';
  }

  onExploreChange(active: boolean) {
    if (active) setControlValue(this.controls[0], Math.round(this.lastPeel * 100));
    else this.peelOverride = null;
  }

  /** Straight up through one solder ball, the substrate stack and a C4 bump into the die. */
  followPoint(t: number, out: THREE.Vector3) {
    const u = smoothstep(0.06, 0.98, t);
    const x = 4.62;
    const bottom = this.balls.position.y - 1.5;
    const top = this.dieGroup.position.y + 1.08;
    if (u < 0.85) return out.set(x, bottom + (top - bottom) * (u / 0.85), x);
    const k = (u - 0.85) / 0.15;
    return out.set(x * (1 - k), top, x * (1 - k));
  }

  getTransitionTarget() {
    return this.target;
  }
}
