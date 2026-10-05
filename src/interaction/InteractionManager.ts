import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Level, LevelContext, Pickable, PickHit } from '../core/types';
import type { LevelManager } from '../core/LevelManager';
import { Hud, type InspectorAction } from './Hud';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _sphere = new THREE.Sphere();

/**
 * Shared interaction layer, independent of any particular level:
 *  - hover: raycast the level's pickables, draw a corner bracket + tooltip with a leader line
 *  - click: select -> inspector panel, spotlight, camera glides to the entity (Explore mode)
 *  - Explore mode: freezes the scroll timeline and hands the camera to OrbitControls
 *  - keyboard: ←/→ previous/next scale, E explore, Esc back out
 *  - cinematic mode: subtle mouse parallax so the scene feels like a space, not a video
 */
export class InteractionManager {
  readonly hud = new Hud();
  exploring = false;

  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2(9, 9);
  private pointerInside = false;
  private pointerDirty = false;
  private lastRay = 0;
  private downAt: { x: number; y: number; t: number } | null = null;
  private hover: PickHit | null = null;
  private selected: PickHit | null = null;
  private hoverBracket: THREE.LineSegments;
  private selectBracket: THREE.LineSegments;
  private controls: OrbitControls | null = null;
  /** Current projection shift (px) that keeps the subject clear of the inspector. */
  private viewShift = new THREE.Vector2();
  private fly: { t: number; dur: number; fromPos: THREE.Vector3; toPos: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3 } | null = null;
  private returnBlend: { t: number; pos: THREE.Vector3; quat: THREE.Quaternion } | null = null;
  private parallax = new THREE.Vector2();
  private mouse = new THREE.Vector2();
  private idleTimer = 0;
  private pickMap = new Map<THREE.Object3D, Pickable>();
  private pickObjects: THREE.Object3D[] = [];

  constructor(
    private ctx: LevelContext,
    private manager: LevelManager,
    private canvas: HTMLCanvasElement,
    private jumpToLevel: (index: number) => void,
  ) {
    this.hoverBracket = makeBracket(0x9cff3a, 0.65);
    this.selectBracket = makeBracket(0xe9ffd0, 1);

    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'touch') return; // touch "leaves" after every tap; keep the tooltip
      this.pointerInside = false;
      this.setHover(null);
    });
    canvas.addEventListener('pointerdown', (e) => (this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() }));
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    window.addEventListener('wheel', () => this.onScrollish(), { passive: true });
    window.addEventListener('scroll', () => this.onScrollish(), { passive: true });
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('pointermove', (e) => {
      this.mouse.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
      this.wake();
    });

    document.getElementById('nav-explore')!.addEventListener('click', () => this.toggleExplore());
    document.getElementById('nav-prev')!.addEventListener('click', () => this.go(-1));
    document.getElementById('nav-next')!.addEventListener('click', () => this.go(1));
    this.hud.onClose = () => (this.selected ? this.select(null) : this.exitExplore());
    this.wake();
  }

  // ---------------------------------------------------------------- level lifecycle
  /** Call before the current level is disposed (brackets must not be disposed with it). */
  detach(scene: THREE.Scene) {
    scene.remove(this.hoverBracket, this.selectBracket);
  }

  /** Call after a new level became active. */
  attach(level: Level, index: number) {
    level.scene.add(this.hoverBracket, this.selectBracket);
    this.hoverBracket.visible = false;
    this.selectBracket.visible = false;
    this.hover = null;
    this.selected = null;
    this.hud.hideTip();
    this.hud.hideSpot();
    this.pickMap.clear();
    this.pickObjects = [];
    for (const p of level.pickables ?? []) {
      this.pickMap.set(p.object, p);
      this.pickObjects.push(p.object);
    }
    if (this.exploring) this.exitExplore(true);
    this.refreshPanel();
    this.updateCrumbs(index);
    this.hud.setNav(index, this.manager.entries.length);
  }

  // ---------------------------------------------------------------- input
  private onPointerMove(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.pointerInside = true;
    this.pointerDirty = true;
  }

  private onPointerUp(e: PointerEvent) {
    const d = this.downAt;
    this.downAt = null;
    if (!d || e.button !== 0) return;
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (moved > 6 || performance.now() - d.t > 600) return; // that was a drag, not a click
    this.onPointerMove(e);
    const hit = this.raycast();
    // Touch while scrolling the story: first tap identifies (tooltip), a second tap on the
    // same thing inspects. A stray tap during a swipe never yanks the user into Explore.
    if (e.pointerType === 'touch' && !this.exploring) {
      if (hit && hit.key === this.hover?.key) {
        this.enterExplore();
        this.select(hit);
      } else {
        this.setHover(hit);
      }
      return;
    }
    if (hit) {
      if (!this.exploring) this.enterExplore();
      this.select(hit);
    } else if (this.selected) {
      this.select(null);
    }
  }

  private onScrollish() {
    if (this.exploring) return;
    this.setHover(null);
    this.pointerInside = false;
  }

  private onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault();
      this.go(1);
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      this.go(-1);
    } else if (e.key === 'e' || e.key === 'E' || e.key === 'у' || e.key === 'У') {
      this.toggleExplore();
    } else if (e.key === 'Escape') {
      if (this.selected) this.select(null);
      else if (this.exploring) this.exitExplore();
    }
  }

  private go(delta: number) {
    const i = THREE.MathUtils.clamp(this.manager.currentIndex + delta, 0, this.manager.entries.length - 1);
    if (i !== this.manager.currentIndex) this.jumpToLevel(i);
  }

  private wake() {
    document.body.classList.remove('idle');
    window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => document.body.classList.add('idle'), 3500);
  }

  // ---------------------------------------------------------------- picking
  private raycast(): PickHit | null {
    if (!this.pickObjects.length) return null;
    this.raycaster.setFromCamera(this.ndc, this.ctx.camera);
    const hits = this.raycaster.intersectObjects(this.pickObjects, true);
    const candidates: { hit: THREE.Intersection; p: Pickable }[] = [];
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object;
      while (o && !this.pickMap.has(o)) o = o.parent;
      if (o) candidates.push({ hit, p: this.pickMap.get(o)! });
    }
    // Highest priority first, then nearest (hits are already distance-sorted).
    candidates.sort((a, b) => (b.p.priority ?? 0) - (a.p.priority ?? 0));
    for (const c of candidates) {
      const r = c.p.resolve(c.hit);
      if (r) return r;
    }
    return null;
  }

  private setHover(hit: PickHit | null) {
    this.hover = hit;
    this.canvas.classList.toggle('hovering', !!hit);
    if (!hit || hit.key === this.selected?.key) {
      this.hoverBracket.visible = false;
      this.hud.hideTip();
      return;
    }
    fitBracket(this.hoverBracket, hit.box);
  }

  select(hit: PickHit | null) {
    this.selected = hit;
    if (hit) {
      fitBracket(this.selectBracket, hit.box);
      this.focusOn(hit.box);
      this.hud.hideTip();
      this.hoverBracket.visible = false;
    } else {
      this.selectBracket.visible = false;
      this.hud.hideSpot();
    }
    this.refreshPanel();
    this.updateCrumbs(this.manager.currentIndex);
  }

  // ---------------------------------------------------------------- explore mode
  toggleExplore() {
    if (this.exploring) this.exitExplore();
    else this.enterExplore();
  }

  enterExplore() {
    if (this.exploring || !this.manager.current) return;
    const cam = this.ctx.camera;
    const level = this.manager.current;
    this.exploring = true;
    this.returnBlend = null;
    this.ctx.view.freeCamera = true;
    document.body.classList.add('exploring');
    document.documentElement.style.overflow = 'hidden';

    const controls = new OrbitControls(cam, this.canvas);
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
    level.onExploreChange?.(true);
    this.refreshPanel();
  }

  exitExplore(immediate = false) {
    if (!this.exploring) return;
    const cam = this.ctx.camera;
    this.exploring = false;
    this.fly = null;
    this.controls?.dispose();
    this.controls = null;
    this.ctx.view.freeCamera = false;
    document.body.classList.remove('exploring');
    document.documentElement.style.overflow = '';
    this.selected = null;
    this.selectBracket.visible = false;
    this.hud.hideSpot();
    this.manager.current?.onExploreChange?.(false);
    // Glide back to the scripted camera instead of snapping.
    this.returnBlend = immediate ? null : { t: 0, pos: cam.position.clone(), quat: cam.quaternion.clone() };
    this.refreshPanel();
    this.updateCrumbs(this.manager.currentIndex);
  }

  /** Glide the orbit target/camera so the box fills ~60% of the view. */
  private focusOn(box: THREE.Box3) {
    if (!this.controls) return;
    const cam = this.ctx.camera;
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

  /** Explore mode: the orbit target is what the user is looking at (DOF focus, FOV readout). */
  getFocusOverride(): THREE.Vector3 | null {
    return this.exploring && this.controls ? this.controls.target : null;
  }

  // ---------------------------------------------------------------- per frame
  /** Runs after the level positioned the camera (and after the dive). */
  update(dt: number) {
    const cam = this.ctx.camera;

    if (this.exploring && this.controls) {
      if (this.fly) {
        const f = this.fly;
        f.t = Math.min(1, f.t + dt / f.dur);
        const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;
        this.controls.target.lerpVectors(f.fromTarget, f.toTarget, e);
        // Log-interpolate distance so large zoom factors feel even.
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
      this.pointerDirty = true; // camera moved: hover may have changed
    } else if (this.returnBlend) {
      const b = this.returnBlend;
      b.t = Math.min(1, b.t + dt / 0.8);
      const e = 1 - (1 - b.t) ** 3;
      cam.position.lerpVectors(b.pos, cam.position, e);
      cam.quaternion.slerpQuaternions(b.quat, cam.quaternion, e);
      if (b.t >= 1) this.returnBlend = null;
    } else {
      // Cinematic parallax: a fraction of a degree, eased.
      this.parallax.lerp(this.mouse, 1 - Math.exp(-dt * 2.5));
      const look = this.manager.current?.getLookAt();
      if (look && this.manager.current) {
        const off = _v.copy(cam.position).sub(look);
        off.applyAxisAngle(_v2.set(0, 1, 0), -this.parallax.x * 0.018);
        const right = _v2.crossVectors(off, cam.up).normalize();
        off.applyAxisAngle(right, this.parallax.y * 0.012);
        cam.position.copy(look).add(off);
        cam.lookAt(look);
      }
    }

    // Hover raycast, throttled.
    const now = performance.now();
    if (this.pointerInside && this.pointerDirty && now - this.lastRay > 45 && !this.fly) {
      this.lastRay = now;
      this.pointerDirty = false;
      const hit = this.raycast();
      if (hit?.key !== this.hover?.key) this.setHover(hit);
      else if (hit && this.hover) this.hover.box.copy(hit.box);
    }

    this.updateViewShift(dt);

    // Screen-space UI follows its 3D anchors.
    if (this.hover && this.hover.key !== this.selected?.key) {
      const p = this.project(this.hover.box);
      if (p) this.hud.showTip(this.hover.key, this.hover.info, p.x, p.y);
      else this.hud.hideTip();
    }
    if (this.selected) {
      const p = this.project(this.selected.box);
      if (p) this.hud.setSpot(p.x, p.y, p.r);
    }
  }

  /**
   * When the inspector is open, slide the projection so the scene's centre sits in the free
   * area: left of the panel on desktop, above the bottom sheet on phones. Smoothly eased.
   */
  private updateViewShift(dt: number) {
    const cam = this.ctx.camera;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const open = document.body.classList.contains('inspecting');
    const phone = w <= 640;
    const panel = this.hud.inspectorRect();
    const tx = open && !phone && panel ? (w - panel.left) / 2 : 0;
    const ty = open && phone && panel ? (h - panel.top) / 2 : 0;
    const k = 1 - Math.exp(-dt * 6);
    this.viewShift.x += (tx - this.viewShift.x) * k;
    this.viewShift.y += (ty - this.viewShift.y) * k;
    if (Math.abs(this.viewShift.x) + Math.abs(this.viewShift.y) > 0.5) {
      cam.setViewOffset(w, h, this.viewShift.x, this.viewShift.y, w, h);
    } else if (cam.view?.enabled) {
      cam.clearViewOffset();
    }
  }

  private project(box: THREE.Box3) {
    const cam = this.ctx.camera;
    box.getBoundingSphere(_sphere);
    _v.copy(_sphere.center).project(cam);
    if (_v.z > 1 || _v.z < -1) return null;
    const x = (_v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-_v.y * 0.5 + 0.5) * window.innerHeight;
    const dist = Math.max(cam.position.distanceTo(_sphere.center), 1e-6);
    const r =
      (_sphere.radius / (dist * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2))) * (window.innerHeight / 2);
    return { x, y, r: Math.min(r, window.innerHeight * 0.6) };
  }

  // ---------------------------------------------------------------- panel + crumbs
  private refreshPanel() {
    const level = this.manager.current;
    const index = this.manager.currentIndex;
    if (!level || (!this.exploring && !this.selected)) {
      this.hud.closeInspector();
      return;
    }
    const count = this.manager.entries.length;
    const actions: InspectorAction[] = [];
    if (this.selected) actions.push({ label: 'Re-centre', run: () => this.selected && this.focusOn(this.selected.box) });
    if (index < count - 1) actions.push({ label: `Dive ▸ ${this.manager.entries[index + 1].meta.scale}`, run: () => this.jumpToLevel(index + 1) });
    if (index > 0) actions.push({ label: `◂ ${this.manager.entries[index - 1].meta.scale}`, run: () => this.jumpToLevel(index - 1) });

    const heading = this.selected
      ? this.selected.info
      : {
          kind: `Explore · ${level.meta.scale}`,
          title: level.meta.name,
          specs: [] as [string, string][],
          note: level.pickables?.length
            ? 'Hover anything to identify it, click to inspect. Drag to orbit, wheel to zoom.'
            : 'Drag to orbit, wheel to zoom.',
        };
    this.hud.openInspector(heading, actions, this.exploring ? level.controls ?? [] : []);
  }

  private updateCrumbs(index: number) {
    this.hud.setCrumbs(
      this.manager.entries.map((e) => e.meta),
      index,
      this.selected?.info.title ?? null,
      (i) => this.jumpToLevel(i),
    );
  }
}

// ---------------------------------------------------------------- corner brackets
function makeBracket(color: number, opacity: number) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(48 * 3), 3));
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false, toneMapped: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.renderOrder = 999;
  lines.frustumCulled = false;
  lines.visible = false;
  return lines;
}

/** 8 corners x 3 short edges: the "instrument reticle" look instead of a full wireframe box. */
function fitBracket(lines: THREE.LineSegments, box: THREE.Box3) {
  const pos = lines.geometry.getAttribute('position') as THREE.BufferAttribute;
  const min = box.min;
  const max = box.max;
  const size = _v.subVectors(max, min);
  const pad = Math.max(size.x, size.y, size.z) * 0.04;
  const lo = [min.x - pad, min.y - pad, min.z - pad];
  const hi = [max.x + pad, max.y + pad, max.z + pad];
  const len = [size.x, size.y, size.z].map((s) => (s + 2 * pad) * 0.22);
  let k = 0;
  for (let c = 0; c < 8; c++) {
    const corner = [c & 1 ? hi[0] : lo[0], c & 2 ? hi[1] : lo[1], c & 4 ? hi[2] : lo[2]];
    const sign = [c & 1 ? -1 : 1, c & 2 ? -1 : 1, c & 4 ? -1 : 1];
    for (let axis = 0; axis < 3; axis++) {
      pos.setXYZ(k++, corner[0], corner[1], corner[2]);
      const end = [...corner];
      end[axis] += sign[axis] * len[axis];
      pos.setXYZ(k++, end[0], end[1], end[2]);
    }
  }
  pos.needsUpdate = true;
  lines.visible = true;
}
