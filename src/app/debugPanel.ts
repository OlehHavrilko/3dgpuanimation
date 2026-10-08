import type { LevelManager } from '../core/LevelManager';
import type { LevelMeta } from '../core/types';
import type { PostFX } from '../core/PostFX';
import type { Settings } from './settings';

/** ?debug: lil-gui with live stats, timeline scrubbing, level jumps and post-FX tweaks. */
export async function setupDebugPanel(opts: {
  settings: Settings;
  manager: LevelManager;
  metas: LevelMeta[];
  post: PostFX;
  scrollToProgress: (p: number) => void;
}) {
  const { settings, manager, metas, post, scrollToProgress } = opts;
  const { default: GUI } = await import('lil-gui');
  const gui = new GUI({ title: 'DieDive debug' });
  const perf = gui.addFolder('Performance');
  perf.add(settings, 'fps').listen().disable();
  perf.add(settings, 'frameMs').name('frame ms').listen().disable();
  perf.add(settings, 'drawCalls').name('draw calls').listen().disable();
  perf.add(settings, 'triangles').listen().disable();
  perf.add(settings, 'pixelRatio').name('pixel ratio').listen().disable();
  perf.add(settings, 'tier').name('quality tier').listen().disable();
  const tl = gui.addFolder('Timeline');
  tl.add(settings, 'override').name('scrub with slider');
  tl.add(settings, 'progress', 0, 1, 0.0005)
    .listen()
    .onChange((v: number) => {
      if (!settings.override) scrollToProgress(v);
    });
  tl.add(settings, 'timeScale', 0, 3, 0.01).name('time scale');
  const jumps: Record<string, () => void> = {};
  metas.forEach((m, i) => {
    const key = `${i + 1}. ${m.name}`;
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
  look
    .add(post, 'grainScale', 0, 3, 0.01)
    .name('grain ×')
    .onChange(() => post.refresh());
  look
    .add(post, 'chromaticScale', 0, 3, 0.01)
    .name('chromatic ×')
    .onChange(() => post.refresh());
  return gui;
}
