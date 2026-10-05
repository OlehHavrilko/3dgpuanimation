import * as THREE from 'three';
import { BaseLevel, addGlowAttribute, makeInstanceGlow } from '../core/BaseLevel';
import type { CameraKey } from '../core/CameraRig';
import type { LevelMeta, PickHit, TransitionTarget } from '../core/types';
import { mulberry32, range, smoothstep } from '../core/math';
import { canvasTexture, route45 } from '../core/canvas';
import { pickInstancedGroup, pickInstances, pickObject } from '../interaction/pick';
import { splineAt } from '../interaction/FollowTracer';

/**
 * Level 2 — the RTX 5090 FE main board. Units: millimetres.
 * Board top surface is the y = 0 plane, GB202 package at the origin. The FE splits the
 * PCB in three: this compact main board, a PCIe board (gold fingers) and a display board,
 * joined by flex cables.
 */
export const meta: LevelMeta = {
  name: 'Main PCB',
  scale: '10 cm',
  description: 'GB202 GPU ringed by 16 GDDR7 chips (32 GB, 512-bit), with power stages on both edges.',
  unitMeters: 0.001,
  weight: 1,
};

const W = 150;
const D = 115;
const MEM = 16;

export class PcbLevel extends BaseLevel {
  readonly meta = meta;
  private memGlow!: THREE.InstancedBufferAttribute;
  private busUniforms = { uLit: { value: 0 }, uTime: { value: 0 }, uTrace: { value: -1 } };
  private buses: { chip: number; pts: [number, number][] }[] = [];
  private dieBox = new THREE.Box3();
  /** Explore-mode data-flow override: null = scripted, else pulse speed multiplier (0 = off). */
  private flowOverride: number | null = null;
  /** Objects grouped by thermal node. */
  private tp: Record<'gpu' | 'mem' | 'vrm' | 'pcb', THREE.Object3D[]> = { gpu: [], mem: [], vrm: [], pcb: [] };
  private busTime = 0;
  private dieMat!: THREE.MeshStandardMaterial;
  private gpuLight!: THREE.PointLight;
  private target: TransitionTarget = {
    position: new THREE.Vector3(0, 2.2, 0),
    radius: 12,
    approach: new THREE.Vector3(0.12, 0.92, 0.38).normalize(),
  };

  constructor(ctx: ConstructorParameters<typeof BaseLevel>[0]) {
    super(ctx);
    this.near = 0.5;
    this.far = 3000;
    this.bloom = 1.1;
    this.bokeh = 1.4;
    this.sectionNormal = [0, 0, 1];
    this.followCaption =
      'On the board: one of ~30 power phases chops 12 V down to the ~1 V core rail, and the current heads under the GPU package.';
  }

  protected cameraKeys(): CameraKey[] {
    return [
      { t: 0.0, pos: [70, 170, 175], look: [0, 0, -8] },
      { t: 0.25, pos: [-120, 110, 120], look: [-8, 0, -8] },
      { t: 0.5, pos: [-15, 185, 60], look: [0, 0, -4] },
      { t: 0.75, pos: [70, 85, 95], look: [0, 0, 0] },
      { t: 1.0, pos: [32, 62, 58], look: [0, 1, 0] },
    ];
  }

  private memPositions(): [number, number][] {
    const pos: [number, number][] = [];
    const u = [-24, -8, 8, 24];
    u.forEach((x) => pos.push([x, -38]));
    u.forEach((z) => pos.push([40, z]));
    [...u].reverse().forEach((x) => pos.push([x, 38]));
    [...u].reverse().forEach((z) => pos.push([-40, z]));
    return pos; // clockwise order -> sequential light-up walks around the GPU
  }

  protected build() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xe8f5e0, 0x040805, 0.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(120, 260, 140);
    s.add(key);
    const rim = new THREE.DirectionalLight(0x76b900, 1.6);
    rim.position.set(-200, 60, -160);
    s.add(rim);
    this.gpuLight = new THREE.PointLight(0x9cff3a, 0, 120, 1.5);
    this.gpuLight.position.set(0, 18, 0);
    s.add(this.gpuLight);

    const mem = this.memPositions();
    this.buildBoard(mem);
    this.buildComponents(mem);

    // Illustrative heat network. The cooler sits above this board (not drawn at this scale).
    this.thermal = {
      nodes: [
        { id: 'gpu', label: 'GPU die', objects: this.tp.gpu, capacity: 30, power: 450, readout: true },
        { id: 'cooler', label: 'Cooler (above)', objects: [], capacity: 440, toAir: 26, fanCooled: true, readout: true },
        { id: 'mem', label: 'GDDR7', objects: this.tp.mem, capacity: 6, power: 60, readout: true },
        { id: 'vrm', label: 'VRM', objects: this.tp.vrm, capacity: 6, power: 40, readout: true },
        { id: 'pcb', label: 'PCB', objects: this.tp.pcb, capacity: 60, power: 25, toAir: 1.4, readout: true },
      ],
      links: [
        ['gpu', 'cooler', 20],
        ['mem', 'cooler', 1.5],
        ['vrm', 'cooler', 1.6],
        ['mem', 'pcb', 0.6],
        ['vrm', 'pcb', 0.8],
        ['gpu', 'pcb', 0.6],
      ],
      throttleNode: 'gpu',
    };
  }

  private buildBoard(mem: [number, number][]) {
    const cw = 2048;
    const ch = Math.round((cw * D) / W);
    const sx = cw / W;
    const toC = (x: number, z: number): [number, number] => [(x / W + 0.5) * cw, (z / D + 0.5) * ch];
    const rng = mulberry32(2);

    // Memory bus geometry, shared by the colour map and the emissive "data" map.
    const buses = this.buses;
    mem.forEach(([mx, mz], i) => {
      const horizontal = Math.abs(mx) > 33;
      for (let k = 0; k < 9; k++) {
        const o = (k - 4) * 1.1;
        let a: [number, number];
        let b: [number, number];
        if (horizontal) {
          a = [mx - Math.sign(mx) * 7, mz + o];
          b = [Math.sign(mx) * 25, mz * 0.55 + o * 0.9];
        } else {
          a = [mx + o, mz - Math.sign(mz) * 6];
          b = [mx * 0.55 + o * 0.9, Math.sign(mz) * 25];
        }
        buses.push({ chip: i, pts: route45(a[0], a[1], b[0], b[1], 0.35 + 0.3 * rng()) });
      }
    });

    const map = canvasTexture(cw, ch, (g) => {
      const grad = g.createLinearGradient(0, 0, cw, ch);
      grad.addColorStop(0, '#0b3a1d');
      grad.addColorStop(1, '#082b15');
      g.fillStyle = grad;
      g.fillRect(0, 0, cw, ch);

      // Background routing: 45° traces in slightly lighter green.
      g.lineCap = 'round';
      for (let i = 0; i < 300; i++) {
        const x = (rng() - 0.5) * W;
        const z = (rng() - 0.5) * D;
        const pts = route45(x, z, x + (rng() - 0.5) * 80, z + (rng() - 0.5) * 50, rng());
        g.strokeStyle = `rgba(60, 140, 70, ${0.25 + rng() * 0.3})`;
        g.lineWidth = sx * (0.2 + rng() * 0.35);
        g.beginPath();
        pts.forEach(([px, pz], j) => (j ? g.lineTo(...toC(px, pz)) : g.moveTo(...toC(px, pz))));
        g.stroke();
      }
      // Vias
      for (let i = 0; i < 900; i++) {
        const [cx, cy] = toC((rng() - 0.5) * W, (rng() - 0.5) * D);
        g.fillStyle = 'rgba(190, 170, 90, 0.55)';
        g.beginPath();
        g.arc(cx, cy, sx * 0.35, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#06200f';
        g.beginPath();
        g.arc(cx, cy, sx * 0.15, 0, Math.PI * 2);
        g.fill();
      }
      // Memory bus traces (always faintly visible)
      g.strokeStyle = 'rgba(110, 190, 90, 0.7)';
      g.lineWidth = sx * 0.4;
      for (const b of buses) {
        g.beginPath();
        b.pts.forEach(([px, pz], j) => (j ? g.lineTo(...toC(px, pz)) : g.moveTo(...toC(px, pz))));
        g.stroke();
      }
      // Silkscreen
      g.strokeStyle = 'rgba(235, 240, 230, 0.75)';
      g.fillStyle = 'rgba(235, 240, 230, 0.8)';
      g.lineWidth = sx * 0.25;
      g.font = `${Math.round(sx * 2.6)}px monospace`;
      mem.forEach(([mx, mz], i) => {
        const [x0, y0] = toC(mx - 8, mz - 7);
        g.strokeRect(x0, y0, 16 * sx, 14 * sx);
        g.fillText(`M${i + 1}`, x0, y0 - sx * 0.8);
      });
      const [gx, gy] = toC(-27, -27);
      g.strokeRect(gx, gy, 54 * sx, 54 * sx);
      g.fillText('U1  GB202', gx, gy - sx * 1.2);
      g.font = `${Math.round(sx * 3)}px monospace`;
      g.fillText('RTX 5090 FE MAIN', ...toC(-70, 54));
      g.fillText('J1 PCIE FLEX', ...toC(-40, -49));
    });

    // Emissive bus map: R = coverage, G = chip index, B = distance along trace (all scaled by R).
    const busMap = canvasTexture(
      cw,
      ch,
      (g) => {
        g.fillStyle = '#000';
        g.fillRect(0, 0, cw, ch);
        g.lineWidth = sx * 0.45;
        g.lineCap = 'butt';
        for (const b of buses) {
          const total = b.pts.reduce(
            (acc, p, j) => (j ? acc + Math.hypot(p[0] - b.pts[j - 1][0], p[1] - b.pts[j - 1][1]) : 0),
            0,
          );
          let run = 0;
          for (let j = 1; j < b.pts.length; j++) {
            const [ax, az] = b.pts[j - 1];
            const [bx, bz] = b.pts[j];
            const len = Math.hypot(bx - ax, bz - az);
            const steps = Math.max(1, Math.ceil(len / 1.5));
            for (let k = 0; k < steps; k++) {
              const u0 = k / steps;
              const u1 = (k + 1) / steps;
              const d = (run + len * u0) / total;
              g.strokeStyle = `rgb(255, ${Math.round(((b.chip + 0.5) / MEM) * 255)}, ${Math.round(d * 255)})`;
              g.beginPath();
              g.moveTo(...toC(ax + (bx - ax) * u0, az + (bz - az) * u0));
              g.lineTo(...toC(ax + (bx - ax) * u1, az + (bz - az) * u1));
              g.stroke();
            }
            run += len;
          }
        }
      },
      { srgb: false },
    );
    busMap.generateMipmaps = false;
    busMap.minFilter = THREE.LinearFilter;

    const topMat = new THREE.MeshStandardMaterial({ map, roughness: 0.48, metalness: 0.15 });
    const uniforms = this.busUniforms;
    topMat.onBeforeCompile = (shader) => {
      shader.uniforms.uBusMap = { value: busMap };
      shader.uniforms.uLit = uniforms.uLit;
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uTrace = uniforms.uTrace;
      shader.fragmentShader =
        'uniform sampler2D uBusMap;\nuniform float uLit;\nuniform float uTime;\nuniform float uTrace;\n' +
        shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
          vec4 bus = texture2D(uBusMap, vMapUv);
          if (bus.r > 0.03) {
            float idx = bus.g / bus.r * 16.0 - 0.5;
            float d = bus.b / bus.r;
            float on = smoothstep(idx, idx + 0.9, uLit);
            // Signal trace: one channel blazes with fast packets, the rest fade back.
            bool traced = uTrace >= 0.0 && abs(idx - uTrace) < 0.5;
            float gain = uTrace < 0.0 ? 1.0 : traced ? 2.4 : 0.1;
            float speed = traced ? 2.4 : 0.9;
            float pulse = pow(fract(d * 2.5 - uTime * speed + idx * 0.13), 8.0);
            totalEmissiveRadiance += vec3(0.46, 0.95, 0.12) * bus.r * on * gain * (0.35 + 2.4 * pulse);
          }`,
        );
    };
    // Keep the bus texture alive in the material for disposal bookkeeping.
    topMat.userData.busMap = busMap;
    topMat.customProgramCacheKey = () => 'pcb-bus';

    const top = new THREE.Mesh(new THREE.PlaneGeometry(W, D), topMat);
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.01;
    this.scene.add(top);
    this.tp.pcb.push(top);

    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x0a2614, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, 1.6, D), edgeMat);
    body.position.y = -0.8;
    this.scene.add(body);
    this.tp.pcb.push(body);
    // Separate PCIe 5.0 x16 board below the main board's edge, joined by a flex cable.
    const tab = new THREE.Mesh(new THREE.BoxGeometry(92, 1.6, 16), edgeMat);
    tab.position.set(-26, -0.8, -D / 2 - 14);
    this.scene.add(tab);
    this.tp.pcb.push(tab);
    this.pickables.push(
      pickObject(tab, {
        title: 'PCIe board',
        kind: 'Board · interface',
        specs: [
          ['Link', 'PCIe 5.0 × 16'],
          ['Bandwidth', '~64 GB/s each way'],
        ],
        note: 'On the 5090 FE the slot connector lives on its own small board, tied to the main PCB by a flex cable.',
      }),
    );
    const flex = new THREE.Mesh(
      new THREE.BoxGeometry(30, 0.3, 10),
      new THREE.MeshStandardMaterial({ color: 0xc98a2e, roughness: 0.4, metalness: 0.3 }),
    );
    flex.position.set(-15, 0.15, -D / 2 - 2);
    this.scene.add(flex);
    this.pickables.push(pickObject(flex, { title: 'Flex cable', kind: 'Interconnect', specs: [['Joins', 'PCIe board ↔ main PCB']] }));
    this.pickables.push(
      pickObject(body, {
        title: 'Main PCB',
        kind: 'Board · main',
        specs: [
          ['Carries', 'GPU, memory, power'],
          ['Traces shown', '45° routed buses'],
        ],
      }),
    );
  }

  private buildComponents(mem: [number, number][]) {
    const s = this.scene;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const rng = mulberry32(7);

    // GPU package: substrate + bare die
    const substrate = new THREE.Mesh(
      new THREE.BoxGeometry(50, 1.3, 50),
      new THREE.MeshStandardMaterial({ color: 0x2c3a26, roughness: 0.45, metalness: 0.25 }),
    );
    substrate.position.y = 0.65;
    s.add(substrate);
    this.tp.gpu.push(substrate);
    this.pickables.push(
      pickObject(substrate, {
        title: 'GB202 package',
        kind: 'GPU · flip-chip BGA',
        specs: [['Contains', 'die + organic substrate']],
        note: 'Dive in to peel it apart (next scale).',
      }),
    );
    this.dieMat = new THREE.MeshStandardMaterial({
      color: 0x8c96a6,
      metalness: 1,
      roughness: 0.08,
      emissive: 0x76b900,
      emissiveIntensity: 0,
    });
    // GB202: ~750 mm²
    const die = new THREE.Mesh(new THREE.BoxGeometry(29, 0.8, 26), this.dieMat);
    this.dieBox.setFromCenterAndSize(new THREE.Vector3(0, 1.7, 0), new THREE.Vector3(29, 0.8, 26));
    die.position.y = 1.7;
    s.add(die);
    this.tp.gpu.push(die);
    this.pickables.push(
      pickObject(
        die,
        {
          title: 'GB202 die',
          kind: 'GPU · Blackwell',
          specs: [
            ['Transistors', '92.2 billion'],
            ['Area', '~750 mm²'],
            ['Process', 'TSMC 4N'],
          ],
        },
        1,
      ),
    );

    // Memory chips with per-instance glow
    const memMat = makeInstanceGlow(
      new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.42, metalness: 0.3 }),
      0x76b900,
    );
    const memMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(14, 1.1, 12), memMat, MEM);
    mem.forEach(([x, z], i) => {
      const rot = Math.abs(x) > 33 ? Math.PI / 2 : 0;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      memMesh.setMatrixAt(i, m.compose(v.set(x, 0.55, z), q, one));
    });
    this.memGlow = addGlowAttribute(memMesh);
    s.add(memMesh);
    this.tp.mem.push(memMesh);
    this.pickables.push(
      pickInstances(memMesh, (i) => ({
        title: `GDDR7 · M${i + 1}`,
        kind: 'Memory',
        specs: [
          ['Capacity', '2 GB'],
          ['Bus', `32-bit · channel ${i + 1} of 16`],
          ['Data rate', '28 Gbps / pin'],
          ['Bandwidth', '112 GB/s'],
        ],
        note: 'Each chip has its own 32-bit controller on the die; 16 × 112 GB/s = 1.79 TB/s.',
        actions: [{ label: 'Trace signal ▸', run: () => this.ctx.trace(i, 1) }],
      })),
    );

    // Package decoupling caps (tiny MLCCs ringed around the die)
    const mlccMat = new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.5, metalness: 0.2 });
    const mlccGeo = new THREE.BoxGeometry(1.0, 0.5, 0.5);
    const mlccPositions: [number, number, number, number][] = [];
    for (let i = 0; i < 64; i++) {
      const side = i % 4;
      const u = (Math.floor(i / 4) / 15 - 0.5) * 40;
      const off = 18.5;
      const [x, z] = side === 0 ? [u, -off] : side === 1 ? [off, u] : side === 2 ? [u, off] : [-off, u];
      mlccPositions.push([x, 1.55, z, side % 2 ? Math.PI / 2 : 0]);
    }
    // Board-level MLCC field: dense around the GPU and the VRM
    for (let i = 0; i < 700; i++) {
      let x: number;
      let z: number;
      if (i < 380) {
        x = (50 + rng() * 22) * (rng() < 0.5 ? -1 : 1);
        z = (rng() - 0.5) * 80;
      } else {
        x = (rng() - 0.5) * 120;
        z = (43 + rng() * 2.5) * (rng() < 0.5 ? -1 : 1);
      }
      if (Math.abs(z) > D / 2 - 2 || Math.abs(x) > W / 2 - 2) continue;
      mlccPositions.push([x, 0.25, z, rng() < 0.5 ? 0 : Math.PI / 2]);
    }
    const mlcc = new THREE.InstancedMesh(mlccGeo, mlccMat, mlccPositions.length);
    mlccPositions.forEach(([x, y, z, r], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r);
      mlcc.setMatrixAt(i, m.compose(v.set(x, y, z), q, one));
    });
    s.add(mlcc);
    this.tp.pcb.push(mlcc);
    this.pickables.push(
      pickInstances(mlcc, () => ({
        title: 'MLCC capacitor',
        kind: 'Passive · decoupling',
        specs: [['Modelled', String(mlcc.count)]],
        note: 'Tiny ceramic capacitors smooth the current spikes when thousands of cores switch at once.',
      })),
    );

    // Power delivery: two rows of chokes + power stages along the long edges
    const chokes = new THREE.InstancedMesh(
      new THREE.BoxGeometry(7, 5, 7),
      new THREE.MeshStandardMaterial({ color: 0x3a3e44, metalness: 0.7, roughness: 0.38 }),
      28,
    );
    const stages = new THREE.InstancedMesh(
      new THREE.BoxGeometry(5, 1, 4),
      new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.5 }),
      28,
    );
    for (let i = 0; i < 28; i++) {
      const row = i < 14 ? -1 : 1;
      const x = -62 + (i % 14) * 8.4;
      chokes.setMatrixAt(i, m.makeTranslation(x, 2.5, row * 51.5));
      stages.setMatrixAt(i, m.makeTranslation(x, 0.5, row * 44.5));
    }
    s.add(chokes, stages);
    this.tp.vrm.push(chokes, stages);
    this.pickables.push(
      pickInstances(chokes, (i) => ({
        title: `Power phase ${i + 1}`,
        kind: 'Power delivery · choke',
        specs: [['Input', '12 V'], ['Output', '~1 V']],
      })),
      pickInstances(stages, () => ({
        title: 'Power stage (DrMOS)',
        kind: 'Power delivery · switch',
        specs: [['Role', 'switches 12 V at ~1 MHz']],
      })),
    );

    const polyGeo = new THREE.CylinderGeometry(2.6, 2.6, 5.5, 20);
    const polys = new THREE.InstancedMesh(
      polyGeo,
      new THREE.MeshStandardMaterial({ color: 0x9ea4ad, metalness: 0.9, roughness: 0.25 }),
      12,
    );
    for (let i = 0; i < 12; i++) {
      polys.setMatrixAt(i, m.makeTranslation(i < 6 ? -66 : 66, 2.75, -27 + (i % 6) * 11));
    }
    s.add(polys);
    this.tp.vrm.push(polys);
    this.pickables.push(pickInstances(polys, () => ({ title: 'Polymer capacitor', kind: 'Passive · bulk', specs: [['Role', 'input/output filtering']] })));

    // PCIe 5.0 x16 gold fingers on the separate PCIe board (with the x1 key notch)
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc35a, metalness: 1, roughness: 0.2 });
    const fingers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.08, 6.5), gold, 82);
    for (let i = 0; i < 82; i++) {
      const x = -68 + i * 1.0 + (i >= 11 ? 2.5 : 0);
      fingers.setMatrixAt(i, m.makeTranslation(x, 0.04, -D / 2 - 18.5));
    }
    s.add(fingers);
    this.tp.pcb.push(fingers);
    this.pickables.push(
      pickInstancedGroup(fingers, {
        title: 'PCIe gold fingers',
        kind: 'Interface',
        specs: [
          ['Contacts', '82 per side'],
          ['Generation', 'PCIe 5.0 × 16'],
        ],
      }),
    );

    // 12V-2x6 power connector
    const plastic = new THREE.MeshStandardMaterial({ color: 0x101113, roughness: 0.6 });
    const conn = new THREE.Mesh(new THREE.BoxGeometry(19, 9, 8), plastic);
    conn.position.set(15, 4.5, D / 2 - 4);
    s.add(conn);
    this.tp.vrm.push(conn);
    this.pickables.push(pickObject(conn, { title: '12V-2x6 connector', kind: 'Power input', specs: [['Rated', '600 W']] }));

    this.controls = [
      {
        kind: 'choice',
        label: 'Data flow',
        options: ['Off', 'Slow', 'Realtime', 'Burst'],
        value: 'Realtime',
        onChange: (v) => (this.flowOverride = { Off: 0, Slow: 0.3, Realtime: 1, Burst: 2.6 }[v] ?? 1),
      },
    ];
  }

  protected animate(t: number, dt: number, time: number) {
    // Memory chips light up one after another, walking clockwise around the GPU.
    const flow = this.flowOverride;
    const lit = this.ctx.journey.trace ? MEM : flow === null ? range(t, 0.18, 0.66) * MEM : flow > 0 ? MEM : 0;
    this.busTime += dt * (flow ?? 1);
    const trace = this.ctx.journey.trace;
    this.busUniforms.uTrace.value = trace ? trace.chip : -1;
    for (let i = 0; i < MEM; i++) {
      const on = smoothstep(i, i + 0.9, lit);
      this.memGlow.array[i] = trace
        ? trace.chip === i
          ? 0.75 + 0.25 * Math.sin(time * 8)
          : 0.02
        : on * (0.16 + 0.06 * Math.sin(time * 5 + i * 1.3));
    }
    this.memGlow.needsUpdate = true;
    this.busUniforms.uLit.value = lit;
    this.busUniforms.uTime.value = this.busTime;
    const all = smoothstep(0.62, 0.8, t);
    this.dieMat.emissiveIntensity = all * (0.25 + 0.1 * Math.sin(time * 3));
    this.gpuLight.intensity = all * 900;

    this.caption =
      t < 0.18
        ? 'The board is a city: one GPU, sixteen memory chips, power everywhere'
        : t < 0.66
          ? `GDDR7 online: ${Math.min(MEM, Math.floor(lit + 0.1))} / 16 × 2 GB — 28 Gbps each`
          : t < 0.9
            ? '1.79 terabytes a second, all of it converging on GB202'
            : 'Into the GPU package';
  }

  /** Signal trace on the board: the chip, its 32-bit bus, then the GPU package. */
  tracePlan(): PickHit[] | null {
    const tr = this.ctx.journey.trace;
    if (!tr) return null;
    const c = tr.chip;
    const [mx, mz] = this.memPositions()[c];
    const side = Math.abs(mx) > 33;
    const chipBox = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(mx, 0.55, mz),
      new THREE.Vector3(side ? 12 : 14, 1.1, side ? 14 : 12),
    );
    const busBox = new THREE.Box3();
    for (const b of this.buses) {
      if (b.chip !== c) continue;
      for (const [x, z] of b.pts) busBox.expandByPoint(new THREE.Vector3(x, 0, z));
    }
    busBox.max.y = 1;
    return [
      {
        key: `trace-chip${c}`,
        box: chipBox,
        info: {
          title: `GDDR7 · M${c + 1}`,
          kind: 'Memory',
          specs: [
            ['Width', '32 bits'],
            ['Per pin', '28 Gbps · PAM3'],
            ['Per chip', '112 GB/s'],
          ],
          note: 'A read starts here: the DRAM drives 32 data lines at once, three voltage levels per symbol (PAM3).',
        },
      },
      {
        key: `trace-bus${c}`,
        box: busBox,
        info: {
          title: `Memory bus · channel ${c + 1}`,
          kind: 'PCB traces',
          specs: [
            ['Length', 'a few cm'],
            ['Routing', 'length-matched, impedance-controlled'],
          ],
          note: 'Every trace in the channel is tuned to the same length so all 32 bits arrive within picoseconds of each other.',
        },
      },
      {
        key: 'trace-gpu',
        box: this.dieBox.clone(),
        info: {
          title: 'GB202 package',
          kind: 'Arrival',
          specs: [
            ['Path', 'BGA ball → substrate → C4 bump'],
            ['Destination', `memory controller ${c + 1}`],
          ],
          note: 'The signal drops through the package into the die. Follow it inside.',
          actions: [{ label: 'Follow into the die ▸', run: () => this.ctx.go(3) }],
        },
      },
    ];
  }

  onExploreChange(active: boolean) {
    if (active) {
      this.flowOverride = 1;
      const c = this.controls[0];
      if (c.kind === 'choice') c.value = 'Realtime';
    } else {
      this.flowOverride = null;
    }
  }

  private readonly followPath: [number, number, number][] = [
    [15, 9, D / 2 - 4],
    [15, 1.5, 47],
    [-10, 1.5, 44.5],
    [-34, 1.0, 44.5],
    [-30, 0.4, 22],
    [-8, 1.8, 6],
    [0, 2.2, 0],
  ];

  followPoint(t: number, out: THREE.Vector3) {
    return splineAt(this.followPath, smoothstep(0.06, 0.98, t), out);
  }

  getTransitionTarget() {
    return this.target;
  }

  dispose() {
    this.scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
      (mat?.userData?.busMap as THREE.Texture | undefined)?.dispose();
    });
    super.dispose();
  }
}
