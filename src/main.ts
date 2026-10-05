import './style.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { LevelManager } from './core/LevelManager';
import { Ambience } from './core/Audio';
import { Attract } from './core/Attract';
import { FrameDissolve } from './core/FrameDissolve';
import { Overlay } from './core/Overlay';
import { PostFX } from './core/PostFX';
import { Story } from './core/Story';
import { Tour, type TourSegment } from './core/Tour';
import { QUALITY, qualityLabel } from './core/quality';
import type { LevelContext } from './core/types';
import { LEVELS } from './levels';
import { InteractionManager } from './interaction/InteractionManager';
import { Labels } from './interaction/Labels';
import { CommandPalette, type PaletteItem } from './interaction/CommandPalette';
import { collectEntities } from './interaction/entities';
import type { ViewMode } from './interaction/ViewModes';

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('gl') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  stencil: false,
  powerPreference: 'high-performance',
});
// Device-tiered quality: ?quality=low|high forces a preset, otherwise it is probed.
const maxPixelRatio = QUALITY.maxPixelRatio;
const adaptive = QUALITY.adaptive;
let pixelRatio = Math.min(window.devicePixelRatio, maxPixelRatio);
renderer.setPixelRatio(pixelRatio);
renderer.info.autoReset = false; // the composer renders several passes per frame
renderer.setSize(window.innerWidth, window.innerHeight, false);
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
const envMap = buildEnvTexture();

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

// ---------------------------------------------------------------- post
const post = new PostFX(renderer, camera);

// ---------------------------------------------------------------- levels + UI
const flashEl = document.getElementById('flash')!;
const dissolve = new FrameDissolve(document.getElementById('dissolve') as HTMLCanvasElement);
const manager = new LevelManager(ctx, LEVELS, flashEl, {
  sceneCache: QUALITY.sceneCache,
  prebuild: QUALITY.prebuild,
});
const overlay = new Overlay(
  LEVELS.map((l) => l.meta),
  (i) => jumpToLevel(i),
);
const interaction = new InteractionManager(ctx, manager, canvas, (i) => jumpToLevel(i), QUALITY);

// ---------------------------------------------------------------- attract mode
// While the landing card is up the scene keeps moving: a slow drift through the first
// scale so the first thing a visitor sees is a live render rather than a still frame.
const attract = new Attract();
const attractTo = () => {
  const s = manager.segments[0];
  return s.start + (s.end - s.start) * 0.42;
};

// ---------------------------------------------------------------- labels + palette
const labels = new Labels();
labels.onPick = (hit) => interaction.selectEntity(hit);

const ambience = new Ambience();
const soundBtn = document.getElementById('nav-sound') as HTMLButtonElement;
const soundInvite = document.getElementById('sound-invite')!;
let soundInviteSeen = false;
try {
  soundInviteSeen = localStorage.getItem('gpu-atom:sound-invite') === 'dismissed';
} catch {
  /* private mode / storage disabled: just show it */
}
const rememberSoundChoice = () => {
  soundInviteSeen = true;
  try {
    localStorage.setItem('gpu-atom:sound-invite', 'dismissed');
  } catch {
    /* ignore */
  }
};
const toggleSound = () => {
  const on = ambience.toggle();
  soundBtn.classList.toggle('on', on);
  soundBtn.textContent = on ? 'Sound on' : 'Sound';
};
soundBtn.addEventListener('click', toggleSound);
/** Starting the descent is a user gesture: the one good moment to offer the sound bed. */
let inviteTimer = 0;
const hideInvite = () => {
  window.clearTimeout(inviteTimer);
  soundInvite.classList.remove('on');
  soundInvite.setAttribute('aria-hidden', 'true');
};
const offerSound = () => {
  if (soundInviteSeen || ambience.enabled) return;
  // Let the Act I card land first: the invitation is the second beat of the opening.
  window.clearTimeout(inviteTimer);
  inviteTimer = window.setTimeout(() => {
    if (soundInviteSeen || ambience.enabled) return;
    soundInvite.classList.add('on');
    soundInvite.setAttribute('aria-hidden', 'false');
    inviteTimer = window.setTimeout(hideInvite, 12000);
  }, 2600);
};
document.getElementById('si-on')!.addEventListener('click', () => {
  hideInvite();
  rememberSoundChoice();
  if (!ambience.enabled) toggleSound();
  ambience.whoosh();
});
document.getElementById('si-off')!.addEventListener('click', () => {
  hideInvite();
  rememberSoundChoice();
});
interaction.onSound = () => {
  toggleSound();
  if (ambience.enabled) rememberSoundChoice();
};
interaction.onSelect = (hit) => {
  ambience.blip(!!hit);
  // Inspecting a part is deliberate input: take the tour out of autopilot.
  if (hit) tour.interrupt();
};

const labelsBtn = document.getElementById('nav-labels') as HTMLButtonElement;
interaction.onLabels = () => labelsBtn.classList.toggle('on', labels.toggle());

const palette = new CommandPalette((): PaletteItem[] => {
  const items: PaletteItem[] = LEVELS.map((l, i) => ({
    id: `lvl-${i}`,
    kind: `Scale ${String(i + 1).padStart(2, '0')}`,
    label: l.meta.name,
    hint: l.meta.scale,
    run: () => jumpToLevel(i),
  }));
  const level = manager.current;
  if (level) {
    for (const hit of collectEntities(level)) {
      items.push({
        id: hit.key,
        kind: 'Part',
        label: hit.info.title,
        hint: hit.info.kind,
        run: () => interaction.selectEntity(hit),
      });
    }
  }
  items.push({
    id: 'cmd-labels',
    kind: 'View',
    label: 'Toggle 3D labels',
    hint: 'L',
    run: () => labels.setVisible(true),
  });
  items.push({
    id: 'cmd-fullscreen',
    kind: 'View',
    label: 'Fullscreen',
    hint: 'F',
    run: () =>
      void (document.fullscreenElement
        ? document.exitFullscreen().catch(() => {})
        : document.documentElement.requestFullscreen?.().catch(() => {})),
  });
  return items;
});

manager.onBeforeDispose = (level) => {
  interaction.detach(level.scene);
  // Freeze the outgoing frame; play() is called on the other side of the swap.
  if (!interaction.exploring) dissolve.reveal();
};
manager.onSwap = (index, level) => {
  post.setScene(level.scene);
  post.setGrade(level.meta.name);
  overlay.showLevel(index);
  interaction.attach(level, index);
  labels.setLevel(level);
  ambience.setScene(index);
  ambience.whoosh();
  dissolve.play();
  dissolveCapturedFor = -1;
  applyDeepLink(index);
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
  activeTour?.stop(); // a manual jump always takes the wheel back from the tour
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

// ---------------------------------------------------------------- follow-the-electron tour
/**
 * Guided tour: scroll from the very top to the very bottom at a steady pace while each level
 * shows where "our" electron is. Pauses in Explore, stops on a second press (or F / Esc).
 */
let followTween: gsap.core.Tween | null = null;
const followBtn = document.getElementById('nav-follow')!;
function startFollow() {
  ctx.journey.follow = true;
  document.body.classList.add('following');
  followBtn.textContent = 'Stop';
  interaction.exitExplore();
  followTween?.kill();
  const total = LEVELS.reduce((s, l) => s + l.meta.weight, 0);
  if (settings.override) {
    settings.progress = 0;
    followTween = gsap.to(settings, { progress: 1, duration: total * 11, ease: 'none' });
    return;
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
  followTween = gsap.to(window, {
    scrollTo: { y: maxScroll(), autoKill: true },
    duration: total * 11,
    ease: 'none',
    delay: 0.6,
  });
}
function stopFollow() {
  ctx.journey.follow = false;
  document.body.classList.remove('following');
  followBtn.textContent = 'Follow e⁻';
  followTween?.kill();
  followTween = null;
}
followBtn.addEventListener('click', () => (ctx.journey.follow ? stopFollow() : startFollow()));
window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement | null;
  if (t && t.tagName === 'INPUT') return;
  if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') ctx.journey.follow ? stopFollow() : startFollow();
  else if (e.key === 'Escape' && ctx.journey.follow && !interaction.exploring) stopFollow();
});
interaction.onExploreToggle = (active) => {
  if (active) followTween?.pause();
  else followTween?.resume();
};

// ---------------------------------------------------------------- debug (?debug)
const settings = {
  progress: 0,
  override: false,
  bloom: 1.1,
  threshold: 0.62,
  dof: QUALITY.dof,
  bokeh: 1,
  timeScale: 1,
  fps: 0,
  frameMs: 0,
  drawCalls: 0,
  triangles: 0,
  pixelRatio: 0,
  tier: qualityLabel(),
};

// ---------------------------------------------------------------- guided tour
let activeTour: Tour | null = null;
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
activeTour = tour;
interaction.onSpace = () => {
  // At the finale, Space is the natural "again" — everything else is a no-op from p = 1.
  if (story.finaleVisible) {
    story.replay();
    return;
  }
  tour.toggle();
  if (tour.playing) offerSound();
};

// Any deliberate input hands control back from the tour to the user.
window.addEventListener('wheel', () => tour.interrupt(), { passive: true });
window.addEventListener('touchmove', () => tour.interrupt(), { passive: true });

// ---------------------------------------------------------------- intro landing
const intro = document.getElementById('intro')!;
let introDone = false;
let firstFrameRendered = false;
function dismissIntro() {
  if (introDone) return;
  introDone = true;
  intro.classList.add('hide');
  // Hand the attract drift over to the scrollbar so the landing settles where it was.
  if (attract.active) {
    attract.stop();
    scrollState.p = settings.progress;
    settings.override = false;
    scrollToProgress(settings.progress);
  }
}
document.getElementById('intro-tour')!.addEventListener('click', () => {
  dismissIntro();
  tour.start();
  offerSound();
});
document.getElementById('intro-explore')!.addEventListener('click', dismissIntro);
window.addEventListener(
  'keydown',
  (e) => {
    if (introDone) return;
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      // Stop the interaction layer from also handling Space (would toggle the tour back off).
      e.stopPropagation();
      dismissIntro();
      tour.start();
      offerSound();
    } else if (e.code === 'Escape') {
      dismissIntro();
    }
  },
  { capture: true },
);
if (new URLSearchParams(location.search).has('nointro')) {
  introDone = true;
  intro.classList.add('hide');
}
// Reduced-motion visitors get a still frame: correct, and the render is composed for it.
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
if (!introDone && !reduceMotion) attract.start(0, attractTo());

// ---------------------------------------------------------------- narrative layer
// Acts, anchor numbers, the clean shot and the finale. Reads the frame state each tick
// and drives its own DOM; it never touches the renderer or the camera (main does the
// finale pull-back from `story.pullback`, and hands it the frame for Share).
const story = new Story({
  getLevelCount: () => LEVELS.length,
  introVisible: () => !introDone,
  levelName: (i) => LEVELS[i].meta.name,
  levelScale: (i) => LEVELS[i].meta.scale,
  levelCaption: () => manager.current?.caption ?? '',
  stopTour: () => tour.stop(),
  replay: () => tour.restart(),
  enterExplore: () => interaction.enterExplore(),
  getCanvas: () => canvas,
});

// ---------------------------------------------------------------- deep links
// `#l=5&v=Section` opens straight at a scale (and view mode); handy for sharing a frame.
const deepParams = new URLSearchParams(location.hash.replace(/^#/, ''));
const deepLevel = Number(deepParams.get('l'));
const deepMode = deepParams.get('v') as ViewMode | null;
let deepApplied = false;

function applyDeepLink(index: number) {
  if (deepApplied || !deepMode) return;
  if (!Number.isInteger(deepLevel) || index !== deepLevel - 1) return;
  deepApplied = true;
  if (deepMode === 'X-Ray' || deepMode === 'Section' || deepMode === 'Thermal') {
    interaction.setViewMode(deepMode);
  }
}

if (Number.isInteger(deepLevel) && deepLevel >= 1 && deepLevel <= LEVELS.length) {
  dismissIntro();
  requestAnimationFrame(() => jumpToLevel(deepLevel - 1));
}

// Ctrl/Cmd+K opens the palette. The interaction layer ignores keys while it is open.
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.code === 'KeyK' && introDone) {
    e.preventDefault();
    palette.toggle();
  }
});

let lastHashKey = '';
/** Keep the URL in step with the current scale + view mode (shareable deep links). */
function syncHash() {
  const mode = interaction.views.mode;
  const h = mode && mode !== 'Normal' ? `#l=${manager.currentIndex + 1}&v=${mode}` : `#l=${manager.currentIndex + 1}`;
  if (location.hash !== h) history.replaceState(null, '', h);
}

if (new URLSearchParams(location.search).has('debug')) {
  // Handle for automated screenshots / console scrubbing: __teardown.settings.override = true; ...progress = 0.5
  (window as unknown as Record<string, unknown>).__teardown = { settings, manager, renderer, ctx, interaction };
  import('lil-gui').then(({ default: GUI }) => {
    const gui = new GUI({ title: 'GPU → Atom debug' });
    const perfFolder = gui.addFolder('Performance');
    perfFolder.add(settings, 'fps').listen().disable();
    perfFolder.add(settings, 'frameMs').name('frame ms').listen().disable();
    perfFolder.add(settings, 'drawCalls').name('draw calls').listen().disable();
    perfFolder.add(settings, 'triangles').listen().disable();
    perfFolder.add(settings, 'pixelRatio').name('pixel ratio').listen().disable();
    perfFolder.add(settings, 'tier').name('quality tier').listen().disable();
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
    fx.add(settings, 'threshold', 0, 1, 0.01).onChange((v: number) => (post.bloom.luminanceMaterial.threshold = v));
    fx.add(settings, 'dof').name('depth of field');
    fx.add(settings, 'bokeh', 0, 4, 0.01).name('bokeh ×');
    const look = gui.addFolder('Look');
    look.add(post, 'grainScale', 0, 3, 0.01).name('grain ×').onChange(() => post.refresh());
    look.add(post, 'chromaticScale', 0, 3, 0.01).name('chromatic ×').onChange(() => post.refresh());
  });
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
  manager.dropPool();
  resize();
});

// ---------------------------------------------------------------- loop
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(pixelRatio);
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
/** Level index whose outgoing frame is already frozen for the next dissolve. */
let dissolveCapturedFor = -1;

function frame(now: number) {
  timer.update(now);
  if (contextLost) {
    requestAnimationFrame(frame);
    return;
  }
  const rawDt = Math.min(timer.getDelta(), 0.1);
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
    camera.position.sub(look).multiplyScalar(1 + story.pullback * 0.45).add(look);
  }
  story.update(state, rawDt);
  interaction.update(rawDt, state.content);
  labels.update(camera, interaction.hoverKey);
  labelTimer -= rawDt;
  if (labelTimer <= 0) {
    labelTimer = 0.4;
    labels.refreshBoxes(level);
  }
  const hashKey = `${manager.currentIndex}:${interaction.views.mode}`;
  if (hashKey !== lastHashKey) {
    lastHashKey = hashKey;
    syncHash();
  }
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
  post.bloom.intensity = settings.bloom * (level.bloom ?? 1) * post.grade.bloom;
  const focus = exploreFocus ?? manager.getFocusPoint(state);
  post.dof.cocMaterial.adoptCameraSettings(camera); // near/far change per level
  if (focus) {
    post.dof.target = focus;
    post.dof.cocMaterial.focusRange = camera.position.distanceTo(focus) * 0.55;
  }
  post.dof.bokehScale = (level.bokeh ?? 1.5) * settings.bokeh;

  // Depth of field is for the cinematic story; in Explore it only gets in the way (and costs).
  post.dofPass.enabled = settings.dof && !interaction.exploring;

  renderer.info.reset();
  post.render(rawDt);
  // Share frame grabs the just-drawn buffer: readable synchronously, blank if deferred.
  story.captureFrame(state);
  if (!firstFrameRendered) {
    firstFrameRendered = true;
    intro.classList.add('loaded');
  }
  // Freeze one frame per dive for the boundary dissolve. Copying the drawing buffer is not
  // free (it can flush the GPU), so this is done once, late in the dolly — not every frame.
  if (!interaction.exploring && state.dive > 0.9 && dissolveCapturedFor !== state.index) {
    dissolveCapturedFor = state.index;
    dissolve.capture(canvas);
  }
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
