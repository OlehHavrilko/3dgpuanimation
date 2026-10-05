import './style.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import {
  BloomEffect,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { LevelManager } from './core/LevelManager';
import { Overlay } from './core/Overlay';
import type { LevelContext } from './core/types';
import { LEVELS } from './levels';
import { InteractionManager } from './interaction/InteractionManager';

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('gl') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  stencil: false,
  powerPreference: 'high-performance',
});
// Quality: ?quality=low|high, otherwise auto (adaptive resolution keeps ~60 fps).
const quality = new URLSearchParams(location.search).get('quality');
const maxPixelRatio = quality === 'low' ? 1 : quality === 'high' ? 2 : 1.75;
const adaptive = quality !== 'high';
let pixelRatio = Math.min(window.devicePixelRatio, maxPixelRatio);
renderer.setPixelRatio(pixelRatio);
renderer.info.autoReset = false; // the composer renders several passes per frame
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.NoToneMapping; // tone mapping happens in the effect chain
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);

const pmrem = new THREE.PMREMGenerator(renderer);
const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

const ctx: LevelContext = { renderer, camera, envMap, view: { freeCamera: false } };

// ---------------------------------------------------------------- post
const composer = new EffectComposer(renderer, {
  frameBufferType: THREE.HalfFloatType,
  multisampling: quality === 'low' ? 0 : Math.min(4, renderer.capabilities.maxSamples),
});
const placeholder = new THREE.Scene();
const renderPass = new RenderPass(placeholder, camera);
const dof = new DepthOfFieldEffect(camera, { focusDistance: 10, focusRange: 5, bokehScale: 1.5, resolutionScale: 0.5 });
const bloom = new BloomEffect({
  mipmapBlur: true,
  luminanceThreshold: 0.62,
  luminanceSmoothing: 0.25,
  intensity: 1.1,
  radius: 0.7,
});
const vignette = new VignetteEffect({ offset: 0.3, darkness: 0.62 });
const toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
const dofPass = new EffectPass(camera, dof);
composer.addPass(renderPass);
composer.addPass(dofPass);
composer.addPass(new EffectPass(camera, bloom, vignette, toneMapping));

// ---------------------------------------------------------------- levels + UI
const flashEl = document.getElementById('flash')!;
const manager = new LevelManager(ctx, LEVELS, flashEl);
const overlay = new Overlay(
  LEVELS.map((l) => l.meta),
  (i) => jumpToLevel(i),
);
const interaction = new InteractionManager(ctx, manager, canvas, (i) => jumpToLevel(i));
manager.onBeforeDispose = (level) => interaction.detach(level.scene);
manager.onSwap = (index, level) => {
  renderPass.mainScene = level.scene;
  overlay.showLevel(index);
  interaction.attach(level, index);
};

const scrollSpace = document.getElementById('scroll-space')!;
scrollSpace.style.height = `${LEVELS.reduce((s, l) => s + l.meta.weight, 0) * 150}vh`;

const scrollState = { p: 0 };
gsap.to(scrollState, {
  p: 1,
  ease: 'none',
  scrollTrigger: {
    trigger: scrollSpace,
    start: 'top top',
    end: 'bottom bottom',
    scrub: 0.9,
  },
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

// ---------------------------------------------------------------- debug (?debug)
const settings = {
  progress: 0,
  override: false,
  bloom: 1.1,
  threshold: 0.62,
  dof: quality !== 'low',
  bokeh: 1,
  timeScale: 1,
  fps: 0,
  frameMs: 0,
  drawCalls: 0,
  triangles: 0,
  pixelRatio: 0,
};

if (new URLSearchParams(location.search).has('debug')) {
  // Handle for automated screenshots / console scrubbing: __teardown.settings.override = true; ...progress = 0.5
  (window as unknown as Record<string, unknown>).__teardown = { settings, manager, renderer };
  import('lil-gui').then(({ default: GUI }) => {
    const gui = new GUI({ title: 'GPU → Atom debug' });
    const perfFolder = gui.addFolder('Performance');
    perfFolder.add(settings, 'fps').listen().disable();
    perfFolder.add(settings, 'frameMs').name('frame ms').listen().disable();
    perfFolder.add(settings, 'drawCalls').name('draw calls').listen().disable();
    perfFolder.add(settings, 'triangles').listen().disable();
    perfFolder.add(settings, 'pixelRatio').name('pixel ratio').listen().disable();
    const tl = gui.addFolder('Timeline');
    tl.add(settings, 'override').name('scrub with slider');
    tl.add(settings, 'progress', 0, 1, 0.0005)
      .listen()
      .onChange((v: number) => {
        if (!settings.override) scrollToProgress(v);
      });
    tl.add(settings, 'timeScale', 0, 3, 0.01).name('time scale');
    const jumps: Record<string, () => void> = {};
    LEVELS.forEach((l, i) => {
      const key = `${i + 1}. ${l.meta.name}`;
      jumps[key] = () => {
        const p = manager.progressForLevel(i);
        settings.progress = p;
        if (!settings.override) scrollToProgress(p);
      };
      tl.add(jumps, key);
    });
    const fx = gui.addFolder('Post');
    fx.add(settings, 'bloom', 0, 4, 0.01);
    fx.add(settings, 'threshold', 0, 1, 0.01).onChange((v: number) => (bloom.luminanceMaterial.threshold = v));
    fx.add(settings, 'dof').name('depth of field').onChange((v: boolean) => (dofPass.enabled = v));
    fx.add(settings, 'bokeh', 0, 4, 0.01).name('bokeh ×');
  });
}

// ---------------------------------------------------------------- loop
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(pixelRatio);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h, false);
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
  interaction.update(rawDt);
  const exploreFocus = interaction.getFocusOverride();

  overlay.setCaption(level.caption);
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
  composer.render(rawDt);
  settings.drawCalls = renderer.info.render.calls;
  settings.triangles = renderer.info.render.triangles;
  settings.pixelRatio = Math.round(pixelRatio * 100) / 100;
  adaptResolution(rawDt);

  fpsAcc += rawDt;
  fpsFrames++;
  if (fpsAcc > 0.5) {
    settings.fps = Math.round(fpsFrames / fpsAcc);
    fpsAcc = 0;
    fpsFrames = 0;
  }
  requestAnimationFrame(frame);
}

/**
 * Adaptive resolution: if the frame rate sits below ~52 fps for 1.5 s, render at fewer
 * pixels; once it has been smooth for 8 s, carefully step back up. Hysteresis + cooldowns
 * keep it from oscillating, and single slow frames (level swaps) never trigger it.
 */
const perf = { ema: 1 / 60, low: 0, good: 0, cooldown: 2 };
function adaptResolution(rawDt: number) {
  perf.ema += (rawDt - perf.ema) * 0.05;
  settings.frameMs = Math.round(perf.ema * 10000) / 10;
  if (!adaptive || document.hidden) return;
  perf.cooldown -= rawDt;
  const fps = 1 / perf.ema;
  perf.low = fps < 52 ? perf.low + rawDt : 0;
  perf.good = fps > 57 ? perf.good + rawDt : 0;
  const ceiling = Math.min(window.devicePixelRatio, maxPixelRatio);
  if (perf.cooldown > 0) return;
  if (perf.low > 1.5 && pixelRatio > 0.6) {
    pixelRatio = Math.max(0.6, pixelRatio * 0.85);
    perf.low = 0;
    perf.cooldown = 2;
    resize();
  } else if (perf.good > 8 && pixelRatio < ceiling) {
    pixelRatio = Math.min(ceiling, pixelRatio * 1.1);
    perf.good = 0;
    perf.cooldown = 4;
    resize();
  }
}

requestAnimationFrame(frame);
