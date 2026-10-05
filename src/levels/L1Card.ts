import * as THREE from 'three';
import { BaseLevel } from '../core/BaseLevel';
import type { CameraKey } from '../core/CameraRig';
import type { LevelMeta, TransitionTarget } from '../core/types';
import { smoothstep, smootherstep } from '../core/math';

/**
 * Level 1 — the graphics card. Units: centimetres.
 * Card is ~30 x 12 cm, lying flat with the fans facing up (+Y).
 */
export const meta: LevelMeta = {
  name: 'Graphics card',
  scale: '30 cm',
  description: 'Triple-fan, dual-slot GPU. Everything below lives inside this box.',
  unitMeters: 0.01,
  weight: 1.3,
};

const FAN_X = [-9.6, 0, 9.6];
const FAN_R = 4.1;
const BLADES = 11;

export class CardLevel extends BaseLevel {
  readonly meta = meta;

  private fans: THREE.Group[] = [];
  private fanBlurs: THREE.MeshBasicMaterial[] = [];
  private fanAngle = 0;
  private parts!: {
    fans: THREE.Group;
    shroud: THREE.Group;
    fins: THREE.InstancedMesh;
    pipes: THREE.Group;
    coldPlate: THREE.Mesh;
    backplate: THREE.Mesh;
    bracket: THREE.Group;
  };
  private finBaseX: number[] = [];
  private finMatrix = new THREE.Matrix4();
  private accentMat!: THREE.MeshStandardMaterial;
  private target: TransitionTarget = {
    position: new THREE.Vector3(0.9, -0.05, 0),
    radius: 2.2,
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
      { t: 0.0, pos: [26, 20, 34], look: [0, 1.5, 0] },
      { t: 0.18, pos: [12, 26, 26], look: [0, 2, 0] },
      { t: 0.42, pos: [-30, 22, 38], look: [0, 5, 0] },
      { t: 0.62, pos: [-22, 12, 32], look: [0, 4, 0] },
      { t: 0.82, pos: [12, 5, 22], look: [1, 0.5, 0] },
      { t: 1.0, pos: [9, 3.6, 15], look: [0.9, -0.1, 0] },
    ];
  }

  protected build() {
    const s = this.scene;

    // ---------- lights: neutral key, green rim, cool fill
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

    // ---------- materials
    const gunmetal = new THREE.MeshStandardMaterial({ color: 0x1b1f24, metalness: 0.85, roughness: 0.38 });
    const darkPlastic = new THREE.MeshStandardMaterial({ color: 0x0b0d0f, metalness: 0.1, roughness: 0.55 });
    const aluminium = new THREE.MeshStandardMaterial({ color: 0xc3c8cf, metalness: 1, roughness: 0.32 });
    const copper = new THREE.MeshStandardMaterial({ color: 0xd07a45, metalness: 1, roughness: 0.28 });
    this.accentMat = new THREE.MeshStandardMaterial({
      color: 0x76b900,
      emissive: 0x76b900,
      emissiveIntensity: 2.2,
      roughness: 0.4,
    });

    // ---------- fans
    const fansGroup = new THREE.Group();
    const bladeGeo = makeBladeGeometry(1.25, FAN_R);
    const hubGeo = new THREE.CylinderGeometry(1.25, 1.35, 0.7, 40);
    const capGeo = new THREE.TorusGeometry(1.0, 0.06, 8, 48);
    const blurGeo = new THREE.RingGeometry(1.3, FAN_R, 48);
    const dummy = new THREE.Object3D();
    for (const x of FAN_X) {
      const fan = new THREE.Group();
      fan.position.set(x, 4.25, 0);
      const blades = new THREE.InstancedMesh(bladeGeo, darkPlastic, BLADES);
      for (let i = 0; i < BLADES; i++) {
        dummy.rotation.set(0, (i / BLADES) * Math.PI * 2, 0, 'YXZ');
        dummy.rotateX(0.38);
        dummy.updateMatrix();
        blades.setMatrixAt(i, dummy.matrix);
      }
      fan.add(blades);
      const hub = new THREE.Mesh(hubGeo, gunmetal);
      fan.add(hub);
      const cap = new THREE.Mesh(capGeo, this.accentMat);
      cap.rotation.x = Math.PI / 2;
      cap.position.y = 0.36;
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

    // ---------- shroud: top plate with three fan openings + skirt + accent strip
    const shroud = new THREE.Group();
    const top = new THREE.Shape();
    roundedRect(top, -15, -6, 30, 12, 1.2);
    for (const x of FAN_X) {
      const hole = new THREE.Path();
      hole.absarc(x, 0, FAN_R + 0.15, 0, Math.PI * 2, true);
      top.holes.push(hole);
    }
    const topGeo = new THREE.ExtrudeGeometry(top, {
      depth: 0.3,
      bevelEnabled: true,
      bevelThickness: 0.12,
      bevelSize: 0.12,
      bevelSegments: 3,
      curveSegments: 48,
    });
    topGeo.rotateX(-Math.PI / 2);
    const topMesh = new THREE.Mesh(topGeo, gunmetal);
    topMesh.position.y = 4.6;
    shroud.add(topMesh);
    const ringGeo = new THREE.TorusGeometry(FAN_R + 0.2, 0.1, 8, 64);
    for (const x of FAN_X) {
      const ring = new THREE.Mesh(ringGeo, gunmetal);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, 4.62, 0);
      shroud.add(ring);
    }
    const skirtMat = gunmetal;
    const skirtH = 1.6;
    const skirtY = 4.6 - skirtH / 2;
    const sideGeo = new THREE.BoxGeometry(29.6, skirtH, 0.18);
    const endGeo = new THREE.BoxGeometry(0.18, skirtH, 11.6);
    for (const z of [-5.95, 5.95]) {
      const m = new THREE.Mesh(sideGeo, skirtMat);
      m.position.set(0, skirtY, z);
      shroud.add(m);
    }
    for (const x of [-14.95, 14.95]) {
      const m = new THREE.Mesh(endGeo, skirtMat);
      m.position.set(x, skirtY, 0);
      shroud.add(m);
    }
    const accent = new THREE.Mesh(new THREE.BoxGeometry(22, 0.08, 0.05), this.accentMat);
    accent.position.set(1.5, 4.25, 6.06);
    shroud.add(accent);
    s.add(shroud);

    // ---------- fin stack (instanced aluminium plates)
    const finCount = 128;
    const finGeo = new THREE.BoxGeometry(0.035, 3.0, 11.0);
    const fins = new THREE.InstancedMesh(finGeo, aluminium, finCount);
    fins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < finCount; i++) {
      const x = -14 + (28 * i) / (finCount - 1);
      this.finBaseX.push(x);
      this.finMatrix.makeTranslation(x, 2.0, 0);
      fins.setMatrixAt(i, this.finMatrix);
    }
    s.add(fins);

    // ---------- heat pipes (TubeGeometry along U-shaped splines)
    const pipes = new THREE.Group();
    const pipeZ = [-2.4, -1.2, 0, 1.2, 2.4];
    pipeZ.forEach((z, i) => {
      const hiL = 2.4 + (i % 2) * 0.9;
      const hiR = 2.9 - (i % 2) * 0.9;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-13.6, hiL, z),
        new THREE.Vector3(-9, hiL, z),
        new THREE.Vector3(-5, 1.2, z * 0.8),
        new THREE.Vector3(-2.2, 0.2, z * 0.6),
        new THREE.Vector3(2.2, 0.2, z * 0.6),
        new THREE.Vector3(5, 1.2, z * 0.8),
        new THREE.Vector3(9, hiR, z),
        new THREE.Vector3(13.6, hiR, z),
      ]);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.3, 14, false), copper);
      pipes.add(tube);
      const capGeo2 = new THREE.SphereGeometry(0.3, 14, 10);
      for (const end of [curve.points[0], curve.points[curve.points.length - 1]]) {
        const capM = new THREE.Mesh(capGeo2, copper);
        capM.position.copy(end);
        pipes.add(capM);
      }
    });
    s.add(pipes);

    const coldPlate = new THREE.Mesh(new THREE.BoxGeometry(6, 0.28, 5.2), copper);
    coldPlate.position.set(0.9, 0.0, 0);
    s.add(coldPlate);

    // ---------- PCB + components
    this.buildPcb(darkPlastic);

    // ---------- backplate & bracket
    const backplate = new THREE.Mesh(new THREE.BoxGeometry(27.5, 0.16, 11.4), gunmetal);
    backplate.position.set(-1.2, -0.55, 0);
    s.add(backplate);

    const bracket = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.6, 12.4), aluminium);
    plate.position.set(-15.3, 1.9, 0.2);
    bracket.add(plate);
    const portGeo = new THREE.BoxGeometry(0.2, 0.55, 1.4);
    const ports = new THREE.InstancedMesh(portGeo, darkPlastic, 4);
    for (let i = 0; i < 4; i++) {
      this.finMatrix.makeTranslation(-15.32, 0.4 + (i % 2) * 0.9, -3.6 + Math.floor(i / 2) * 2.0);
      ports.setMatrixAt(i, this.finMatrix);
    }
    bracket.add(ports);
    const slotGeo = new THREE.BoxGeometry(0.2, 0.18, 1.6);
    const slots = new THREE.InstancedMesh(slotGeo, darkPlastic, 10);
    for (let i = 0; i < 10; i++) {
      this.finMatrix.makeTranslation(-15.32, 1.4 + (i % 5) * 0.55, 1.4 + Math.floor(i / 5) * 2.2);
      slots.setMatrixAt(i, this.finMatrix);
    }
    bracket.add(slots);
    s.add(bracket);

    this.parts = { fans: fansGroup, shroud, fins, pipes, coldPlate, backplate, bracket };
  }

  private buildPcb(darkPlastic: THREE.Material) {
    const s = this.scene;
    const pcbMat = new THREE.MeshStandardMaterial({ color: 0x0d3a1c, roughness: 0.55, metalness: 0.1 });
    const pcb = new THREE.Mesh(new THREE.BoxGeometry(27, 0.16, 11), pcbMat);
    pcb.position.set(-1.5, -0.35, 0);
    s.add(pcb);
    const tab = new THREE.Mesh(new THREE.BoxGeometry(9, 0.16, 0.9), pcbMat);
    tab.position.set(-6.5, -0.35, -5.9);
    s.add(tab);

    const gold = new THREE.MeshStandardMaterial({ color: 0xffc35a, metalness: 1, roughness: 0.22 });
    const fingerGeo = new THREE.BoxGeometry(0.14, 0.18, 0.7);
    const fingers = new THREE.InstancedMesh(fingerGeo, gold, 40);
    for (let i = 0; i < 40; i++) {
      this.finMatrix.makeTranslation(-10.7 + i * 0.21 + (i >= 11 ? 0.3 : 0), -0.35, -5.95);
      fingers.setMatrixAt(i, this.finMatrix);
    }
    s.add(fingers);

    // GPU package
    const substrate = new THREE.Mesh(
      new THREE.BoxGeometry(4.5, 0.12, 4.5),
      new THREE.MeshStandardMaterial({ color: 0x2a3a22, roughness: 0.5, metalness: 0.2 }),
    );
    substrate.position.set(0.9, -0.21, 0);
    s.add(substrate);
    const die = new THREE.Mesh(
      new THREE.BoxGeometry(2.45, 0.08, 2.5),
      new THREE.MeshStandardMaterial({ color: 0x9aa4b0, metalness: 1, roughness: 0.12 }),
    );
    die.position.set(0.9, -0.12, 0);
    s.add(die);

    // Memory: 12 GDDR chips around the GPU
    const memGeo = new THREE.BoxGeometry(1.4, 0.1, 1.2);
    const mem = new THREE.InstancedMesh(memGeo, darkPlastic, 12);
    const memPos: [number, number][] = [];
    for (let i = 0; i < 4; i++) memPos.push([-1.8 + i * 1.8, -3.5], [-1.8 + i * 1.8, 3.5]);
    for (let i = 0; i < 2; i++) memPos.push([-2.9, -1.0 + i * 2.0], [4.7, -1.0 + i * 2.0]);
    memPos.forEach(([x, z], i) => {
      this.finMatrix.makeTranslation(x + 0.9, -0.22, z);
      mem.setMatrixAt(i, this.finMatrix);
    });
    s.add(mem);

    // VRM chokes + capacitors
    const choke = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.75, 0.5, 0.75),
      new THREE.MeshStandardMaterial({ color: 0x3b3f44, metalness: 0.6, roughness: 0.45 }),
      14,
    );
    for (let i = 0; i < 14; i++) {
      this.finMatrix.makeTranslation(7.6 + (i % 7) * 0.95, -0.05, -1.5 + Math.floor(i / 7) * 3.0);
      choke.setMatrixAt(i, this.finMatrix);
    }
    s.add(choke);
    const capGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.5, 12);
    const caps = new THREE.InstancedMesh(
      capGeo,
      new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.9, roughness: 0.3 }),
      18,
    );
    for (let i = 0; i < 18; i++) {
      this.finMatrix.makeTranslation(-11 + (i % 9) * 0.6, -0.05, 3.2 + Math.floor(i / 9) * 0.7);
      caps.setMatrixAt(i, this.finMatrix);
    }
    s.add(caps);
  }

  protected animate(t: number, dt: number) {
    // Fans spin down between t = 0.1 and 0.3.
    const speed = 1 - smoothstep(0.1, 0.3, t);
    this.fanAngle += dt * (2 + 26 * speed) * (speed > 0.002 ? 1 : 0);
    this.fans.forEach((f, i) => (f.rotation.y = this.fanAngle * (i % 2 ? -1 : 1) + i));
    this.fanBlurs.forEach((m) => (m.opacity = 0.72 * speed));

    // Exploded view: each part moves out along the stack normal (+Y), fins fan out along X.
    const e = smootherstep(0.3, 0.62, t);
    const p = this.parts;
    p.fans.position.y = 10.5 * e;
    p.shroud.position.y = 7.2 * e;
    p.pipes.position.y = 3.2 * e;
    p.coldPlate.position.y = 2.9 * e;
    p.backplate.position.y = -2.4 * e;
    p.bracket.position.x = -3.5 * e;
    const finLift = 4.4 * e;
    const spread = 1 + 0.18 * e;
    for (let i = 0; i < this.finBaseX.length; i++) {
      this.finMatrix.makeTranslation(this.finBaseX[i] * spread, 2.0 + finLift, 0);
      p.fins.setMatrixAt(i, this.finMatrix);
    }
    p.fins.instanceMatrix.needsUpdate = true;

    this.accentMat.emissiveIntensity = 2.2 + Math.sin(performance.now() * 0.002) * 0.4;

    this.caption =
      t < 0.1
        ? '3 × 100 mm axial fans · 2.5-slot cooler'
        : t < 0.3
          ? 'Fans spin down'
          : t < 0.66
            ? 'Exploded: fans · shroud · 128-fin stack · 5 copper heat pipes'
            : t < 0.9
              ? 'Heat pipes carry ~450 W from the cold plate to the fins'
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
  // Leading edge (inner -> outer), sweeping forward.
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const r = r0 + (r1 - r0) * u;
    const a = -0.32 + 0.55 * u * u;
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  // Trailing edge (outer -> inner).
  for (let i = steps; i >= 0; i--) {
    const u = i / steps;
    const r = r0 + (r1 - r0) * u;
    const a = 0.22 + 0.62 * u * u;
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  shape.setFromPoints(pts);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false });
  geo.translate(0, 0, -0.025);
  geo.rotateX(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}
