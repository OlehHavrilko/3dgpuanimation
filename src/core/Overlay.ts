import gsap from 'gsap';
import type { LevelMeta } from './types';
import { formatMeters } from './math';

/** Minimal HUD: level name + scale label, contextual caption, scale rail, live field of view. */
export class Overlay {
  private scaleEl = document.getElementById('lvl-scale')!;
  private nameEl = document.getElementById('lvl-name')!;
  private descEl = document.getElementById('lvl-desc')!;
  private captionEl = document.getElementById('lvl-caption')!;
  private indexEl = document.getElementById('lvl-index')!;
  private fovEl = document.getElementById('fov-value')!;
  private hintEl = document.getElementById('scroll-hint')!;
  private ticks: HTMLElement[] = [];
  private caption = '';
  private shownIndex = -1;
  private lastFovText = '';

  constructor(private metas: LevelMeta[]) {
    const rail = document.getElementById('rail')!;
    metas.forEach((m, i) => {
      const el = document.createElement('div');
      el.className = 'tick';
      el.textContent = `${m.scale}`;
      el.title = `${String(i + 1).padStart(2, '0')} ${m.name}`;
      rail.appendChild(el);
      this.ticks.push(el);
    });
  }

  showLevel(index: number) {
    if (index === this.shownIndex) return;
    this.shownIndex = index;
    const m = this.metas[index];
    const targets = [this.scaleEl, this.nameEl, this.descEl];
    gsap.killTweensOf(targets);
    this.scaleEl.textContent = m.scale;
    this.nameEl.textContent = m.name;
    this.descEl.textContent = m.description;
    this.indexEl.textContent = `${String(index + 1).padStart(2, '0')} / ${String(this.metas.length).padStart(2, '0')}`;
    gsap.fromTo(
      targets,
      { opacity: 0, y: 14, filter: 'blur(6px)' },
      { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.9, ease: 'power3.out', stagger: 0.08, delay: 0.1 },
    );
    this.ticks.forEach((t, i) => {
      t.classList.toggle('active', i === index);
      t.classList.toggle('done', i < index);
    });
    this.caption = '';
    this.captionEl.textContent = '';
  }

  setCaption(text: string) {
    if (text === this.caption) return;
    this.caption = text;
    this.captionEl.textContent = text;
    // Web Animations instead of a tween chain: restarts cleanly however fast captions change.
    this.captionEl.getAnimations().forEach((a) => a.cancel());
    this.captionEl.animate(
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 450, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' },
    );
  }

  setFov(meters: number) {
    const text = `≈ ${formatMeters(meters)}`;
    if (text !== this.lastFovText) {
      this.lastFovText = text;
      this.fovEl.textContent = text;
    }
  }

  setProgress(p: number) {
    this.hintEl.style.opacity = p > 0.995 ? '0' : String(Math.max(0.25, 1 - p * 40));
  }
}
