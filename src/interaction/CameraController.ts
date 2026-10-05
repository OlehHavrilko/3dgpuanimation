import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Level } from '../core/types';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _sphere = new THREE.Sphere();

/**
 * Everything the interaction layer does to the camera:
 *  - Explore: OrbitControls with damping, scene-sized distance limits
 *  - fly-to: log-distance glide so huge zoom factors feel even
 *  - return: after Explore, blend back onto the scripted camera instead of snapping
 *  - parallax: a fraction of a degree of mouse-driven yaw/pitch in cinematic mode
 *  - view shift: slide the projection so the subject stays clear of the inspector panel
 */
export class CameraController {
  private controls: OrbitControls | null = null;
  private fly: {
    t: number;
    dur: number;
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
  } | null = null;
  private returnBlend: { t: number; pos: THREE.Vector3; quat: THREE.Quaternion } | null = null;
  private parallax = new THREE.Vector2();
  /** Mouse in [-1, 1]², fed by the input layer. */
  readonly mouse = new THREE.Vector2();
  private viewShift = new THREE.Vector2();

  constructor(
    private camera: THREE.PerspectiveCamera,
    private dom: HTMLElement,
    /** OS "reduce motion": no mouse parallax. */
    private reducedMotion = false,
  ) {}

  get exploring() {
    return this.controls !== null;
  }

  get flying() {
    return this.fly !== null;
  }

  /** Orbit target while exploring (DOF focus, FOV readout), else null. */
  get target(): THREE.Vector3 | null {
    return this.controls?.target ?? null;
  }

  enterExplore(level: Level) {
    const cam = this.camera;
    this.returnBlend = null;
    const controls = new OrbitControls(cam, this.dom);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.zoomSpeed = 0.9;
    controls.rotateSpeed = 0.7;
    const lookDist = cam.position.distanceTo(level.getLookAt());
    controls.target.copy(cam.position).add(cam.getWorldDirection(_v).multiplyScalar(lookDist));
    new THREE.Box3().setFromObject(level.scene).getBoundingSphere(_sphere);
    controls.minDistance = Math.max(cam.near * 4, _sphere.radius * 0.0004);
    controls.maxDistance = _sphere.radius * 3;
    controls.update();
    this.controls = controls;
  }

  /** Leave Explore; unless immediate, the next frames glide back onto the scripted camera. */
  exitExplore(immediate = false) {
    this.fly = null;
    this.controls?.dispose();
    this.controls = null;
    this.returnBlend = immediate
      ? null
      : { t: 0, pos: this.camera.position.clone(), quat: this.camera.quaternion.clone() };
  }

  /** Glide the orbit target/camera so the box fills ~60% of the view. */
  focusOn(box: THREE.Box3) {
    if (!this.controls) return;
    const cam = this.camera;
    box.getBoundingSphere(_sphere);
    const r = Math.max(_sphere.radius, 1e-6);
    const dist = (r / Math.sin(THREE.MathUtils.degToRad(cam.fov) / 2)) * 1.35;
    this.controls.minDistance = Math.min(this.controls.minDistance, dist * 0.3);
    const dir = _v.copy(cam.position).sub(this.controls.target).normalize();
    this.fly = {
      t: 0,
      dur: 0.9,
      fromPos: cam.position.clone(),
      toPos: _sphere.center.clone().addScaledVector(dir, dist),
      fromTarget: this.controls.target.clone(),
      toTarget: _sphere.center.clone(),
    };
  }

  /**
   * Runs after the level positioned the camera. Returns true when the camera moved under user
   * control this frame (so hover should be re-tested).
   */
  update(dt: number, lookAt: THREE.Vector3 | null): boolean {
    const cam = this.camera;
    if (this.controls) {
      if (this.fly) {
        const f = this.fly;
        f.t = Math.min(1, f.t + dt / f.dur);
        const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;
        this.controls.target.lerpVectors(f.fromTarget, f.toTarget, e);
        const d0 = f.fromPos.distanceTo(f.fromTarget);
        const d1 = f.toPos.distanceTo(f.toTarget);
        const d = d0 * Math.pow(d1 / d0, e);
        _v.copy(f.fromPos).sub(f.fromTarget).normalize();
        _v2.copy(f.toPos).sub(f.toTarget).normalize();
        _v.lerp(_v2, e).normalize();
        cam.position.copy(this.controls.target).addScaledVector(_v, d);
        if (f.t >= 1) this.fly = null;
      }
      this.controls.update(dt);
      return true;
    }
    if (this.returnBlend) {
      const b = this.returnBlend;
      b.t = Math.min(1, b.t + dt / 0.8);
      const e = 1 - (1 - b.t) ** 3;
      cam.position.lerpVectors(b.pos, cam.position, e);
      cam.quaternion.slerpQuaternions(b.quat, cam.quaternion, e);
      if (b.t >= 1) this.returnBlend = null;
      return false;
    }
    if (this.reducedMotion) return false;
    // Cinematic parallax: a fraction of a degree, eased.
    this.parallax.lerp(this.mouse, 1 - Math.exp(-dt * 2.5));
    if (lookAt) {
      const off = _v.copy(cam.position).sub(lookAt);
      off.applyAxisAngle(_v2.set(0, 1, 0), -this.parallax.x * 0.018);
      const right = _v2.crossVectors(off, cam.up).normalize();
      off.applyAxisAngle(right, this.parallax.y * 0.012);
      cam.position.copy(lookAt).add(off);
      cam.lookAt(lookAt);
    }
    return false;
  }

  /**
   * Slide the projection so the scene's centre sits in the free area: left of a desktop panel,
   * above a phone bottom sheet. Smoothly eased; cleared when nothing is open.
   */
  updateViewShift(dt: number, panel: DOMRect | null) {
    const cam = this.camera;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const phone = w <= 640;
    const tx = panel && !phone ? (w - panel.left) / 2 : 0;
    const ty = panel && phone ? (h - panel.top) / 2 : 0;
    const k = 1 - Math.exp(-dt * 6);
    this.viewShift.x += (tx - this.viewShift.x) * k;
    this.viewShift.y += (ty - this.viewShift.y) * k;
    if (Math.abs(this.viewShift.x) + Math.abs(this.viewShift.y) > 0.5) {
      cam.setViewOffset(w, h, this.viewShift.x, this.viewShift.y, w, h);
    } else if (cam.view?.enabled) {
      cam.clearViewOffset();
    }
  }

  /** Screen position (px) and apparent radius of a world-space box, or null if behind the camera. */
  project(box: THREE.Box3) {
    const cam = this.camera;
    box.getBoundingSphere(_sphere);
    _v.copy(_sphere.center).project(cam);
    if (_v.z > 1 || _v.z < -1) return null;
    const x = (_v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-_v.y * 0.5 + 0.5) * window.innerHeight;
    const dist = Math.max(cam.position.distanceTo(_sphere.center), 1e-6);
    const r = (_sphere.radius / (dist * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2))) * (window.innerHeight / 2);
    return { x, y, r: Math.min(r, window.innerHeight * 0.6) };
  }
}
