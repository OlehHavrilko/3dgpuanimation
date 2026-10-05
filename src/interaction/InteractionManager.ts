import * as THREE from 'three';
import type { Level, LevelContext, Pickable, PickHit } from '../core/types';
import type { LevelManager } from '../core/LevelManager';
import { Hud, type InspectorAction } from './Hud';
import { ViewModes, type ViewMode } from './ViewModes';
import { FollowTracer } from './FollowTracer';
import { CameraController } from './CameraController';
import { TraceRunner } from './TraceRunner';
import { fitBracket, makeBracket } from './brackets';
import { content } from '../content';
import { QUALITY, type Quality } from '../core/quality';

/**
 * Shared interaction layer, independent of any particular level. It orchestrates:
 *  - hover: raycast the level's pickables, corner bracket + tooltip with a leader line
 *  - selection: inspector panel, spotlight, camera glide (Explore mode)
 *  - Explore / view modes / signal trace / follow tracer lifecycles per level
 *  - input: pointer, keyboard (←/→ scales, E explore, Esc back out), nav buttons
 * Camera work lives in CameraController, the trace stepping in TraceRunner.
 */
export class InteractionManager {
  readonly hud = new Hud();
  readonly views: ViewModes;
  readonly tracer = new FollowTracer();
  readonly cam: CameraController;
  exploring = false;
  /** Explore toggled (the guided tour pauses while the user explores). */
  onExploreToggle: ((active: boolean) => void) | null = null;
  /** Space bar hook, wired to the guided tour by the app. */
  onSpace: (() => void) | null = null;
  /** `L` hook, wired to the 3D label layer by the app. */
  onLabels: (() => void) | null = null;
  /** `M` hook, wired to the ambience by the app. */
  onSound: (() => void) | null = null;
  /** Selection change, used for audio feedback. */
  onSelect: ((hit: PickHit | null) => void) | null = null;

  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2(9, 9);
  private pointerInside = false;
  private pointerDirty = false;
  private lastRay = 0;
  private downAt: { x: number; y: number; t: number } | null = null;
  private hover: PickHit | null = null;
  private selected: PickHit | null = null;
  private hoverBracket = makeBracket(0x9cff3a, 0.65);
  private selectBracket = makeBracket(0xe9ffd0, 1);
  private idleTimer = 0;
  private pickMap = new Map<THREE.Object3D, Pickable>();
  private pickObjects: THREE.Object3D[] = [];
  private trace: TraceRunner;

  constructor(
    private ctx: LevelContext,
    private manager: LevelManager,
    private canvas: HTMLCanvasElement,
    private jumpToLevel: (index: number) => void,
    quality: Quality = QUALITY,
  ) {
    this.views = new ViewModes(ctx.renderer);
    this.cam = new CameraController(ctx.camera, canvas, quality.reducedMotion);
    this.trace = new TraceRunner((hit) => {
      if (!this.exploring) this.enterExplore();
      this.select(hit);
    });

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
    window.addEventListener('resize', () => this.hud.invalidateRect());
    window.addEventListener('pointermove', (e) => {
      this.cam.mouse.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
      this.wake();
    });

    document.getElementById('nav-explore')!.addEventListener('click', () => this.toggleExplore());
    document.getElementById('nav-prev')!.addEventListener('click', () => this.go(-1));
    document.getElementById('nav-next')!.addEventListener('click', () => this.go(1));
    this.hud.onClose = () => {
      this.stopTrace();
      if (this.selected) this.select(null);
      else this.exitExplore();
    };
    this.wake();
  }

  // ---------------------------------------------------------------- level lifecycle
  /** The level stops being current (it may be disposed or kept in a cache): take our things back. */
  detach(scene: THREE.Scene) {
    this.views.detach();
    this.tracer.detach(scene);
    scene.remove(this.hoverBracket, this.selectBracket);
  }

  /** A level became current. */
  attach(level: Level, index: number) {
    this.views.attach(level);
    this.tracer.attach(level);
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
    // A trace in progress continues on this level if it has a plan (after the arrival flash).
    this.trace.start(this.ctx.journey.trace ? level.tracePlan?.() : null, 0.9);
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
    this.trace.stop(); // the user took over
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
    if (document.body.classList.contains('palette')) return;
    // `e.code` is layout-independent, so the shortcuts work on Russian/Cyrillic keyboards too.
    switch (e.code) {
      case 'ArrowRight':
      case 'PageDown':
        e.preventDefault();
        this.go(1);
        break;
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault();
        this.go(-1);
        break;
      case 'KeyE':
        this.toggleExplore();
        break;
      case 'KeyL':
        this.onLabels?.();
        break;
      case 'KeyM':
        this.onSound?.();
        break;
      case 'Space':
        e.preventDefault();
        this.onSpace?.();
        break;
      case 'KeyF':
        // Plain F is Follow e⁻ (handled by the app); Shift+F is fullscreen.
        if (e.shiftKey) toggleFullscreen();
        break;
      case 'Escape':
        this.stopTrace();
        if (this.selected) this.select(null);
        else if (this.exploring) this.exitExplore();
        break;
      default:
        if (/^Digit[1-8]$/.test(e.code)) {
          const i = Number(e.code.slice(5)) - 1;
          if (i < this.manager.entries.length) this.jumpToLevel(i);
        } else if (this.exploring) {
          if (e.code === 'KeyX') this.setViewMode('X-Ray');
          else if (e.code === 'KeyC') this.setViewMode('Section');
          else if (e.code === 'KeyT' && this.views.available().includes('Thermal')) this.setViewMode('Thermal');
          else if (e.code === 'KeyN') this.setViewMode('Normal');
        }
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
    this.views.setFocus(hit?.object ?? null);
    if (hit) {
      fitBracket(this.selectBracket, hit.box);
      this.cam.focusOn(hit.box);
      this.hud.hideTip();
      this.hoverBracket.visible = false;
    } else {
      this.selectBracket.visible = false;
      this.hud.hideSpot();
    }
    this.onSelect?.(hit);
    this.refreshPanel();
    this.updateCrumbs(this.manager.currentIndex);
  }

  // ---------------------------------------------------------------- explore mode
  toggleExplore() {
    if (this.exploring) this.exitExplore();
    else this.enterExplore();
  }

  enterExplore() {
    const level = this.manager.current;
    if (this.exploring || !level) return;
    this.exploring = true;
    this.ctx.view.freeCamera = true;
    document.body.classList.add('exploring');
    document.documentElement.style.overflow = 'hidden';
    this.cam.enterExplore(level);
    level.onExploreChange?.(true);
    this.onExploreToggle?.(true);
    this.refreshPanel();
  }

  exitExplore(immediate = false) {
    if (!this.exploring) return;
    this.exploring = false;
    this.cam.exitExplore(immediate);
    this.ctx.view.freeCamera = false;
    document.body.classList.remove('exploring');
    document.documentElement.style.overflow = '';
    this.selected = null;
    this.selectBracket.visible = false;
    this.hud.hideSpot();
    this.views.setFocus(null);
    this.views.setMode('Normal');
    this.hud.setThermalLegend(false);
    this.manager.current?.onExploreChange?.(false);
    this.onExploreToggle?.(false);
    this.refreshPanel();
    this.updateCrumbs(this.manager.currentIndex);
  }

  /** Start (or restart) the signal trace on the current level. */
  beginTrace() {
    this.trace.start(this.manager.current?.tracePlan?.());
  }

  stopTrace() {
    this.trace.stop();
    this.ctx.journey.trace = null;
  }

  /** Explore mode: the orbit target is what the user is looking at (DOF focus, FOV readout). */
  getFocusOverride(): THREE.Vector3 | null {
    return this.exploring ? this.cam.target : null;
  }

  /** Key of the entity currently under the pointer (for label highlighting). */
  get hoverKey(): string | null {
    return this.hover?.key ?? null;
  }

  /** Programmatic selection, used by the label layer and the command palette. */
  selectEntity(hit: PickHit) {
    if (!this.exploring) this.enterExplore();
    this.select(hit);
  }

  // ---------------------------------------------------------------- per frame
  /** Runs after the level positioned the camera (and after the dive). */
  update(dt: number, content = 0) {
    const level = this.manager.current;
    this.tracer.update(level, this.ctx.journey.follow, content, this.ctx.renderer.getPixelRatio());
    if (this.cam.update(dt, level?.getLookAt() ?? null)) this.pointerDirty = true;

    // Hover raycast, throttled.
    const now = performance.now();
    if (this.pointerInside && this.pointerDirty && now - this.lastRay > 45 && !this.cam.flying) {
      this.lastRay = now;
      this.pointerDirty = false;
      const hit = this.raycast();
      if (hit?.key !== this.hover?.key) this.setHover(hit);
      else if (hit && this.hover) this.hover.box.copy(hit.box);
    }

    this.cam.updateViewShift(dt, this.hud.inspectorRect());
    this.views.update(dt);
    this.trace.step(dt);
    this.hud.tickReadouts();

    // Screen-space UI follows its 3D anchors.
    if (this.hover && this.hover.key !== this.selected?.key) {
      const p = this.cam.project(this.hover.box);
      if (p) this.hud.showTip(this.hover.key, this.hover.info, p.x, p.y);
      else this.hud.hideTip();
    }
    if (this.selected) {
      const p = this.cam.project(this.selected.box);
      if (p) this.hud.setSpot(p.x, p.y, p.r);
    }
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
    for (const a of this.selected?.info.actions ?? []) actions.push(a);
    if (this.selected)
      actions.push({ label: content.ui.recentre, run: () => this.selected && this.cam.focusOn(this.selected.box) });
    if (index < count - 1)
      actions.push({
        label: content.ui.dive(this.manager.entries[index + 1].meta.scale),
        run: () => this.jumpToLevel(index + 1),
      });
    if (index > 0)
      actions.push({
        label: content.ui.back(this.manager.entries[index - 1].meta.scale),
        run: () => this.jumpToLevel(index - 1),
      });

    const heading = this.selected
      ? this.selected.info
      : {
          kind: content.ui.explore(level.meta.scale),
          title: level.meta.name,
          specs: [] as [string, string][],
          note: level.pickables?.length ? content.ui.exploreHintPick : content.ui.exploreHintPlain,
        };
    const controls = this.exploring
      ? [...this.views.controls((m: ViewMode) => this.setViewMode(m)), ...(level.controls ?? [])]
      : [];
    this.hud.openInspector(heading, actions, controls);
  }

  setViewMode(mode: ViewMode) {
    if (!this.exploring) this.enterExplore();
    this.views.setMode(mode);
    if (mode === 'X-Ray') this.views.setFocus(this.selected?.object ?? null);
    this.hud.setThermalLegend(mode === 'Thermal');
    this.refreshPanel();
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

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
