import { formatMeters } from './math';
import { content } from '../content';

/** Decades shown, as exponents of metres: from a few metres down to a proton. */
const TOP = 0.5;
const BOTTOM = -15.5;
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (n: number) => `${n < 0 ? '⁻' : ''}${String(Math.abs(n)).replace(/\d/g, (d) => SUP[+d])}`;

const y = (meters: number) => (TOP - Math.log10(meters)) / (TOP - BOTTOM);

/**
 * One continuous logarithmic ruler for the whole descent: sixteen decades from a person (1.7 m)
 * to a proton (~1 fm), a few familiar objects along it, and a marker that rides it with the
 * live field of view. It is the only place where "how far have I gone" is visible at once.
 */
export class ScaleRuler {
  private marker: HTMLElement;
  private markerLabel: HTMLElement;
  private lastLabel = '';

  constructor(root: HTMLElement) {
    root.replaceChildren();
    const track = document.createElement('div');
    track.className = 'ruler-track';
    for (let e = Math.floor(TOP); e >= Math.ceil(BOTTOM); e--) {
      const t = document.createElement('div');
      t.className = 'ruler-tick';
      t.style.top = `${y(10 ** e) * 100}%`;
      t.textContent = `10${sup(e)}`;
      track.appendChild(t);
    }
    for (const { m, text } of content.ui.ruler.marks) {
      const mk = document.createElement('div');
      mk.className = 'ruler-mark';
      mk.style.top = `${y(m) * 100}%`;
      mk.textContent = text;
      track.appendChild(mk);
    }
    this.marker = document.createElement('div');
    this.marker.className = 'ruler-marker';
    this.markerLabel = document.createElement('span');
    this.marker.appendChild(this.markerLabel);
    track.appendChild(this.marker);
    root.appendChild(track);
    root.setAttribute('aria-label', content.ui.ruler.label);
  }

  /** `meters`: width of the view, in metres. */
  update(meters: number) {
    const f = Math.min(1, Math.max(0, y(Math.max(meters, 1e-17))));
    this.marker.style.top = `${f * 100}%`;
    const label = formatMeters(meters);
    if (label !== this.lastLabel) {
      this.lastLabel = label;
      this.markerLabel.textContent = label;
    }
  }
}
