import './style.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { LevelManager } from './core/LevelManager';
import { LevelProfiler } from './core/LevelProfiler';
import { Overlay } from './core/Overlay';
import type { LevelContext } from './core/types';
import { LEVELS } from './levels';
import { InteractionManager } from './interaction/InteractionManager';
import { AdaptiveResolution } from './app/AdaptiveResolution';
import { createPostFx } from './app/postfx';
import { createSettings, readQuality } from './app/settings';
import { setupTour } from './app/tour';
import { setupDebugPanel } from './app/debugPanel';
import { applyStaticText } from './app/staticText';

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);
applyStaticText();

// ---------------------------------------------------------------- renderer + post
const quality = readQuality(location.search);
const debug = new URLSearchParams(location.search).has('debug');
const settings = createSettings(quality);
const maxPixelRatio = quality === 'low' ? 1 : quality === 'high' ? 2 : 1.75;

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  stencil: false,
  powerPreference: 'high-performance',
});
const resolution = new AdaptiveResolution(
  Math.min(window.devicePixelRatio, maxPixelRatio),
  () => Math.min(window.devicePixelRatio, maxPixelRatio),
  quality !== 'high',
);
renderer.setPixelRatio(resolution.pixelRatio);
renderer.info.autoReset = false; // the composer renders several passes per frame
renderer.toneMapping = THREE.NoToneMapping; // tone mapping happens in the effect chain
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);
const pmrem = new THREE.PMREMGenerator(renderer);
const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();
const post = createPostFx(renderer, camera, quality);

// ---------------------------------------------------------------- levels + interaction
const ctx: LevelContext = {
  renderer,
  camera,
  envMap,
  view: { freeCamera: false },
  journey: { trace: null, follow: false },
  go: (i) => jumpToLevel(i),
  trace: (chip, levelIndex) => {
    ctx.journey.trace = { chip };
    if (manager.currentIndex === levelIndex) interaction.beginTrace();
    else jumpToLevel(levelIndex);
  },
};

const manager = new LevelManager(ctx, LEVELS, document.getElementById('flash')!);
const profiler = new LevelProfiler(renderer);
manager.profiler = profiler;
const overlay = new Overlay(
  LEVELS.map((l) => l.meta),
  (i) => jumpToLevel(i),
);
const interaction = new InteractionManager(ctx, manager, canvas, (i) => jumpToLevel(i));
manager.onBeforeDispose = (level) => interaction.detach(level.scene);
manager.onSwap = (index, level) => {
  post.renderPass.mainScene = level.scene;
  overlay.showLevel(index);
  interaction.attach(level, index);
};

// ---------------------------------------------------------------- scroll
const totalWeight = LEVELS.reduce((s, l) => s + l.meta.weight, 0);
const scrollSpace = document.getElementById('scroll-space')!;
scrollSpace.style.height = `${totalWeight * 150}vh`;
const scrollState = { p: 0 };
gsap.to(scrollState, {
  p: 1,
  ease: 'none',
  scrollTrigger: { trigger: scrollSpace, start: 'top top', end: 'bottom bottom', scrub: 0.9 },
});
const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;
const scrollToProgress = (p: number) => window.scrollTo({ top: p * maxScroll(), behavior: 'instant' });

/**
 * Fly to another scale by scrolling there: going forward passes through each dive, so the
 * transition stays cinematic. Leaves Explore mode first (it locks the scroll).
 */
function jumpToLevel(index: number) {
  interaction.exitExplore();
  const p = manager.progressForLevel(index);
  if (settings.override) {
    gsap.to(settings, { progress: p, duration: 1.6, ease: 'power2.inOut' });
    return;
  }
  const hops = Math.abs(index - manager.currentIndex);
  gsap.to(window, {
    scrollTo: { y: p * maxScroll(), autoKill: true },
    duration: Math.min(1.4 + 0.7 * hops, 4.5),
    ease: 'power2.inOut',
  });
}

setupTour({ ctx, interaction, settings, maxScroll, duration: totalWeight * 11 });

if (debug) {
  // Handle for tests / console scrubbing: __teardown.settings.override = true; ...progress = 0.5
  (window as unknown as Record<string, unknown>).__teardown = {
    settings,
    manager,
    renderer,
    ctx,
    interaction,
    profiler,
  };
  setupDebugPanel({ settings, manager, metas: LEVELS.map((l) => l.meta), post, scrollToProgress });
}

// ---------------------------------------------------------------- loop
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(resolution.pixelRatio);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  post.composer.setSize(w, h, false);
}
window.addEventListener('resize', resize);
resize();

const timer = new THREE.Timer();
timer.connect(document);
let simTime = 0;
let fpsAcc = 0;
let fpsFrames = 0;

function frame(now: number) {
  timer.update(now);
  const rawDt = Math.min(timer.getDelta(), 0.1);
  const dt = rawDt * settings.timeScale;
  simTime += dt;

  const p = settings.override ? settings.progress : scrollState.p;
  if (!settings.override) settings.progress = p;
  manager.setProgress(p);
  const state = manager.tick(dt, simTime);
  const level = manager.current!;
  interaction.update(rawDt, state.content);
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
  const { dof, dofPass, bloom, composer } = post;
  bloom.intensity = settings.bloom * (level.bloom ?? 1);
  const focus = exploreFocus ?? manager.getFocusPoint(state);
  dof.cocMaterial.adoptCameraSettings(camera); // near/far change per level
  if (focus) {
    dof.target = focus;
    dof.cocMaterial.focusRange = camera.position.distanceTo(focus) * 0.55;
  }
  dof.bokehScale = (level.bokeh ?? 1.5) * settings.bokeh;
  // Depth of field is for the cinematic story; in Explore it only gets in the way (and costs).
  dofPass.enabled = settings.dof && !interaction.exploring;

  renderer.info.reset();
  if (profiler.awaitingFirstFrame) {
    const rec = profiler.measureFirstFrame(() => composer.render(rawDt), level.scene);
    if (debug) console.info('[level]', JSON.stringify(rec));
  } else {
    composer.render(rawDt);
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
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
