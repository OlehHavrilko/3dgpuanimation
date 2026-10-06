import * as THREE from 'three';
import { BaseLevel, addGlowAttribute, makeInstanceGlow } from '../../core/BaseLevel';
import type { CameraKey } from '../../core/CameraRig';
import type { LevelMeta, TransitionTarget } from '../../core/types';
import { mulberry32, pickByT, smootherstep, smoothstep } from '../../core/math';
import { canvasTexture } from '../../core/canvas';
import { content } from '../../content';
import { pickInstancedGroup, pickObject } from '../../interaction/pick';
import { pam3PulseMaterial, studioLights } from './common';

/**
 * Memory branch 1 — one GDDR7 chip on the RTX 5090 board. Units: millimetres.
 * Board top surface at y = 0, the chip at the origin, the GPU package towards -z. Chips sit
 * 16 mm apart, as on the main PCB level. The chip lifts off its balls (coloured by channel),
 * then its mould turns see-through to show the substrate and the DRAM die.
 */
const C = content.memory.chip;

export const meta: LevelMeta = {
  ...C.meta,
  unitMeters: 0.001,
  weight: 1,
};

/** Package footprint (representative: the GDDR7 package size is not published per chip). */
const PW = 14;
const PD = 12;
const SUB = 0.26;
const MOULD = 0.78;
const BALL_R = 0.2;
/** 266 balls: 19 rows × 14 columns. */
const ROWS = 19;
const COLS = 14;
const DIE = { w: 10.2, d: 7.4, h: 0.1 };
const CHANNEL_COLORS = [0x3aa8ff, 0xb6ff3a, 0xffb43a, 0xff5ad2];

/** The chip the branch was opened from on the board level (`?chip=1..16`), M5 by default. */
export function chipNumber() {
  const n = Number(new URLSearchParams(location.search).get('chip'));
  return Number.isInteger(n) && n >= 1 && n <= 16 ? n : 5;
}

export class ChipLevel extends BaseLevel {
  readonly meta = meta;
  private chip = new THREE.Group();
  private mouldMat!: THREE.MeshPhysicalMaterial;
  private topMat!: THREE.MeshStandardMaterial;
  private balls!: THREE.InstancedMesh;
  private ballChannel: number[] = [];
  private ballColor = new THREE.Color();
  private dieGlow!: THREE.MeshStandardMaterial;
  private pulses!: ReturnType<typeof pam3PulseMaterial>;
  private neighbourGlow!: THREE.InstancedBufferAttribute;
  private target: TransitionTarget = {
    position: new THREE.Vector3(),
    radius: 4,
    approach: new THREE.Vector3(0.08, 0.96, 0.26).normalize(),
  };

  constructor(ctx: ConstructorParameters<typeof BaseLevel>[0]) {
    super(ctx);
    this.near = 0.1;
    this.far = 800;
    this.bloom = 1.1;
    this.bokeh = 1.3;
    this.sectionNormal = [0, 0, 1];
  }

  /** Height of the chip above the board at full lift. */
  private static readonly LIFT = 5;

  protected cameraKeys(): CameraKey[] {
    const L = ChipLevel.LIFT;
    const top = L + BALL_R * 2 + SUB + MOULD;
    return [
      { t: 0, pos: [34, 30, 40], look: [0, 0, -8] },
      { t: 0.2, pos: [-26, 16, 26], look: [0, 0, -10] },
      { t: 0.42, pos: [18, 6, 24], look: [0, L * 0.5, 0] },
      { t: 0.6, pos: [-6, 2.5, 22], look: [0, L * 0.7, 0] },
      { t: 0.8, pos: [16, top + 16, 14], look: [0, top - 0.6, 0] },
      { t: 1.0, pos: [3, top + 12, 7], look: [0, top - 0.6, 0] },
    ];
  }

  protected build() {
    const s = this.scene;
    studioLights(s, 40);

    this.buildBoard();
    this.buildChip();
  }

  private buildBoard() {
    const s = this.scene;
    const BW = 90;
    const BD = 70;
    const rng = mulberry32(31);
    const tex = canvasTexture(1024, 800, (g, w, h) => {
      g.fillStyle = '#0a1a10';
      g.fillRect(0, 0, w, h);
      // Faint inner-layer routing seen through the solder mask.
      g.strokeStyle = 'rgba(80, 150, 70, 0.18)';
      g.lineWidth = 2;
      for (let i = 0; i < 160; i++) {
        const x = rng() * w;
        const y = rng() * h;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (rng() - 0.5) * 200, y + (rng() - 0.5) * 30);
        g.stroke();
      }
      // Via field.
      g.fillStyle = 'rgba(190, 150, 90, 0.5)';
      for (let i = 0; i < 900; i++) {
        g.beginPath();
        g.arc(rng() * w, rng() * h, 1.6, 0, Math.PI * 2);
        g.fill();
      }
    });
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(BW, 1.6, BD),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.15 }),
    );
    board.position.set(0, -0.8, -12);
    s.add(board);

    // GPU package edge towards -z: dark substrate, silver die edge.
    const gpu = new THREE.Group();
    const sub = new THREE.Mesh(
      new THREE.BoxGeometry(60, 1.6, 30),
      new THREE.MeshStandardMaterial({ color: 0x1d2a17, roughness: 0.5, metalness: 0.2 }),
    );
    sub.position.y = 1.1;
    gpu.add(sub);
    const die = new THREE.Mesh(
      new THREE.BoxGeometry(29, 0.8, 18),
      new THREE.MeshStandardMaterial({ color: 0x5d6674, metalness: 1, roughness: 0.18 }),
    );
    die.position.set(0, 2.3, 4);
    gpu.add(die);
    gpu.position.set(0, 0, -44);
    s.add(gpu);
    this.pickables.push(pickObject(gpu, C.entities.gpu));

    // Neighbouring GDDR7 chips, 16 mm apart as on the board level.
    const neighbourMat = makeInstanceGlow(
      new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.62, metalness: 0.05 }),
      0x9cff3a,
    );
    const neighbours = new THREE.InstancedMesh(new THREE.BoxGeometry(PW, 1.2, PD), neighbourMat, 2);
    const m = new THREE.Matrix4();
    [-16, 16].forEach((x, i) => neighbours.setMatrixAt(i, m.makeTranslation(x, 0.6, 0)));
    this.neighbourGlow = addGlowAttribute(neighbours);
    s.add(neighbours);
    this.pickables.push(pickInstancedGroup(neighbours, C.entities.neighbour));

    // Memory bus: 32 data lines per chip, from the chip edge to the GPU package.
    this.pulses = pam3PulseMaterial(1.6);
    const lines = 32;
    const chips = [-16, 0, 16];
    const traces = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.pulses.mat, lines * chips.length);
    const z0 = -PD / 2 - 0.5;
    const z1 = -29;
    let k = 0;
    for (const cx of chips) {
      for (let i = 0; i < lines; i++) {
        const x = cx + (i - (lines - 1) / 2) * 0.34;
        m.compose(
          new THREE.Vector3(x, 0.02, (z0 + z1) / 2),
          new THREE.Quaternion(),
          new THREE.Vector3(0.12, 0.04, z0 - z1),
        );
        traces.setMatrixAt(k++, m);
      }
    }
    s.add(traces);
    this.pickables.push(pickInstancedGroup(traces, C.entities.traces));
  }

  private buildChip() {
    const chip = this.chip;
    this.scene.add(chip);

    // Balls under the substrate.
    const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.9, roughness: 0.3 });
    const count = ROWS * COLS;
    this.balls = new THREE.InstancedMesh(new THREE.SphereGeometry(BALL_R, 10, 8), ballMat, count);
    const m = new THREE.Matrix4();
    const pitchX = (PW - 2.4) / (COLS - 1);
    const pitchZ = (PD - 1.4) / (ROWS - 1);
    let k = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        // Two ball fields with a gap down the middle, as on GDDR packages.
        const gap = c >= COLS / 2 ? 0.9 : -0.9;
        const x = (c - (COLS - 1) / 2) * pitchX * 0.86 + gap;
        const z = (r - (ROWS - 1) / 2) * pitchZ;
        m.makeTranslation(x, BALL_R, z);
        this.balls.setMatrixAt(k, m);
        this.ballChannel.push((x < 0 ? 0 : 1) + (z < 0 ? 0 : 2));
        this.balls.setColorAt(k, this.ballColor.set(0xd2d6dc));
        k++;
      }
    }
    chip.add(this.balls);
    this.pickables.push(pickInstancedGroup(this.balls, C.entities.balls(count)));

    // Substrate.
    const sub = new THREE.Mesh(
      new THREE.BoxGeometry(PW, SUB, PD),
      new THREE.MeshStandardMaterial({ color: 0x1c2116, roughness: 0.55, metalness: 0.2 }),
    );
    sub.position.y = BALL_R * 2 + SUB / 2;
    chip.add(sub);
    this.pickables.push(pickObject(sub, C.entities.substrate));

    // DRAM die, with its centre strip drawn on top.
    const dieTex = canvasTexture(512, 372, (g, w, h) => {
      g.fillStyle = '#1b2029';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#2a3446';
      const strip = h * 0.16;
      for (let i = 0; i < 2; i++) {
        const y0 = i ? (h + strip) / 2 : 0;
        for (let bx = 0; bx < 8; bx++)
          for (let by = 0; by < 2; by++)
            g.fillRect(
              6 + (bx * (w - 12)) / 8,
              y0 + 6 + (by * ((h - strip) / 2 - 12)) / 2,
              (w - 12) / 8 - 6,
              (h - strip) / 4 - 9,
            );
      }
      g.fillStyle = '#4c5563';
      g.fillRect(0, (h - strip) / 2, w, strip);
      g.fillStyle = '#d9b46a';
      for (let i = 0; i < 40; i++) g.fillRect(14 + i * ((w - 28) / 40), h / 2 - 4, 6, 8);
    });
    this.dieGlow = new THREE.MeshStandardMaterial({
      map: dieTex,
      metalness: 0.3,
      roughness: 0.4,
      emissive: 0x9cff3a,
      emissiveIntensity: 0,
    });
    const die = new THREE.Mesh(new THREE.BoxGeometry(DIE.w, DIE.h, DIE.d), this.dieGlow);
    die.position.y = BALL_R * 2 + SUB + 0.06 + DIE.h / 2;
    chip.add(die);
    this.pickables.push(pickObject(die, C.entities.die, 2));

    // Mould: black, turns see-through for the X-ray beat. Marking on top.
    this.mouldMat = new THREE.MeshPhysicalMaterial({
      color: 0x0a0b0d,
      roughness: 0.62,
      metalness: 0.05,
      clearcoat: 0.08,
      transparent: true,
      opacity: 1,
    });
    const mark = canvasTexture(512, 440, (g, w, h) => {
      g.fillStyle = '#111316';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(200, 205, 210, 0.55)';
      g.font = '600 46px system-ui, sans-serif';
      g.fillText('GDDR7', 40, 120);
      g.font = '500 30px system-ui, sans-serif';
      g.fillText('16Gb · x32 · PAM3', 40, 175);
      g.fillText('266 FBGA', 40, 220);
      g.beginPath();
      g.arc(52, h - 52, 14, 0, Math.PI * 2);
      g.fill();
    });
    this.topMat = new THREE.MeshStandardMaterial({ map: mark, roughness: 0.5, transparent: true });
    const side = this.mouldMat;
    const mould = new THREE.Mesh(new THREE.BoxGeometry(PW, MOULD, PD), [side, side, this.topMat, side, side, side]);
    mould.position.y = BALL_R * 2 + SUB + MOULD / 2;
    mould.renderOrder = 2;
    chip.add(mould);
    this.pickables.push(pickObject(mould, C.entities.chip(chipNumber())));
  }

  protected animate(t: number, dt: number, time: number) {
    const L = ChipLevel.LIFT;
    const lift = smootherstep(0.3, 0.5, t) * L;
    this.chip.position.y = lift;

    // Data keeps flowing; it calms down once we are inside the package.
    this.pulses.uniforms.uTime.value = time;
    this.pulses.uniforms.uSpeed.value = 6;
    this.pulses.uniforms.uOn.value = 1 - 0.85 * smoothstep(0.6, 0.8, t);

    // Channels: the balls take their channel colour while the chip is lifted.
    const ch = smoothstep(0.4, 0.52, t) * (1 - smoothstep(0.7, 0.8, t));
    const silver = new THREE.Color(0xd2d6dc);
    for (let i = 0; i < this.ballChannel.length; i++) {
      this.ballColor.set(CHANNEL_COLORS[this.ballChannel[i]]);
      this.balls.setColorAt(i, silver.clone().lerp(this.ballColor, ch));
    }
    this.balls.instanceColor!.needsUpdate = true;

    // X-ray: the mould fades so the die shows through.
    const x = smoothstep(0.6, 0.78, t);
    this.mouldMat.opacity = 1 - 0.93 * x;
    this.topMat.opacity = 1 - 0.96 * x;
    const see = x > 0.01;
    this.mouldMat.depthWrite = !see;
    this.topMat.depthWrite = !see;
    this.dieGlow.emissiveIntensity = 0.25 * smoothstep(0.75, 0.95, t);

    // Neighbours blink as their own buses run.
    const g = this.neighbourGlow;
    for (let i = 0; i < 2; i++) g.setX(i, 0.025 * Math.max(0, Math.sin(time * 3 + i * 2.1)));
    g.needsUpdate = true;
    void dt;

    const dieTop = lift + BALL_R * 2 + SUB + 0.06 + DIE.h;
    this.target.position.set(0, dieTop, 0);

    this.caption = pickByT(
      t,
      [0.16, 0.36, 0.58, 0.82],
      [C.captions.intro, C.captions.pam3, C.captions.channels, C.captions.xray, C.captions.die],
    );
  }

  getTransitionTarget() {
    return this.target;
  }
}
