/**
 * Match-dissolve between scales.
 *
 * Swapping the WebGL scene at a segment boundary used to be hidden by an opaque
 * green flash. This instead freezes the last rendered frame into a 2D canvas laid over
 * the viewport and fades + scales it out while the new level renders underneath, so the
 * dive reads as one continuous camera move rather than a cut.
 *
 * The frame must be copied at the end of a render (while the drawing buffer is still
 * valid); `main.ts` therefore captures during the dive, not at the swap.
 */
export class FrameDissolve {
  private ctx2d: CanvasRenderingContext2D | null;
  private hasFrame = false;
  private fadeFrame = 0;
  private fadeTimer = 0;
  /** Longest edge of the captured frame, in pixels: memory over absolute sharpness. */
  private readonly maxEdge = 1920;

  constructor(
    private el: HTMLCanvasElement,
    private duration = 560,
  ) {
    this.ctx2d = el.getContext('2d');
  }

  get armed() {
    return this.hasFrame;
  }

  /** Copy the current canvas into the overlay. Cheap enough to run every frame of a dive. */
  capture(source: HTMLCanvasElement) {
    const g = this.ctx2d;
    if (!g || source.width === 0 || source.height === 0) return;
    const scale = Math.min(1, this.maxEdge / Math.max(source.width, source.height));
    const w = Math.max(1, Math.round(source.width * scale));
    const h = Math.max(1, Math.round(source.height * scale));
    if (this.el.width !== w || this.el.height !== h) {
      this.el.width = w;
      this.el.height = h;
    }
    g.drawImage(source, 0, 0, w, h);
    this.hasFrame = true;
  }

  /** Show the frozen frame instantly (no transition), covering the render below. */
  reveal() {
    if (!this.hasFrame) return;
    this.cancelFade(); // an older fade must not hide this frame half-way
    this.el.style.transition = 'none';
    this.el.style.transform = 'none';
    this.el.style.opacity = '1';
  }

  /** Fade the frozen frame out. Runs one frame after `reveal()` so the transition applies. */
  play() {
    if (!this.hasFrame) return;
    // A fast scroll can cross a second boundary mid-fade: restart, don't let the old timer cut it.
    this.cancelFade();
    this.fadeFrame = requestAnimationFrame(() => {
      this.el.style.transition = `opacity ${this.duration}ms cubic-bezier(.22,.61,.36,1), transform ${this.duration}ms cubic-bezier(.22,.61,.36,1)`;
      this.el.style.opacity = '0';
      // A slight push-in keeps the camera feeling like it is still travelling.
      this.el.style.transform = 'scale(1.045)';
    });
    // Drop the frame when the fade is done: a very fast flick that skips the dive would
    // otherwise reuse the previous transition's image.
    this.fadeTimer = window.setTimeout(() => this.reset(), this.duration + 90);
  }

  private cancelFade() {
    cancelAnimationFrame(this.fadeFrame);
    window.clearTimeout(this.fadeTimer);
  }

  /** Called on transitionend / level change: drop the frame so stale pixels never flash. */
  reset() {
    this.cancelFade();
    this.hasFrame = false;
    this.el.style.transition = 'none';
    this.el.style.opacity = '0';
    this.el.style.transform = 'none';
  }
}
