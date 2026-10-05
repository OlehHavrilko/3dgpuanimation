export interface TourSegment {
  index: number;
  start: number;
  end: number;
  name: string;
  scale: string;
}

export interface TourCallbacks {
  getProgress(): number;
  /** Drive the timeline without touching the scrollbar. */
  setProgress(p: number): void;
  /** Tour starts: leave Explore, freeze the scroll timeline. */
  begin(): void;
  /** Tour stops: `p` is where to leave the scrollbar. */
  end(p: number): void;
}

const CONTENT_SHARE = 0.84;
const TOTAL_SECONDS = 118;

/**
 * The guided tour: a self-running pass through all eight scales.
 *
 * It drives progress directly (the scroll timeline is frozen) so the pacing is authored
 * rather than tied to how fast someone flicks a wheel. Each scale moves slowly through its
 * content, holds for a beat so the viewer can read it, then accelerates through the dive.
 * Any deliberate input (wheel, touch, arrow keys) hands control back to the user.
 */
export class Tour {
  playing = false;
  private hold = 0;
  private heldLevel = -1;
  private elapsed = 0;

  // DOM
  private bar = document.getElementById('tour')!;
  private playBtn = document.getElementById('tour-play') as HTMLButtonElement;
  private closeBtn = document.getElementById('tour-close') as HTMLButtonElement;
  private fill = document.getElementById('tour-fill')!;
  private head = document.getElementById('tour-head')!;
  private label = document.getElementById('tour-label')!;
  private time = document.getElementById('tour-time')!;
  private track = document.getElementById('tour-track')!;
  private ticks: HTMLElement[] = [];

  constructor(
    private cb: TourCallbacks,
    private segments: TourSegment[],
    private seconds = TOTAL_SECONDS,
  ) {
    this.playBtn.addEventListener('click', () => this.toggle());
    this.closeBtn.addEventListener('click', () => this.stop());
    this.track.addEventListener('pointerdown', (e) => this.seekFromEvent(e));
    for (const s of segments) {
      const tick = document.createElement('span');
      tick.className = 'tour-tick';
      tick.style.left = `${s.start * 100}%`;
      tick.title = s.name;
      tick.addEventListener('click', (e) => {
        e.stopPropagation();
        this.seek(s.index);
      });
      this.track.appendChild(tick);
      this.ticks.push(tick);
    }
  }

  get progress() {
    return this.cb.getProgress();
  }

  start() {
    this.cb.begin();
    this.spin();
  }

  /** Replay from the first scale — used by the finale's Replay button. */
  restart() {
    this.cb.begin();
    this.cb.setProgress(0);
    this.spin();
  }

  private spin() {
    this.playing = true;
    this.hold = 0.6; // a short beat before the first move
    this.heldLevel = -1;
    this.elapsed = 0;
    this.bar.classList.add('on');
    document.body.classList.add('touring');
    this.render();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    this.hold = 0;
    this.playBtn.classList.remove('on');
    this.playBtn.textContent = 'Play';
    this.render();
  }

  resume() {
    if (this.playing) return;
    this.playing = true;
    this.hold = 0;
    this.bar.classList.add('on');
    document.body.classList.add('touring');
    this.render();
  }

  toggle() {
    if (this.playing) this.pause();
    else if (document.body.classList.contains('touring')) this.resume();
    else this.start();
  }

  /** Leave the tour entirely and hand the timeline back to the scrollbar. */
  stop() {
    if (!this.playing && !document.body.classList.contains('touring')) return;
    this.playing = false;
    this.hold = 0;
    this.bar.classList.remove('on');
    document.body.classList.remove('touring');
    this.cb.end(this.cb.getProgress());
  }

  /** Jump the tour to the start of a chapter and keep playing. */
  seek(index: number) {
    const s = this.segments[index];
    if (!s) return;
    this.cb.setProgress(s.start + 0.005);
    this.heldLevel = -1;
    this.hold = 0;
    this.render();
  }

  /** The user took over: stop driving, but keep the bar for one-click resume. */
  interrupt() {
    if (!this.playing) return;
    this.pause();
  }

  update(dt: number) {
    if (!this.playing) return;
    if (this.hold > 0) {
      this.hold -= dt;
      this.render();
      return;
    }
    this.elapsed += dt;
    let p = this.cb.getProgress();
    if (p >= 1) {
      p = 1;
      this.cb.setProgress(1);
      this.render();
      this.stop();
      return;
    }
    const seg = this.segmentFor(p);
    const local = (p - seg.start) / (seg.end - seg.start);
    // One breath per scale, just before the dive.
    if (local > 0.52 && this.heldLevel !== seg.index) {
      this.heldLevel = seg.index;
      this.hold = 1.5;
      this.render();
      return;
    }
    const speed = (1 / this.seconds) * (local > CONTENT_SHARE ? 2.1 : 1);
    this.cb.setProgress(Math.min(1, p + speed * dt));
    this.render();
  }

  private segmentFor(p: number) {
    for (let i = 0; i < this.segments.length; i++) {
      if (p < this.segments[i].end) return this.segments[i];
    }
    return this.segments[this.segments.length - 1];
  }

  private seekFromEvent(e: PointerEvent) {
    const r = this.track.getBoundingClientRect();
    const k = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    this.cb.setProgress(k);
    this.heldLevel = -1;
    this.hold = 0;
    if (!this.playing) this.resume();
    this.render();
  }

  private render() {
    const p = this.cb.getProgress();
    const seg = this.segmentFor(p);
    this.fill.style.width = `${(p * 100).toFixed(2)}%`;
    this.head.style.left = `${(p * 100).toFixed(2)}%`;
    this.label.textContent = `${String(seg.index + 1).padStart(2, '0')} · ${seg.name} — ${seg.scale}`;
    const total = this.seconds;
    const shown = Math.min(total, this.elapsed + p * total * 0.35);
    this.time.textContent = `${formatTime(shown)} / ${formatTime(total)}`;
    this.playBtn.textContent = this.playing ? 'Pause' : 'Play';
    this.playBtn.classList.toggle('on', this.playing);
    this.ticks.forEach((t, i) => t.classList.toggle('active', i === seg.index));
  }
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}
