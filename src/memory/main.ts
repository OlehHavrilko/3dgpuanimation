import '../style.css';
import './memory.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LevelManager } from '../core/LevelManager';
import { LevelProfiler } from '../core/LevelProfiler';
import { FrameDissolve } from '../core/FrameDissolve';
import { Overlay } from '../core/Overlay';
import { PostFX } from '../core/PostFX';
import { projectSphere } from '../core/seam';
import { QUALITY } from '../core/quality';
import { easeInOutCubic } from '../core/math';
import type { LevelContext } from '../core/types';
import { InteractionManager } from '../interaction/InteractionManager';
import { Labels } from '../interaction/Labels';
import { AdaptiveResolution } from '../app/AdaptiveResolution';
import { createSettings } from '../app/settings';
import { setupReference } from '../app/reference';
import { createWarmup } from '../app/warmup';
import { content, lang, LANGS, switchLang } from '../content';
import { memoryContent } from '../content/memory';
import { MEMORY_GRADE_INDEX, MEMORY_LEVELS } from './levels';

/**
 * The memory branch: a side descent from one GDDR7 chip to a single bit, on its own page so the
 * main descent (its acts, anchor numbers, finale and grades, all indexed by level) stays as it
 * is. It reuses the same engine: LevelManager seams, PostFX, Overlay, Explore / inspect, labels,
 * sources & glossary. Scrolling drives it; Space or Play runs it on its own.
 */
const M = memoryContent;
const LEVELS = MEMORY_LEVELS;
const debug = new URLSearchParams(location.search).has('debug');
const settings = createSettings(QUALITY);

// ---------------------------------------------------------------- static text
function applyText() {
  const t = content.ui.static;
  document.documentElement.lang = lang;
  document.title = M.page.title;
  document.querySelector('meta[name="description"]')?.setAttribute('content', M.page.description);
  const get = <T extends object>(o: T, k?: string) => (k && k in o ? (o[k as keyof T] as string) : undefined);
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const v = get(t, el.dataset.i18n);
    if (v !== undefined) el.textContent = v;
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
    const v = get(t, el.dataset.i18nTitle);
    if (v !== undefined) el.title = v;
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-aria]')) {
    const v = get(t, el.dataset.i18nAria);
    if (v !== undefined) el.setAttribute('aria-label', v);
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-mem]')) {
    const v = get(M.page, el.dataset.mem);
    if (v !== undefined) el.textContent = v;
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-mem-title]')) {
    const v = get(M.page, el.dataset.memTitle);
    if (v !== undefined) el.title = v;
  }
  for (const root of document.querySelectorAll<HTMLElement>('.lang-switch')) {
    root.replaceChildren(
      ...LANGS.map(({ id, label, name }) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.lang = id;
        b.textContent = label;
        b.title = name;
        b.setAttribute('aria-pressed', String(id === lang));
        b.addEventListener('click', () => switchLang(id));
        return b;
      }),
    );
  }
}
applyText();

// ---------------------------------------------------------------- renderer + post
const canvas = document.getElementById('gl') as HTMLCanvasElement;
function createRenderer() {
  try {
    return new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'high-performance' });
  } catch (err) {
    document.getElementById('fallback')!.hidden = false;
    throw err;
  }
}
const renderer = createRenderer();
const maxPixelRatio = () => Math.min(Math.max(window.devicePixelRatio, QUALITY.supersample), QUALITY.maxPixelRatio);
const resolution = new AdaptiveResolution(maxPixelRatio(), maxPixelRatio, QUALITY.adaptive, 0.85);
renderer.setPixelRatio(resolution.pixelRatio);
renderer.info.autoReset = false;
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);
function buildEnvTexture() {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return texture;
}
const post = new PostFX(renderer, camera);
const grade = (i: number) => MEMORY_GRADE_INDEX[i] ?? MEMORY_GRADE_INDEX[0];

// ---------------------------------------------------------------- levels + interaction
const ctx: LevelContext = {
  renderer,
  camera,
  envMap: buildEnvTexture(),
  view: { freeCamera: false },
  journey: { trace: null, follow: false },
  go: (i) => jumpToLevel(i),
  trace: () => {},
};
const manager = new LevelManager(ctx, LEVELS, {
  keep: QUALITY.levelCache,
  prepare: QUALITY.levelCache > 0 ? createWarmup(renderer, camera, post.composer) : undefined,
});
post.seam.camera = manager.seamCamera;
const profiler = debug ? new LevelProfiler(renderer) : null;
manager.profiler = profiler;
const overlay = new Overlay(
  LEVELS.map((l) => l.meta),
  (i) => jumpToLevel(i),
  M.accuracy,
);
const interaction = new InteractionManager(ctx, manager, canvas, (i) => jumpToLevel(i), QUALITY);
const dissolve = new FrameDissolve(document.getElementById('dissolve') as HTMLCanvasElement);
const labels = new Labels();
labels.onPick = (hit) => interaction.selectEntity(hit);
let dissolveCapturedFor = -1;

manager.onDeactivate = (level) => {
  interaction.detach(level.scene);
  if (!interaction.exploring && !manager.lastSwapContinuous) dissolve.reveal();
};
manager.onSwap = (index, level) => {
  post.setScene(level.scene);
  post.setGrade(grade(index));
  overlay.showLevel(index);
  interaction.attach(level, index);
  labels.setLevel(level);
  if (manager.lastSwapContinuous) dissolve.reset();
  else dissolve.play();
  dissolveCapturedFor = -1;
};
interaction.onSelect = (hit) => {
  if (hit) stopPlay();
};
const labelsBtn = document.getElementById('nav-labels') as HTMLButtonElement;
interaction.onLabels = () => labelsBtn.classList.toggle('on', labels.toggle());
labelsBtn.addEventListener('click', () => interaction.onLabels?.());

setupReference({
  metas: LEVELS.map((l) => l.meta),
  jumpToLevel: (i) => jumpToLevel(i),
  data: M.reference,
});

// ---------------------------------------------------------------- scroll, jumps and play
// The page scroll is the timeline; it is eased so wheel steps glide. A jump or Play takes the
// timeline over (`settings.override`) and hands it back to the scrollbar when it ends.
const totalWeight = LEVELS.reduce((s, l) => s + l.meta.weight, 0);
document.getElementById('scroll-space')!.style.height = `${totalWeight * 150}vh`;
const maxScroll = () => Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
const scrollToProgress = (p: number) => window.scrollTo({ top: p * maxScroll(), behavior: 'instant' });
let scrolled = 0;

let tween: { from: number; to: number; t: number; dur: number } | null = null;
let playing = false;
const playBtn = document.getElementById('mem-play') as HTMLButtonElement;
/** Seconds the whole branch takes when played. */
const PLAY_SECONDS = totalWeight * 16;

function releaseTimeline() {
  scrolled = settings.progress;
  settings.override = false;
  scrollToProgress(settings.progress);
}

function jumpToLevel(index: number, local?: number) {
  stopPlay();
  interaction.exitExplore();
  const to = manager.progressForLevel(index, local);
  const hops = Math.abs(index - manager.currentIndex);
  settings.override = true;
  tween = { from: settings.progress, to, t: 0, dur: Math.min(1.4 + 0.8 * hops, 4.2) };
}

function setPlaying(on: boolean) {
  playing = on;
  playBtn.textContent = on ? M.page.pause : M.page.play;
  playBtn.classList.toggle('on', on);
  if (on) {
    tween = null;
    interaction.exitExplore();
    settings.override = true;
    if (settings.progress > 0.995) settings.progress = 0;
  } else if (settings.override && !tween) releaseTimeline();
}
function stopPlay() {
  if (playing) setPlaying(false);
}
playBtn.addEventListener('click', () => setPlaying(!playing));
interaction.onSpace = () => setPlaying(!playing);
const interrupt = () => {
  stopPlay();
  if (tween) {
    tween = null;
    releaseTimeline();
  }
};
window.addEventListener('wheel', interrupt, { passive: true });
window.addEventListener('touchmove', interrupt, { passive: true });

// ---------------------------------------------------------------- deep links
// Same shape as the main page: `#l=3&p=40` opens at a scale and a point inside it.
const deep = new URLSearchParams(location.hash.replace(/^#/, ''));
const deepLevel = Number(deep.get('l'));
if (Number.isInteger(deepLevel) && deepLevel >= 1 && deepLevel <= LEVELS.length) {
  const local = deep.has('p') ? Math.min(99, Math.max(0, Number(deep.get('p')))) / 100 : undefined;
  requestAnimationFrame(() => jumpToLevel(deepLevel - 1, local));
}
let lastHash = '';
let lastHashAt = 0;
function syncHash(local: number) {
  const now = performance.now();
  const h = `#l=${manager.currentIndex + 1}&p=${Math.min(95, Math.round((local * 100) / 5) * 5)}`;
  if (h === lastHash || now - lastHashAt < 400) return;
  lastHash = h;
  lastHashAt = now;
  if (location.hash !== h) history.replaceState(null, '', h);
}

const endCard = document.getElementById('mem-end')!;
let endShown = false;

// ---------------------------------------------------------------- WebGL context loss
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
const clock = {
  paused: false,
  reset(time = 0) {
    simTime = time;
  },
  step(frames = 1, dt = 1 / 60) {
    for (let i = 0; i < frames; i++) renderFrame(dt);
  },
};
if (debug) {
  (window as unknown as Record<string, unknown>).__teardown = {
    settings,
    manager,
    renderer,
    ctx,
    interaction,
    profiler,
    post,
    labels,
    clock,
  };
}

function frame(now: number) {
  timer.update(now);
  if (!contextLost && !clock.paused) renderFrame(Math.min(timer.getDelta(), 0.1));
  requestAnimationFrame(frame);
}

function renderFrame(rawDt: number) {
  simTime += rawDt * settings.timeScale;
  const dt = rawDt * settings.timeScale;

  if (tween) {
    tween.t = Math.min(1, tween.t + rawDt / tween.dur);
    settings.progress = tween.from + (tween.to - tween.from) * easeInOutCubic(tween.t);
    if (tween.t >= 1) {
      tween = null;
      releaseTimeline();
    }
  } else if (playing) {
    settings.progress = Math.min(1, settings.progress + rawDt / PLAY_SECONDS);
    if (settings.progress >= 1) setPlaying(false);
  }
  if (!settings.override) {
    const target = Math.min(1, Math.max(0, window.scrollY / maxScroll()));
    scrolled += (target - scrolled) * (1 - Math.exp(-rawDt / 0.18));
    if (Math.abs(target - scrolled) < 1e-5) scrolled = target;
    settings.progress = scrolled;
  }
  const p = settings.progress;
  manager.setProgress(p);
  const state = manager.tick(dt, simTime);
  const level = manager.current!;
  interaction.update(rawDt, state.content);
  manager.syncSeamCamera();
  labels.update(camera, interaction.hoverKey);
  labelTimer -= rawDt;
  if (labelTimer <= 0) {
    labelTimer = 0.4;
    labels.refreshBoxes(level);
  }
  if (!document.body.classList.contains('reference-open')) syncHash(state.local);

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

  const atEnd = state.index === LEVELS.length - 1 && state.local > 0.93 && !interaction.exploring;
  if (atEnd !== endShown) {
    endShown = atEnd;
    endCard.classList.toggle('on', atEnd);
    document.body.classList.toggle('mem-ended', atEnd);
    endCard.setAttribute('aria-hidden', String(!atEnd));
  }

  const { dof, dofPass, bloom } = post;
  const next = manager.seamLevel;
  post.seam.scene = next?.scene ?? null;
  post.seamPass.enabled = !!next;
  post.setGradeBlend(grade(state.index), grade(next ? state.index + 1 : state.index), next ? state.seam : 0);
  if (next) {
    post.seam.mix = state.seam;
    const target = level.getTransitionTarget();
    post.seam.radius = projectSphere(camera, target.position, target.radius, post.seam.centre);
  }
  const levelBloom = (level.bloom ?? 1) + ((next?.bloom ?? 1) - (level.bloom ?? 1)) * state.seam;
  bloom.intensity = settings.bloom * levelBloom * post.grade.bloom;
  const focus = exploreFocus ?? manager.getFocusPoint(state);
  dof.cocMaterial.adoptCameraSettings(camera);
  if (focus) {
    dof.target = focus;
    dof.cocMaterial.focusRange = camera.position.distanceTo(focus) * 0.55;
  }
  dof.bokehScale = (level.bokeh ?? 1.5) * settings.bokeh * (1 - state.seam) * state.arrival;
  dofPass.enabled = settings.dof && !interaction.exploring;

  renderer.info.reset();
  if (profiler?.measuring) {
    const rec = profiler.measure(() => post.render(rawDt), level.scene);
    if (rec && debug) console.info('[level]', JSON.stringify(rec));
  } else {
    post.render(rawDt);
  }
  if (!interaction.exploring && state.dive > 0.9 && dissolveCapturedFor !== state.index) {
    dissolveCapturedFor = state.index;
    dissolve.capture(canvas);
  }
  settings.drawCalls = renderer.info.render.calls;
  settings.triangles = renderer.info.render.triangles;
  if (resolution.step(rawDt, document.hidden) !== null) resize();
  fpsAcc += rawDt;
  fpsFrames++;
  if (fpsAcc > 0.5) {
    settings.fps = Math.round(fpsFrames / fpsAcc);
    fpsAcc = 0;
    fpsFrames = 0;
  }
}

requestAnimationFrame(frame);
