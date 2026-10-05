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
  private barFill = document.getElementById('scalebar-fill')!;
  private barLabel = document.getElementById('scalebar-label')!;
  private barAnchor = document.getElementById('scalebar-anchor')!;
  private ticks: HTMLElement[] = [];
  private caption = '';
  private shownIndex = -1;
  private lastFovText = '';
  private lastBarKey = '';

  constructor(
    private metas: LevelMeta[],
    onJump: (index: number) => void,
  ) {
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
}

const UNIT: Record<string, number> = { m: 1, cm: 1e-2, mm: 1e-3, 'µm': 1e-6, nm: 1e-9, 'Å': 1e-10, pm: 1e-12 };
const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

/** "30 cm" -> "10⁻¹ m": order of magnitude of a scale label. */
function powerOfTen(label: string) {
  const [num, unit] = label.split(' ');
  const meters = parseFloat(num) * (UNIT[unit] ?? 1);
  const e = Math.floor(Math.log10(meters) + 1e-9);
  return `10${String(e).replace(/./g, (c) => SUP[c] ?? c)} m`;
}

/** A familiar object of roughly the given length, for a gut-level sense of scale. */
function anchorFor(m: number): string {
  if (m >= 0.2) return 'a hand span';
  if (m >= 0.04) return 'a grain of rice';
  if (m >= 0.007) return 'a fingernail';
  if (m >= 9e-4) return 'a grain of sand';
  if (m >= 5e-5) return 'a human hair';
  if (m >= 6e-6) return 'a red blood cell';
  if (m >= 6e-7) return 'a bacterium';
  if (m >= 4e-7) return 'a wavelength of light';
  if (m >= 4e-8) return 'a virus';
  if (m >= 5e-9) return 'a strand of DNA';
  if (m >= 3.5e-10) return 'a few silicon atoms';
  return 'a single atom';
}
