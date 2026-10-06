/**
 * A tiny tween engine: just what the page needs from an animation library (numeric tweens,
 * a window scroll tween that lets go when the visitor scrolls, and a smoothed scroll → progress
 * mapping). Driven by requestAnimationFrame on wall-clock time, with the same easing curves and
 * lag smoothing as GSAP so the motion is unchanged.
 */

export type Ease = (t: number) => number;

const powerIn = (k: number) => (p: number) => p ** k;
const outOf = (easeIn: Ease) => (p: number) => 1 - easeIn(1 - p);
const inOutOf = (easeIn: Ease) => (p: number) => (p < 0.5 ? easeIn(p * 2) / 2 : 1 - easeIn((1 - p) * 2) / 2);
// Blended so the curve lands exactly on 0 and 1 (GSAP's definition).
const expoIn: Ease = (p) => 2 ** (10 * (p - 1)) * p + p ** 6 * (1 - p);

export const ease = {
  none: (p: number) => p,
  power2In: powerIn(3),
  power2Out: outOf(powerIn(3)),
  power2InOut: inOutOf(powerIn(3)),
  expoOut: outOf(expoIn),
} satisfies Record<string, Ease>;

type Clock = { now: () => number; raf: (cb: (t: number) => void) => unknown };

export interface TweenOptions {
  /** Seconds. */
  duration: number;
  /** Seconds before the tween starts (start values are read when it does). */
  delay?: number;
  ease?: Ease;
  onUpdate?: () => void;
  onComplete?: () => void;
}

/** One running animation. Created through an engine; it advances on the engine's clock. */
export class Tween {
  /** Engine time (ms) at which the tween was created, shifted forward by pauses. */
  private origin: number;
  private pausedAt = -1;
  private started = false;
  private done = false;
  private render: ((k: number) => void) | null = null;

  constructor(
    private readonly engine: TweenEngine,
    private readonly opts: TweenOptions,
    /** Called once when the delay is over; returns the per-frame writer for eased progress 0..1. */
    private readonly begin: () => (k: number) => void,
  ) {
    this.origin = engine.time;
  }

  get active() {
    return !this.done;
  }

  kill() {
    this.done = true;
    this.engine.remove(this);
  }

  pause() {
    if (this.pausedAt < 0 && !this.done) this.pausedAt = this.engine.time;
  }

  resume() {
    if (this.pausedAt < 0) return;
    this.origin += this.engine.time - this.pausedAt;
    this.pausedAt = -1;
  }

  /** @internal Advance to engine time `now` (ms). Returns false once finished. */
  step(now: number): boolean {
    if (this.done) return false;
    if (this.pausedAt >= 0) return true;
    const elapsed = (now - this.origin) / 1000 - (this.opts.delay ?? 0);
    if (elapsed < 0) return true;
    if (!this.started) {
      this.started = true;
      this.render = this.begin();
    }
    if (this.done) return false; // begin() may kill it
    const { duration } = this.opts;
    const t = duration > 0 ? Math.min(1, elapsed / duration) : 1;
    this.render!((this.opts.ease ?? ease.none)(t));
    if (this.done) return false; // the writer may kill it (scroll autoKill)
    this.opts.onUpdate?.();
    if (t >= 1) {
      this.done = true;
      this.opts.onComplete?.();
      return false;
    }
    return true;
  }
}

export class TweenEngine {
  /** Engine time in ms: wall-clock, scaled by `timeScale`, with long stalls clamped. */
  time = 0;
  /** Speeds every tween up or down (tests use it to fast-forward long animations). */
  timeScale = 1;
  /** Like GSAP: a frame gap over 500 ms (a background tab, a hitch) only advances 33 ms. */
  lagSmoothing = true;
  private tweens: Tween[] = [];
  private last = -1;
  private scheduled = false;

  constructor(private readonly clock: Clock = defaultClock) {}

  /** Animate numeric properties of `target` to the values in `to`. */
  to<T extends object>(target: T, to: Partial<Record<keyof T, number>>, opts: TweenOptions): Tween {
    const keys = Object.keys(to) as (keyof T)[];
    const t = target as Record<keyof T, number>;
    return this.add(
      new Tween(this, opts, () => {
        const from = keys.map((k) => t[k]);
        return (e) => keys.forEach((k, i) => (t[k] = from[i] + (to[k]! - from[i]) * e));
      }),
    );
  }

  /**
   * Scroll the window to `y`. With `autoKill`, the tween stops as soon as the page is scrolled
   * by something else (wheel, touch, keys, scrollbar): the same 7 px rule as GSAP's ScrollToPlugin.
   */
  scrollTo(y: number, opts: TweenOptions & { autoKill?: boolean }): Tween {
    const tween: Tween = new Tween(this, opts, () => {
      const from = window.scrollY;
      let prev = from;
      return (e) => {
        const now = window.scrollY;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (opts.autoKill && Math.abs(now - prev) > 7 && now < max) {
          tween.kill();
          return;
        }
        prev = from + (y - from) * e;
        window.scrollTo(window.scrollX, prev);
      };
    });
    return this.add(tween);
  }

  /** @internal */
  remove(tween: Tween) {
    const i = this.tweens.indexOf(tween);
    if (i >= 0) this.tweens.splice(i, 1);
  }

  private add(tween: Tween): Tween {
    this.tweens.push(tween);
    this.schedule();
    return tween;
  }

  private schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    if (this.last < 0) this.last = this.clock.now();
    this.clock.raf(() => this.tick(this.clock.now()));
  }

  /** Advance every tween to wall-clock `now` (ms). Exposed so tests can drive the clock. */
  tick(now: number) {
    this.scheduled = false;
    let dt = this.last < 0 ? 0 : now - this.last;
    if (this.lagSmoothing && dt > 500) dt = 33;
    this.last = now;
    this.time += Math.max(0, dt) * this.timeScale;
    // Creation order, like GSAP: a newer tween on the same property renders last and wins.
    for (const tween of [...this.tweens]) if (!tween.step(this.time)) this.remove(tween);
    if (this.tweens.length) this.schedule();
    else this.last = -1; // idle: the next tween starts the clock afresh
  }
}

const defaultClock: Clock = {
  now: () => performance.now(),
  raf: (cb) => requestAnimationFrame(cb),
};

/** The page's shared engine. */
export const tweens = new TweenEngine();

/**
 * Map page scroll across `trigger` (its top at the viewport top → its bottom at the viewport
 * bottom) onto `state.p` 0..1, lagging behind the scrollbar by `smooth` seconds on an expo-out
 * curve. Same mapping and feel as a GSAP ScrollTrigger with `scrub: smooth`: the range is
 * re-measured (and p snaps) on load and on resize, 200 ms after it settles, ignoring the
 * height-only resizes a mobile address bar causes and resizes into fullscreen.
 */
export function scrubScroll(
  trigger: HTMLElement,
  state: { p: number },
  smooth: number,
  engine: TweenEngine = tweens,
): { refresh: () => void } {
  let start = 0;
  let end = 1;
  let target = -1;
  let lag: Tween | null = null;
  const measure = () => {
    const top = trigger.getBoundingClientRect().top + window.scrollY;
    start = top;
    end = top + trigger.offsetHeight - window.innerHeight;
  };
  const progress = () => {
    const span = end - start;
    return span > 0 ? Math.min(1, Math.max(0, (window.scrollY - start) / span)) : window.scrollY >= end ? 1 : 0;
  };
  const refresh = () => {
    measure();
    lag?.kill();
    lag = null;
    target = progress();
    state.p = target;
    setBase();
  };
  const update = () => {
    const next = progress();
    if (next === target) return;
    target = next;
    lag?.kill();
    lag = engine.to(state, { p: next }, { duration: smooth, ease: ease.expoOut });
  };

  // Touch devices: the address bar showing / hiding resizes the viewport; that is not a reflow.
  const coarse = matchMedia('(hover: none), (pointer: coarse)').matches;
  let baseW = 0;
  let baseH = 0;
  const setBase = () => {
    baseW = window.innerWidth;
    baseH = window.innerHeight;
  };
  let timer = 0;
  const onResize = () => {
    if (document.fullscreenElement) return;
    if (coarse && baseW === window.innerWidth && Math.abs(window.innerHeight - baseH) <= window.innerHeight * 0.25) {
      return;
    }
    clearTimeout(timer);
    timer = window.setTimeout(refresh, 200);
  };

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', onResize);
  window.addEventListener('load', refresh);
  refresh();
  return { refresh };
}
