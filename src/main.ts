import './style.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LevelManager } from './core/LevelManager';
import { LevelProfiler } from './core/LevelProfiler';
import { Attract } from './core/Attract';
import { FrameDissolve } from './core/FrameDissolve';
import { Overlay } from './core/Overlay';
import { PostFX } from './core/PostFX';
import { Story } from './core/Story';
import { Tour, type TourSegment } from './core/Tour';
import { projectSphere } from './core/seam';
import { ease, scrubScroll, tweens, type Tween } from './core/tween';
import { QUALITY } from './core/quality';
import type { LevelContext } from './core/types';
import { LEVELS } from './levels';
import { InteractionManager } from './interaction/InteractionManager';
import { Labels } from './interaction/Labels';
import type { ViewMode } from './interaction/ViewModes';
import { AdaptiveResolution } from './app/AdaptiveResolution';
import { createSettings } from './app/settings';
import { setupFollow } from './app/follow';
import { setupSound } from './app/sound';
import { setupPalette } from './app/palette';
import { setupDebugPanel } from './app/debugPanel';
import { applyStaticText } from './app/staticText';
import { setupReference } from './app/reference';
import { createWarmup } from './app/warmup';
import { registerServiceWorker } from './app/pwa';

applyStaticText();
registerServiceWorker();

// ---------------------------------------------------------------- renderer + post
// Device-tiered quality: ?quality=low|high forces a preset, otherwise it is probed.
const debug = new URLSearchParams(location.search).has('debug');
const settings = createSettings(QUALITY);

const canvas = document.getElementById('gl') as HTMLCanvasElement;
/** No WebGL (blocked, disabled or no GPU): show the static fallback instead of a black page. */
function createRenderer() {
  try {
    return new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
  } catch (err) {
    document.getElementById('intro')?.remove();
    document.getElementById('fallback')!.hidden = false;
    throw err;
  }
}
const renderer = createRenderer();
const maxPixelRatio = () => Math.min(Math.max(window.devicePixelRatio, QUALITY.supersample), QUALITY.maxPixelRatio);
// Never drop far below native: a 0.6x frame reads as soap, so the floor stays near 1 CSS pixel
// (above it on phones, whose 3x screens make anything under ~1.25x visibly blocky).
const resolution = new AdaptiveResolution(maxPixelRatio(), maxPixelRatio, QUALITY.adaptive, QUALITY.minPixelRatio);
renderer.setPixelRatio(resolution.pixelRatio);
renderer.info.autoReset = false; // the composer renders several passes per frame
renderer.toneMapping = THREE.NoToneMapping; // tone mapping happens in the effect chain
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);

/** (Re)build the neutral studio environment. Also runs after a WebGL context restore. */
function buildEnvTexture() {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return texture;
}
const post = new PostFX(renderer, camera);

// ---------------------------------------------------------------- levels + interaction
const ctx: LevelContext = {
  renderer,
  camera,
  envMap: buildEnvTexture(),
  view: { freeCamera: false },
  journey: { trace: null, follow: false },
  go: (i) => jumpToLevel(i),
  trace: (chip, levelIndex) => {
    ctx.journey.trace = { chip };
    if (manager.currentIndex === levelIndex) interaction.beginTrace();
    else jumpToLevel(levelIndex);
  },
};

// Current + previous + next stay built and warmed up (QUALITY.levelCache; ?cache=0 turns it off).
const manager = new LevelManager(ctx, LEVELS, {
  keep: QUALITY.levelCache,
  prepare: QUALITY.levelCache > 0 ? createWarmup(renderer, camera, post.composer) : undefined,
});
post.seam.camera = manager.seamCamera;
// The profiler stalls the GPU (readPixels) on every swap: debug builds only.
const profiler = debug ? new LevelProfiler(renderer) : null;
manager.profiler = profiler;
const overlay = new Overlay(
  LEVELS.map((l) => l.meta),
  (i) => jumpToLevel(i),
);
const interaction = new InteractionManager(ctx, manager, canvas, (i) => jumpToLevel(i), QUALITY);
const dissolve = new FrameDissolve(document.getElementById('dissolve') as HTMLCanvasElement);
const labels = new Labels();
labels.onPick = (hit) => interaction.selectEntity(hit);
const sound = setupSound();
/** Level index whose outgoing frame is already frozen for the next dissolve. */
let dissolveCapturedFor = -1;

manager.onDeactivate = (level) => {
  interaction.detach(level.scene);
  // A swap inside the seam needs no cover: the next level is already on screen. Anything else
  // (a scrub that skipped the seam) freezes the outgoing frame; play() runs after the swap.
  if (!interaction.exploring && !manager.lastSwapContinuous) dissolve.reveal();
};
manager.onSwap = (index, level) => {
  post.setScene(level.scene);
  post.setGrade(index);
  overlay.showLevel(index);
  interaction.attach(level, index);
  labels.setLevel(level);
  sound.ambience.setScene(index);
  sound.ambience.whoosh();
  if (manager.lastSwapContinuous) dissolve.reset();
  else dissolve.play();
  dissolveCapturedFor = -1;
  applyDeepLink(index);
};

interaction.onSound = () => sound.toggleFromKey();
interaction.onSelect = (hit) => {
  sound.ambience.blip(!!hit);
  // Inspecting a part is deliberate input: take the tour out of autopilot.
  if (hit) tour.interrupt();
};
const labelsBtn = document.getElementById('nav-labels') as HTMLButtonElement;
interaction.onLabels = () => labelsBtn.classList.toggle('on', labels.toggle());
labelsBtn.addEventListener('click', () => interaction.onLabels?.());

// ---------------------------------------------------------------- scroll
const totalWeight = LEVELS.reduce((s, l) => s + l.meta.weight, 0);
const scrollSpace = document.getElementById('scroll-space')!;
scrollSpace.style.height = `${totalWeight * 150}vh`;
const scrollState = { p: 0 };
// Page scroll across the scroll space → 0..1, trailing the scrollbar by 0.9 s.
scrubScroll(scrollSpace, scrollState, 0.9);
const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;
const scrollToProgress = (p: number) => window.scrollTo({ top: p * maxScroll(), behavior: 'instant' });

/**
 * Fly to another scale by scrolling there: going forward passes through each dive, so the
 * transition stays cinematic. Leaves Explore mode first (it locks the scroll).
 */
function jumpToLevel(index: number, local?: number) {
  tour.stop(); // a manual jump always takes the wheel back from the tour
  interaction.exitExplore();
  const p = manager.progressForLevel(index, local);
  if (settings.override) {
    tweens.to(settings, { progress: p }, { duration: 1.6, ease: ease.power2InOut });
    return;
  }
  const hops = Math.abs(index - manager.currentIndex);
  tweens.scrollTo(p * maxScroll(), {
    autoKill: true,
    duration: Math.min(1.4 + 0.7 * hops, 4.5),
    ease: ease.power2InOut,
  });
}

// ---------------------------------------------------------------- guided tour + follow
const tourSegments: TourSegment[] = LEVELS.map((l, i) => ({
  index: i,
  start: manager.segments[i].start,
  end: manager.segments[i].end,
  name: l.meta.name,
  scale: l.meta.scale,
}));
const tour = new Tour(
  {
    getProgress: () => settings.progress,
    // The tour drives the timeline directly; the scrollbar is restored by `end`.
    setProgress: (p) => {
      settings.override = true;
      settings.progress = p;
    },
    begin: () => {
      follow.stop(); // hand the timeline over from follow mode
      interaction.exitExplore();
      interaction.stopTrace();
      settings.override = true;
    },
    end: (p) => {
      // Sync the scroll state first so the manager doesn't read a stale value for one frame.
      scrollState.p = p;
      settings.progress = p;
      settings.override = false;
      scrollToProgress(p);
    },
  },
  tourSegments,
);
const follow = setupFollow({
  ctx,
  interaction,
  settings,
  maxScroll,
  duration: totalWeight * 11,
  onStart: () => tour.stop(),
});
interaction.onSpace = () => {
  // At the finale, Space is the natural "again" — everything else is a no-op from p = 1.
  if (story.finaleVisible) {
    story.replay();
    return;
  }
  tour.toggle();
  if (tour.playing) sound.offer();
};
// The reverse zoom owns the timeline like the tour does; any deliberate input ends it.
let zoomTween: Tween | null = null;
function releaseZoom() {
  zoomTween = null;
  scrollState.p = settings.progress;
  settings.override = false;
  scrollToProgress(settings.progress);
}
const stopZoom = () => {
  if (!zoomTween) return;
  zoomTween.kill();
  releaseZoom();
};
window.addEventListener('wheel', stopZoom, { passive: true });
window.addEventListener('touchmove', stopZoom, { passive: true });
window.addEventListener('keydown', (e) => e.code === 'Escape' && stopZoom());
// Any deliberate input hands control back from the tour to the user.
window.addEventListener('wheel', () => tour.interrupt(), { passive: true });
window.addEventListener('touchmove', () => tour.interrupt(), { passive: true });

// ---------------------------------------------------------------- intro + attract mode
// While the landing card is up the scene keeps moving: a slow drift through the first
// scale so the first thing a visitor sees is a live render rather than a still frame.
const attract = new Attract();
const intro = document.getElementById('intro')!;
let introDone = false;
let firstFrameRendered = false;
function dismissIntro(fromScroll = false) {
  if (introDone) return;
  introDone = true;
  intro.classList.add('hide');
  // Don't leave keyboard focus on a button that is fading out.
  if (document.activeElement instanceof HTMLElement && intro.contains(document.activeElement)) {
    document.activeElement.blur();
  }
  // Hand the attract drift over to the scrollbar so the landing settles where it was.
  if (attract.active) {
    attract.stop();
    scrollState.p = settings.progress;
    settings.override = false;
    // A scrollbar drag has already moved the page: keep it rather than snapping back.
    if (!fromScroll) scrollToProgress(settings.progress);
  }
}
function startTourFromIntro() {
  dismissIntro();
  tour.start();
  sound.offer();
}
document.getElementById('intro-tour')!.addEventListener('click', startTourFromIntro);
document.getElementById('intro-explore')!.addEventListener('click', () => dismissIntro());
// Scrolling is the other way in: a wheel, a swipe or a scrollbar drag closes the card.
window.addEventListener('wheel', () => dismissIntro(), { passive: true });
window.addEventListener('touchmove', () => dismissIntro(), { passive: true });
window.addEventListener('scroll', () => dismissIntro(true), { passive: true });
window.addEventListener(
  'keydown',
  (e) => {
    if (introDone) return;
    // A focused intro button handles Enter / Space itself.
    const onControl = e.target instanceof Element && !!e.target.closest('button, a');
    if ((e.code === 'Enter' || e.code === 'Space') && !onControl) {
      e.preventDefault();
      startTourFromIntro();
    } else if (e.code === 'Escape') {
      dismissIntro();
    } else if (e.code === 'Tab' || e.metaKey || e.ctrlKey || e.altKey || (e.shiftKey && e.code === 'KeyF')) {
      return; // focus moves, browser shortcuts and fullscreen still work behind the card
    }
    // Scene shortcuts (E, F, L, M, G, 1-8, arrows) stay off until the card is gone.
    e.stopImmediatePropagation();
  },
  { capture: true },
);
if (new URLSearchParams(location.search).has('nointro')) {
  introDone = true;
  intro.classList.add('hide');
}
// Reduced-motion visitors get a still frame: correct, and the render is composed for it.
if (!introDone && !QUALITY.reducedMotion) {
  const s = manager.segments[0];
  attract.start(0, s.start + (s.end - s.start) * 0.42);
}

// ---------------------------------------------------------------- narrative layer
// Acts, anchor numbers, the clean shot and the finale. Reads the frame state each tick
// and drives its own DOM; it never touches the renderer or the camera (the loop does the
// finale pull-back from `story.pullback`, and hands it the frame for Share).
const story = new Story({
  getLevelCount: () => LEVELS.length,
  introVisible: () => !introDone,
  levelName: (i) => LEVELS[i].meta.name,
  levelScale: (i) => LEVELS[i].meta.scale,
  levelCaption: () => manager.current?.caption ?? '',
  stopTour: () => tour.stop(),
  replay: () => tour.restart(),
  zoomOut: (done) => {
    tour.stop();
    interaction.exitExplore();
    settings.override = true;
    // Same path as scrolling back up, just fast: the seams work in both directions. Slow
    // at the atom, quickest through the middle, easing into the card.
    zoomTween?.kill();
    zoomTween = tweens.to(
      settings,
      { progress: 0 },
      {
        duration: 20,
        ease: ease.power2InOut,
        onComplete: () => {
          releaseZoom();
          done();
        },
      },
    );
  },
  enterExplore: () => interaction.enterExplore(),
  getCanvas: () => canvas,
});

const reference = setupReference({ metas: LEVELS.map((l) => l.meta), jumpToLevel: (i) => jumpToLevel(i) });

setupPalette({
  metas: LEVELS.map((l) => l.meta),
  manager,
  interaction,
  labels,
  jumpToLevel,
  enabled: () => introDone,
  openReference: (tab) => reference.toggle(tab, true),
});

// ---------------------------------------------------------------- deep links
// `#l=5&p=40&v=Section` opens straight at a scale, a point inside it (percent) and a view mode:
// handy for sharing a frame.
const deepParams = new URLSearchParams(location.hash.replace(/^#/, ''));
const deepLevel = Number(deepParams.get('l'));
const deepLocal = deepParams.has('p') ? Math.min(99, Math.max(0, Number(deepParams.get('p')))) / 100 : NaN;
const deepMode = deepParams.get('v') as ViewMode | null;
let deepApplied = false;

function applyDeepLink(index: number) {
  if (deepApplied || !deepMode) return;
  if (!Number.isInteger(deepLevel) || index !== deepLevel - 1) return;
  deepApplied = true;
  if (deepMode === 'X-Ray' || deepMode === 'Section' || deepMode === 'Thermal') interaction.setViewMode(deepMode);
}
if (Number.isInteger(deepLevel) && deepLevel >= 1 && deepLevel <= LEVELS.length) {
  dismissIntro();
  requestAnimationFrame(() => jumpToLevel(deepLevel - 1, Number.isFinite(deepLocal) ? deepLocal : undefined));
}

let lastHashKey = '';
let lastHashAt = 0;
/** Keep the URL in step with the current scale, the point inside it and the view mode. */
function hashFor(local: number) {
  const mode = interaction.views.mode;
  const l = manager.currentIndex + 1;
  // 5 % steps: precise enough to land on the same frame, coarse enough to stay readable.
  const p = Math.round((local * 100) / 5) * 5;
  return `#l=${l}&p=${Math.min(95, p)}${mode && mode !== 'Normal' ? `&v=${mode}` : ''}`;
}
function syncHash(local: number) {
  const now = performance.now();
  const h = hashFor(local);
  // Safari rejects more than 100 replaceState calls in 30 s; a fast scroll would hit that.
  if (h === lastHashKey || now - lastHashAt < 400) return;
  lastHashKey = h;
  lastHashAt = now;
  if (location.hash !== h) history.replaceState(null, '', h);
}

if (debug) {
  // Handle for tests / console scrubbing: __teardown.settings.override = true; ...progress = 0.5
  (window as unknown as Record<string, unknown>).__teardown = {
    settings,
    manager,
    renderer,
    ctx,
    interaction,
    profiler,
    post,
    tour,
    story,
    labels,
    tweens,
  };
  setupDebugPanel({ settings, manager, metas: LEVELS.map((l) => l.meta), post, scrollToProgress });
}

// ---------------------------------------------------------------- WebGL context loss
// A lost context (GPU reset, tab eviction, driver crash) must not leave a frozen black
// canvas. We stop rendering, then rebuild the environment and resume on restore.
let contextLost = false;
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  contextLost = true;
  dissolve.reset();
  document.body.classList.add('context-lost');
});
canvas.addEventListener('webglcontextrestored', () => {
  contextLost = false;
  document.body.classList.remove('context-lost');
  ctx.envMap = buildEnvTexture();
  if (manager.current) manager.current.scene.environment = ctx.envMap;
  // Cached scenes point at the lost environment and GPU state; let them rebuild.
  manager.dropCache();
  resize();
});

// ---------------------------------------------------------------- loop
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(resolution.pixelRatio);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  post.setSize(w, h);
}
window.addEventListener('resize', resize);
resize();

const timer = new THREE.Timer();
timer.connect(document);
let simTime = 0;
let fpsAcc = 0;
let fpsFrames = 0;
let labelTimer = 0;

/**
 * Debug clock for deterministic frames (visual tests): pause the loop, set the simulation
 * time, then advance an exact number of frames at a fixed step. Same steps, same pixels.
 */
const clock = {
  paused: false,
  reset(time = 0) {
    simTime = time;
  },
  step(frames = 1, dt = 1 / 60) {
    for (let i = 0; i < frames; i++) renderFrame(dt);
  },
};
if (debug) Object.assign((window as unknown as { __teardown: object }).__teardown, { clock });

function frame(now: number) {
  timer.update(now);
  if (!contextLost && !clock.paused) renderFrame(Math.min(timer.getDelta(), 0.1));
  requestAnimationFrame(frame);
}

function renderFrame(rawDt: number) {
  const dt = rawDt * settings.timeScale;
  simTime += dt;

  // The landing runs its own slow drift and writes to the timeline until it hands off.
  if (attract.active) {
    settings.override = true;
    settings.progress = attract.update(rawDt);
  }
  tour.update(rawDt);

  const p = settings.override ? settings.progress : scrollState.p;
  if (!settings.override) settings.progress = p;
  manager.setProgress(p);
  const state = manager.tick(dt, simTime);
  const level = manager.current!;
  // Finale: ease the camera back off the atom for the closing composition.
  if (story.pullback > 0) {
    const look = level.getLookAt();
    camera.position
      .sub(look)
      .multiplyScalar(1 + story.pullback * 0.45)
      .add(look);
  }
  story.update(state, rawDt);
  interaction.update(rawDt, state.content);
  manager.syncSeamCamera(); // after parallax: the next level sees the final camera
  labels.update(camera, interaction.hoverKey);
  labelTimer -= rawDt;
  if (labelTimer <= 0) {
    labelTimer = 0.4;
    labels.refreshBoxes(level);
  }
  if (!reference.open) syncHash(state.local);
  const exploreFocus = interaction.getFocusOverride();

  overlay.setCaption(ctx.journey.follow && level.followCaption ? level.followCaption : level.caption);
  overlay.setFov(
    exploreFocus
      ? 2 *
          camera.position.distanceTo(exploreFocus) *
          Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) *
          camera.aspect *
          level.meta.unitMeters
      : state.fovMeters,
  );
  overlay.setProgress(p);

  // Per-level post settings (DOF works in the level's local units).
  const { dof, dofPass, bloom } = post;
  // Seamless descent: while the next scale is revealed, its look blends in with it.
  const next = manager.seamLevel;
  post.seam.scene = next?.scene ?? null;
  if (!next) post.seam.mix = 0;
  post.setGradeBlend(state.index, next ? state.index + 1 : state.index, next ? state.seam : 0);
  if (next) {
    post.seam.mix = state.seam;
    const target = level.getTransitionTarget();
    post.seam.radius = projectSphere(camera, target.position, target.radius, post.seam.centre);
  }
  const levelBloom = (level.bloom ?? 1) + ((next?.bloom ?? 1) - (level.bloom ?? 1)) * state.seam;
  bloom.intensity = settings.bloom * levelBloom * post.grade.bloom;
  const focus = exploreFocus ?? manager.getFocusPoint(state);
  dof.cocMaterial.adoptCameraSettings(camera); // near/far change per level
  if (focus) {
    dof.target = focus;
    dof.cocMaterial.focusRange = camera.position.distanceTo(focus) * 0.55;
  }
  // DOF uses the current level's depth: fade it out as the next scale takes over, and back in
  // once the new level has settled.
  dof.bokehScale = (level.bokeh ?? 1.5) * settings.bokeh * (1 - state.seam) * state.arrival;
  // Depth of field is for the cinematic story; in Explore it only gets in the way (and costs).
  dofPass.enabled = settings.dof && !interaction.exploring;

  renderer.info.reset();
  if (profiler?.measuring) {
    const rec = profiler.measure(() => post.render(rawDt), level.scene);
    if (rec && debug) console.info('[level]', JSON.stringify(rec));
  } else {
    post.render(rawDt);
  }
  // Share frame grabs the just-drawn buffer: readable synchronously, blank if deferred.
  story.captureFrame(state);
  if (!firstFrameRendered) {
    firstFrameRendered = true;
    intro.classList.add('loaded');
    void manager.loadAll(); // the other scales' scene code, in the background
  }
  // Freeze one frame per dive for the boundary dissolve. Copying the drawing buffer is not
  // free (it can flush the GPU), so this is done once, late in the dolly — not every frame.
  if (!interaction.exploring && state.dive > 0.9 && dissolveCapturedFor !== state.index) {
    dissolveCapturedFor = state.index;
    dissolve.capture(canvas);
  }
  settings.drawCalls = renderer.info.render.calls;
  settings.triangles = renderer.info.render.triangles;
  settings.pixelRatio = Math.round(resolution.pixelRatio * 100) / 100;
  if (resolution.step(rawDt, document.hidden) !== null) resize();
  settings.frameMs = Math.round(resolution.ema * 10000) / 10;

  fpsAcc += rawDt;
  fpsFrames++;
  if (fpsAcc > 0.5) {
    settings.fps = Math.round(fpsFrames / fpsAcc);
    fpsAcc = 0;
    fpsFrames = 0;
  }
}

requestAnimationFrame(frame);
