import gsap from 'gsap';
import type { LevelContext } from '../core/types';
import type { InteractionManager } from '../interaction/InteractionManager';
import type { Settings } from './settings';
import { content } from '../content';

/**
 * "Follow the electron": scroll from the very top to the very bottom at a steady pace while each
 * level shows where "our" electron is. Pauses in Explore, stops on a second press (or F / Esc).
 */
export function setupTour(opts: {
  ctx: LevelContext;
  interaction: InteractionManager;
  settings: Settings;
  maxScroll: () => number;
  /** Seconds for the whole journey. */
  duration: number;
}) {
  const { ctx, interaction, settings, maxScroll, duration } = opts;
  const button = document.getElementById('nav-follow')!;
  let tour: gsap.core.Tween | null = null;

  function start() {
    ctx.journey.follow = true;
    document.body.classList.add('following');
    button.textContent = content.ui.stop;
    interaction.exitExplore();
    tour?.kill();
    if (settings.override) {
      settings.progress = 0;
      tour = gsap.to(settings, { progress: 1, duration, ease: 'none' });
      return;
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    tour = gsap.to(window, { scrollTo: { y: maxScroll(), autoKill: true }, duration, ease: 'none', delay: 0.6 });
  }

  function stop() {
    ctx.journey.follow = false;
    document.body.classList.remove('following');
    button.textContent = content.ui.follow;
    tour?.kill();
    tour = null;
  }

  function toggle() {
    if (ctx.journey.follow) stop();
    else start();
  }

  button.addEventListener('click', toggle);
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null;
    if (t && t.tagName === 'INPUT') return;
    if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') toggle();
    else if (e.key === 'Escape' && ctx.journey.follow && !interaction.exploring) stop();
  });
  interaction.onExploreToggle = (active) => {
    if (active) tour?.pause();
    else tour?.resume();
  };
  return { start, stop, toggle };
}
