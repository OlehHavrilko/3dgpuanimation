import type { LevelMeta } from './types';
import { formatMeters, powerOfTen } from './math';
import { content } from '../content';
import { ScaleRuler } from './ScaleRuler';

type AccuracyNote = (typeof content.accuracy.levels)[number];

/** Minimal HUD: level name + scale label, contextual caption, scale rail, live field of view. */
export class Overlay {
  private scaleEl = document.getElementById('lvl-scale')!;
  private nameEl = document.getElementById('lvl-name')!;
  private descEl = document.getElementById('lvl-desc')!;
  private captionEl = document.getElementById('lvl-caption')!;
  private indexEl = document.getElementById('lvl-index')!;
  private fovEl = document.getElementById('fov-value')!;
  private hintEl = document.getElementById('scroll-hint')!;
  private barFill = document.getElementById('scalebar-fill')!;
  private barLabel = document.getElementById('scalebar-label')!;
  private barAnchor = document.getElementById('scalebar-anchor')!;
  private accuracyBtn = document.getElementById('accuracy-btn') as HTMLButtonElement;
  private accuracyEl = document.getElementById('accuracy')!;
  private ruler = new ScaleRuler(document.getElementById('ruler')!);
  private ticks: HTMLElement[] = [];
  private caption = '';
  private shownIndex = -1;
  private lastFovText = '';
  private lastBarKey = '';

  constructor(
    private metas: LevelMeta[],
    onJump: (index: number) => void,
    /** Accuracy notes in level order (the memory branch passes its own). */
    private accuracyNotes: readonly AccuracyNote[] = content.accuracy.levels,
  ) {
    this.accuracyBtn.textContent = content.accuracy.button;
    this.accuracyBtn.addEventListener('click', () => this.toggleAccuracy());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && !this.accuracyEl.hidden) this.toggleAccuracy(false);
    });
    const rail = document.getElementById('rail')!;
    metas.forEach((m, i) => {
      const el = document.createElement('div');
      el.className = 'tick';
      const exp = document.createElement('span');
      exp.className = 'exp';
      exp.textContent = powerOfTen(m.scale);
      el.append(exp, document.createTextNode(m.scale));
      el.title = `${String(i + 1).padStart(2, '0')} ${m.name}`;
      el.addEventListener('click', () => onJump(i));
      rail.appendChild(el);
      this.ticks.push(el);
    });
  }

  showLevel(index: number) {
    if (index === this.shownIndex) return;
    this.shownIndex = index;
    const m = this.metas[index];
    this.scaleEl.textContent = m.scale;
    this.nameEl.textContent = m.name;
    this.descEl.textContent = m.description;
    this.fillAccuracy(index);
    this.indexEl.textContent = `${String(index + 1).padStart(2, '0')} / ${String(this.metas.length).padStart(2, '0')}`;
    // Web Animations (wall-clock driven) so titles appear on time even after a heavy level init.
    [this.scaleEl, this.nameEl, this.descEl].forEach((el, i) => {
      el.getAnimations().forEach((a) => a.cancel());
      el.animate(
        [
          { opacity: 0, transform: 'translateY(14px)', filter: 'blur(6px)' },
          { opacity: 1, transform: 'none', filter: 'blur(0px)' },
        ],
        { duration: 900, delay: 100 + i * 80, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' },
      );
    });
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
    this.setScaleBar(meters);
    this.ruler.update(meters);
  }

  /**
   * A physical scale bar for the current framing: pick a 1-2-5 length that lands near
   * 120 px on screen and label it, plus a familiar object for a gut-level size check.
   * This is what makes "0.2 nm" mean something.
   */
  private setScaleBar(meters: number) {
    const width = Math.max(320, window.innerWidth);
    const metersPerPixel = meters / width;
    const raw = metersPerPixel * 120;
    const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-15))));
    const norm = raw / pow;
    const nice = (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * pow;
    const px = Math.min(220, Math.max(40, nice / metersPerPixel));
    const label = formatMeters(nice);
    const anchor = anchorFor(nice);
    const key = `${label}|${anchor}|${Math.round(px)}`;
    if (key === this.lastBarKey) return;
    this.lastBarKey = key;
    this.barFill.style.width = `${px.toFixed(1)}px`;
    this.barLabel.textContent = label;
    this.barAnchor.textContent = anchor;
  }

  setProgress(p: number) {
    this.hintEl.style.opacity = p > 0.995 ? '0' : String(Math.max(0.25, 1 - p * 40));
  }
  /** Open / close the per-level accuracy note. */
  toggleAccuracy(open = this.accuracyEl.hidden) {
    this.accuracyEl.hidden = !open;
    this.accuracyBtn.setAttribute('aria-expanded', String(open));
    this.accuracyBtn.classList.toggle('on', open);
  }

  private fillAccuracy(index: number) {
    const A = content.accuracy;
    const notes = this.accuracyNotes[index];
    this.accuracyEl.replaceChildren();
    if (!notes) return;
    for (const kind of ['spec', 'representative', 'notToScale'] as const) {
      if (!notes[kind].length) continue;
      const group = document.createElement('div');
      group.className = `acc-group acc-${kind}`;
      const h = document.createElement('div');
      h.className = 'acc-head';
      h.textContent = A.headings[kind];
      const list = document.createElement('ul');
      for (const text of notes[kind]) {
        const li = document.createElement('li');
        li.textContent = text;
        list.appendChild(li);
      }
      group.append(h, list);
      this.accuracyEl.appendChild(group);
    }
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'acc-more';
    more.dataset.reference = 'sources';
    more.textContent = `${content.reference.open} ▸`;
    this.accuracyEl.appendChild(more);
  }
}

/** A familiar object of roughly the given length, for a gut-level sense of scale. */
function anchorFor(m: number): string {
  for (const [min, text] of content.ui.scaleAnchors) if (m >= min) return text;
  return content.ui.scaleAnchorSmallest;
}
