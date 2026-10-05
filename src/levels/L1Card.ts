import * as THREE from 'three';
import { BaseLevel } from '../core/BaseLevel';
import type { CameraKey } from '../core/CameraRig';
import type { LevelMeta, TransitionTarget } from '../core/types';
import { smoothstep, smootherstep } from '../core/math';

/**
 * Level 1 — GeForce RTX 5090 Founders Edition. Units: centimetres.
 *
 * Modelled after the real FE layout: 304 x 137 mm, dual-slot, two fans on the same
 * face blowing straight through two fin stacks ("double flow-through"), a compact
 * main PCB in the middle under a 3D vapor chamber, and separate PCIe and display-I/O
 * boards connected by flex cables. The card lies flat, fans facing up (+Y).
 */
export const meta: LevelMeta = {
  name: 'GeForce RTX 5090',
  scale: '30 cm',
  description: 'Founders Edition · 304 × 137 mm · dual-slot · 575 W. Everything below lives inside it.',
  unitMeters: 0.01,
  weight: 1.3,
};

const LEN = 30.4;
const HGT = 13.7;
const FAN_X = [-9.4, 9.4];
const FAN_R = 5.0;
const BLADES = 7;
const PCB_HALF = 6.0; // main board spans x in [-6, 6]
const FIN_IN = 6.5; // side fin stacks span |x| in [6.5, 15]

export class CardLevel extends BaseLevel {
  readonly meta = meta;

  private fans: THREE.Group[] = [];
  private fanBlurs: THREE.MeshBasicMaterial[] = [];
  private fanAngle = 0;
  private parts!: {
    fans: THREE.Group;
    shroud: THREE.Group;
    fins: THREE.InstancedMesh;
    centerFins: THREE.InstancedMesh;
    cooler: THREE.Group;
    bottom: THREE.Mesh;
    pcie: THREE.Group;
    io: THREE.Group;
  };
  private finBaseX: number[] = [];
  private centerFinX: number[] = [];
  private mtx = new THREE.Matrix4();
  private logoMat!: THREE.MeshStandardMaterial;
  private target: TransitionTarget = {
    position: new THREE.Vector3(0, -0.05, 0),
    radius: 2.0,
    approach: new THREE.Vector3(0.3, 0.42, 0.86).normalize(),
  };

  constructor(ctx: ConstructorParameters<typeof BaseLevel>[0]) {
    super(ctx);
    this.near = 0.1;
    this.far = 400;
    this.bloom = 1;
    this.bokeh = 1.6;
  }

  protected cameraKeys(): CameraKey[] {
    return [
      { t: 0.0, pos: [26, 21, 36], look: [0, 1.2, 0] },
      { t: 0.18, pos: [12, 28, 28], look: [0, 2, 0] },
      { t: 0.42, pos: [-30, 22, 40], look: [0, 5, 0] },
      { t: 0.62, pos: [-22, 12, 33], look: [0, 4, 0] },
      { t: 0.82, pos: [12, 5, 22], look: [0, 0.5, 0] },
      { t: 1.0, pos: [8, 3.6, 15], look: [0, -0.1, 0] },
    ];
  }

  protected build() {
    const s = this.scene;

    s.add(new THREE.HemisphereLight(0xdfeee0, 0x050806, 0.35));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(20, 40, 25);
    s.add(key);
    const rim = new THREE.DirectionalLight(0x76b900, 1.8);
    rim.position.set(-30, 10, -30);
    s.add(rim);
    const under = new THREE.PointLight(0x9cff3a, 30, 60, 1.6);
    under.position.set(0, -6, 6);
    s.add(under);

    const gunmetal = new THREE.MeshStandardMaterial({ color: 0x24282d, metalness: 0.85, roughness: 0.34 });
    const black = new THREE.MeshStandardMaterial({ color: 0x0c0e10, metalness: 0.4, roughness: 0.45 });
    const darkPlastic = new THREE.MeshStandardMaterial({ color: 0x0b0d0f, metalness: 0.1, roughness: 0.55 });
    const aluminium = new THREE.MeshStandardMaterial({ color: 0xc3c8cf, metalness: 1, roughness: 0.32 });
    const copper = new THREE.MeshStandardMaterial({ color: 0xd07a45, metalness: 1, roughness: 0.28 });
    this.logoMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4fff0, emissiveIntensity: 2 });

    // ---------- fans: 7 blades joined by an outer ring, as on the FE fans
    const fansGroup = new THREE.Group();
    const bladeGeo = makeBladeGeometry(1.45, FAN_R - 0.1);
    const hubGeo = new THREE.CylinderGeometry(1.45, 1.55, 0.8, 40);
    const outerRingGeo = new THREE.TorusGeometry(FAN_R - 0.05, 0.08, 8, 72);
    const capGeo = new THREE.CircleGeometry(1.1, 40);
    const blurGeo = new THREE.RingGeometry(1.5, FAN_R, 48);
    const dummy = new THREE.Object3D();
    for (const x of FAN_X) {
      const fan = new THREE.Group();
      fan.position.set(x, 3.25, 0);
      const blades = new THREE.InstancedMesh(bladeGeo, darkPlastic, BLADES);
      for (let i = 0; i < BLADES; i++) {
        dummy.rotation.set(0, (i / BLADES) * Math.PI * 2, 0, 'YXZ');
        dummy.rotateX(0.42);
        dummy.updateMatrix();
        blades.setMatrixAt(i, dummy.matrix);
      }
      fan.add(blades);
      fan.add(new THREE.Mesh(hubGeo, black));
      const ring = new THREE.Mesh(outerRingGeo, darkPlastic);
      ring.rotation.x = Math.PI / 2;
      fan.add(ring);
      const cap = new THREE.Mesh(capGeo, gunmetal);
      cap.rotation.x = -Math.PI / 2;
      cap.position.y = 0.41;
      fan.add(cap);
      const blurMat = new THREE.MeshBasicMaterial({
        color: 0x0a0c0e,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const blur = new THREE.Mesh(blurGeo, blurMat);
      blur.rotation.x = -Math.PI / 2;
      blur.position.y = 0.05;
      fan.add(blur);
      this.fanBlurs.push(blurMat);
      fansGroup.add(fan);
      this.fans.push(fan);
    }
    s.add(fansGroup);

    // ---------- shroud: gunmetal frame, two fan openings, black centre panel, white logo bar
    const shroud = new THREE.Group();
    const top = new THREE.Shape();
    roundedRect(top, -LEN / 2, -HGT / 2, LEN, HGT, 1.0);
    for (const x of FAN_X) {
      const hole = new THREE.Path();
      hole.absarc(x, 0, FAN_R + 0.15, 0, Math.PI * 2, true);
      top.holes.push(hole);
    }
    const topGeo = new THREE.ExtrudeGeometry(top, {
      depth: 0.25,
      bevelEnabled: true,
      bevelThickness: 0.1,
      bevelSize: 0.1,
      bevelSegments: 3,
      curveSegments: 56,
    });
    topGeo.rotateX(-Math.PI / 2);
    const topMesh = new THREE.Mesh(topGeo, gunmetal);
    topMesh.position.y = 3.6;
    shroud.add(topMesh);
    const center = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.12, HGT - 1.6), black);
    center.position.set(0, 3.98, 0);
    shroud.add(center);
    const ringGeo = new THREE.TorusGeometry(FAN_R + 0.2, 0.09, 8, 72);
    for (const x of FAN_X) {
      const ring = new THREE.Mesh(ringGeo, gunmetal);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, 3.62, 0);
      shroud.add(ring);
    }
    const skirtH = 1.2;
    const skirtY = 3.6 - skirtH / 2;
    const sideGeo = new THREE.BoxGeometry(LEN - 0.4, skirtH, 0.16);
    const endGeo = new THREE.BoxGeometry(0.16, skirtH, HGT - 0.4);
    for (const z of [-(HGT / 2 - 0.1), HGT / 2 - 0.1]) {
      const m = new THREE.Mesh(sideGeo, gunmetal);
      m.position.set(0, skirtY, z);
      shroud.add(m);
    }
    for (const x of [-(LEN / 2 - 0.1), LEN / 2 - 0.1]) {
      const m = new THREE.Mesh(endGeo, gunmetal);
      m.position.set(x, skirtY, 0);
      shroud.add(m);
    }
    const logo = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.22, 0.04), this.logoMat);
    logo.position.set(0, 3.3, HGT / 2 + 0.01);
    shroud.add(logo);
    s.add(shroud);

    // ---------- two side fin stacks (flow-through) + a short centre stack over the vapor chamber
    const perSide = 64;
    const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 3.0, HGT - 1.2), aluminium, perSide * 2);
    fins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < perSide * 2; i++) {
      const side = i < perSide ? -1 : 1;
      const u = (i % perSide) / (perSide - 1);
      this.finBaseX.push(side * (FIN_IN + u * (LEN / 2 - 0.4 - FIN_IN)));
    }
    s.add(fins);
    const centerFins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 1.8, 9.5), aluminium, 44);
    centerFins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 44; i++) this.centerFinX.push(-5 + (10 * i) / 43);
    s.add(centerFins);

    // ---------- 3D vapor chamber + heat pipes running into both side stacks
    const cooler = new THREE.Group();
    const chamber = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.45, 9.5), copper);
    chamber.position.set(0, 0.3, 0);
    cooler.add(chamber);
    const pipeZ = [-3.2, -1.6, 0, 1.6, 3.2];
    pipeZ.forEach((z, i) => {
      const hi = 2.0 + (i % 2) * 0.9;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-14.4, hi, z),
        new THREE.Vector3(-9.5, hi, z),
        new THREE.Vector3(-6.2, 1.0, z),
        new THREE.Vector3(-3.0, 0.62, z),
        new THREE.Vector3(3.0, 0.62, z),
        new THREE.Vector3(6.2, 1.0, z),
        new THREE.Vector3(9.5, 2.9 - (i % 2) * 0.9, z),
        new THREE.Vector3(14.4, 2.9 - (i % 2) * 0.9, z),
      ]);
      cooler.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.3, 14, false), copper));
      const capGeo2 = new THREE.SphereGeometry(0.3, 14, 10);
      for (const end of [curve.points[0], curve.points[curve.points.length - 1]]) {
        const capM = new THREE.Mesh(capGeo2, copper);
        capM.position.copy(end);
        cooler.add(capM);
      }
    });
    s.add(cooler);

    // ---------- boards
    this.buildMainPcb(darkPlastic);
    const pcie = this.buildPcieBoard();
    const io = this.buildIoBoard(aluminium, darkPlastic);

    // Bottom cover under the main PCB (the FE has no full-length backplate: air must pass through).
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(2 * PCB_HALF + 1, 0.16, HGT - 0.6), gunmetal);
    bottom.position.set(0, -0.55, 0);
    s.add(bottom);

    this.parts = { fans: fansGroup, shroud, fins, centerFins, cooler, bottom, pcie, io };
  }

  private buildMainPcb(darkPlastic: THREE.Material) {
    const s = this.scene;
    const pcbMat = new THREE.MeshStandardMaterial({ color: 0x0d3a1c, roughness: 0.55, metalness: 0.1 });
    const pcb = new THREE.Mesh(new THREE.BoxGeometry(2 * PCB_HALF, 0.16, 11), pcbMat);
    pcb.position.set(0, -0.35, 0.4);
    s.add(pcb);

    // GB202 package + bare die
    const substrate = new THREE.Mesh(
      new THREE.BoxGeometry(5.0, 0.12, 5.0),
      new THREE.MeshStandardMaterial({ color: 0x2a3a22, roughness: 0.5, metalness: 0.2 }),
    );
    substrate.position.set(0, -0.21, 0);
    s.add(substrate);
    const die = new THREE.Mesh(
      new THREE.BoxGeometry(2.9, 0.08, 2.6),
      new THREE.MeshStandardMaterial({ color: 0x9aa4b0, metalness: 1, roughness: 0.12 }),
    );
    die.position.set(0, -0.12, 0);
    s.add(die);

    // 16 GDDR7 chips, four per side
    const mem = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.1, 1.2), darkPlastic, 16);
    let k = 0;
    for (let i = 0; i < 4; i++) {
      const u = -2.4 + i * 1.6;
      mem.setMatrixAt(k++, this.mtx.makeTranslation(u, -0.22, -3.5));
      mem.setMatrixAt(k++, this.mtx.makeTranslation(u, -0.22, 3.5));
      mem.setMatrixAt(k++, this.mtx.makeTranslation(-3.9, -0.22, u * 0.85));
      mem.setMatrixAt(k++, this.mtx.makeTranslation(3.9, -0.22, u * 0.85));
    }
    s.add(mem);

    // Power stages / chokes along the board edges
    const choke = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.7, 0.45, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x3b3f44, metalness: 0.6, roughness: 0.45 }),
      30,
    );
    for (let i = 0; i < 30; i++) {
      const row = Math.floor(i / 15);
      choke.setMatrixAt(i, this.mtx.makeTranslation(-5.4 + (i % 15) * 0.77, -0.05, row ? 5.3 : -4.75));
    }
    s.add(choke);

    // 12V-2x6 power connector
    const conn = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.9, 0.8), darkPlastic);
    conn.position.set(1.5, 0.2, 5.55);
    s.add(conn);
  }

  /** Separate PCIe board on the bottom edge, tied to the main PCB by a flex cable. */
  private buildPcieBoard() {
    const g = new THREE.Group();
    const pcbMat = new THREE.MeshStandardMaterial({ color: 0x0d3a1c, roughness: 0.55, metalness: 0.1 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.16, 1.6), pcbMat);
    board.position.set(-2.6, -0.35, -6.2);
    g.add(board);
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc35a, metalness: 1, roughness: 0.22 });
    const fingers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.18, 0.65), gold, 82);
    for (let i = 0; i < 82; i++) {
      fingers.setMatrixAt(i, this.mtx.makeTranslation(-6.9 + i * 0.1 + (i >= 11 ? 0.2 : 0), -0.35, -7.05));
    }
    g.add(fingers);
    const flex = new THREE.Mesh(
      new THREE.BoxGeometry(3, 0.03, 1.2),
      new THREE.MeshStandardMaterial({ color: 0xc98a2e, roughness: 0.4, metalness: 0.3 }),
    );
    flex.position.set(-1.5, -0.25, -5.2);
    g.add(flex);
    this.scene.add(g);
    return g;
  }

  /** Display-output board at the bracket: 3x DisplayPort 2.1b + 1x HDMI 2.1b. */
  private buildIoBoard(aluminium: THREE.Material, darkPlastic: THREE.Material) {
    const g = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.0, HGT - 0.8), aluminium);
    plate.position.set(-LEN / 2 - 0.15, 1.6, 0);
    g.add(plate);
    const ports = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.55, 1.5), darkPlastic, 4);
    for (let i = 0; i < 4; i++) {
      ports.setMatrixAt(i, this.mtx.makeTranslation(-LEN / 2 - 0.17, 0.35, -4.5 + i * 2.0));
    }
    g.add(ports);
    const vents = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.16, 4.5), darkPlastic, 5);
    for (let i = 0; i < 5; i++) vents.setMatrixAt(i, this.mtx.makeTranslation(-LEN / 2 - 0.17, 1.4 + i * 0.5, 2.6));
    g.add(vents);
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.16, 9),
      new THREE.MeshStandardMaterial({ color: 0x0d3a1c, roughness: 0.55 }),
    );
    board.position.set(-LEN / 2 + 0.9, -0.35, -1.5);
    g.add(board);
    const cable = new THREE.Mesh(
      new THREE.BoxGeometry(8.2, 0.03, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6 }),
    );
    cable.position.set(-LEN / 2 + 5.6, -0.3, -1.5);
    g.add(cable);
    this.scene.add(g);
    return g;
  }

  protected animate(t: number, dt: number, time: number) {
    // Fans spin down between t = 0.1 and 0.3.
    const speed = 1 - smoothstep(0.1, 0.3, t);
    this.fanAngle += dt * (2 + 24 * speed) * (speed > 0.002 ? 1 : 0);
    this.fans.forEach((f, i) => (f.rotation.y = this.fanAngle + i));
    this.fanBlurs.forEach((m) => (m.opacity = 0.72 * speed));

    // Exploded view: parts move out along the stack normal (+Y); fin stacks also slide outward.
    const e = smootherstep(0.3, 0.62, t);
    const p = this.parts;
    p.fans.position.y = 10.5 * e;
    p.shroud.position.y = 7.4 * e;
    p.cooler.position.y = 2.8 * e;
    p.bottom.position.y = -2.4 * e;
    p.pcie.position.set(0, -1.0 * e, -2.2 * e);
    p.io.position.x = -3.2 * e;
    const finLift = 4.6 * e;
    for (let i = 0; i < this.finBaseX.length; i++) {
      const x = this.finBaseX[i];
      this.mtx.makeTranslation(x * (1 + 0.16 * e) + Math.sign(x) * 1.2 * e, 1.85 + finLift, 0);
      p.fins.setMatrixAt(i, this.mtx);
    }
    p.fins.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < this.centerFinX.length; i++) {
      this.mtx.makeTranslation(this.centerFinX[i] * (1 + 0.2 * e), 1.5 + 4.2 * e, 0);
      p.centerFins.setMatrixAt(i, this.mtx);
    }
    p.centerFins.instanceMatrix.needsUpdate = true;

    this.logoMat.emissiveIntensity = 1.8 + Math.sin(time * 1.5) * 0.3;

    this.caption =
      t < 0.1
        ? 'Double flow-through: 2 fans push air straight through the fins'
        : t < 0.3
          ? 'Fans spin down'
          : t < 0.66
            ? 'Exploded: shroud · fans · 2 fin stacks · 3D vapor chamber · heat pipes'
            : t < 0.9
              ? 'Compact main PCB + separate PCIe and display boards on flex cables'
              : 'Diving into the board';
  }

  getTransitionTarget() {
    return this.target;
  }
}

function roundedRect(shape: THREE.Shape, x: number, y: number, w: number, h: number, r: number) {
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
}

/** Swept fan blade lying in the XZ plane, centred on +X, thin along Y. */
function makeBladeGeometry(r0: number, r1: number) {
  const shape = new THREE.Shape();
  const steps = 12;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const r = r0 + (r1 - r0) * u;
    const a = -0.42 + 0.55 * u * u;
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  for (let i = steps; i >= 0; i--) {
    const u = i / steps;
    const r = r0 + (r1 - r0) * u;
    const a = 0.32 + 0.7 * u * u;
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  shape.setFromPoints(pts);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false });
  geo.translate(0, 0, -0.025);
  geo.rotateX(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}
