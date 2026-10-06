import { describe, expect, it, vi } from 'vitest';
import { ease, TweenEngine } from '../../src/core/tween';

/** An engine on a fake clock: `frame(ms)` advances wall time and runs one animation frame. */
function fakeEngine() {
  let now = 1000;
  let pending: (() => void) | null = null;
  const engine = new TweenEngine({
    now: () => now,
    raf: (cb) => {
      pending = () => cb(now);
    },
  });
  const frame = (ms: number) => {
    now += ms;
    const run = pending;
    pending = null;
    run?.();
  };
  /** Advance `total` ms in 16 ms frames. */
  const run = (total: number) => {
    for (let t = 0; t < total; t += 16) frame(Math.min(16, total - t));
  };
  return { engine, frame, run, idle: () => pending === null };
}

describe('easing', () => {
  it('lands exactly on 0 and 1', () => {
    for (const [name, fn] of Object.entries(ease)) {
      expect(fn(0), name).toBe(0);
      expect(fn(1), name).toBe(1);
    }
  });

  it('matches the GSAP curves', () => {
    expect(ease.none(0.3)).toBeCloseTo(0.3);
    expect(ease.power2InOut(0.5)).toBeCloseTo(0.5);
    expect(ease.power2InOut(0.25)).toBeCloseTo(0.0625); // (0.5^3) / 2
    expect(ease.power2InOut(0.75)).toBeCloseTo(0.9375);
    expect(ease.expoOut(0.1)).toBeCloseTo(0.5, 1); // most of the catch-up happens early
    expect(ease.expoOut(0.5)).toBeGreaterThan(0.95);
  });
});

describe('tween engine', () => {
  it('tweens to the target over the duration and completes', () => {
    const { engine, run, idle } = fakeEngine();
    const o = { x: 10 };
    const onComplete = vi.fn();
    const onUpdate = vi.fn();
    engine.to(o, { x: 20 }, { duration: 1, onUpdate, onComplete });
    run(500);
    expect(o.x).toBeCloseTo(15, 0);
    run(600);
    expect(o.x).toBe(20);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalled();
    expect(idle()).toBe(true);
  });

  it('waits for the delay and reads start values when it begins', () => {
    const { engine, run } = fakeEngine();
    const o = { x: 0 };
    const tween = engine.to(o, { x: 1 }, { duration: 1, delay: 0.5 });
    run(400);
    expect(o.x).toBe(0);
    o.x = 0.5; // changed during the delay: the tween starts from here
    run(200);
    expect(o.x).toBeGreaterThanOrEqual(0.5);
    expect(o.x).toBeLessThan(0.6);
    run(1000);
    expect(o.x).toBe(1);
    expect(tween.active).toBe(false);
  });

  it('stops on kill without completing', () => {
    const { engine, run, idle } = fakeEngine();
    const o = { x: 0 };
    const onComplete = vi.fn();
    const tween = engine.to(o, { x: 1 }, { duration: 1, onComplete });
    run(300);
    tween.kill();
    const at = o.x;
    run(1000);
    expect(o.x).toBe(at);
    expect(onComplete).not.toHaveBeenCalled();
    expect(idle()).toBe(true);
  });

  it('pauses and resumes', () => {
    const { engine, run } = fakeEngine();
    const o = { x: 0 };
    const tween = engine.to(o, { x: 1 }, { duration: 1 });
    engine.to({ y: 0 }, { y: 1 }, { duration: 10 }); // keeps the clock running
    run(500);
    tween.pause();
    const at = o.x;
    run(2000);
    expect(o.x).toBe(at);
    tween.resume();
    run(300);
    expect(o.x).toBeGreaterThan(at);
    expect(o.x).toBeLessThan(1);
    run(300);
    expect(o.x).toBe(1);
  });

  it('runs faster under a time scale', () => {
    const { engine, run } = fakeEngine();
    engine.timeScale = 40;
    const o = { x: 0 };
    engine.to(o, { x: 1 }, { duration: 20 });
    run(400);
    expect(o.x).toBeCloseTo(0.8, 1);
    run(200);
    expect(o.x).toBe(1);
  });

  it('clamps long frame gaps unless lag smoothing is off', () => {
    const smoothed = fakeEngine();
    const a = { x: 0 };
    smoothed.engine.to(a, { x: 1 }, { duration: 2 });
    smoothed.frame(16);
    smoothed.frame(1000); // counts as 33 ms
    expect(a.x).toBeCloseTo(49 / 2000, 3);

    const raw = fakeEngine();
    raw.engine.lagSmoothing = false;
    const b = { x: 0 };
    raw.engine.to(b, { x: 1 }, { duration: 2 });
    raw.frame(16);
    raw.frame(1000);
    expect(b.x).toBeCloseTo(1016 / 2000, 3);
  });

  it('does not count idle time towards a new tween', () => {
    const { engine, run, frame } = fakeEngine();
    engine.to({ x: 0 }, { x: 1 }, { duration: 0.1 });
    run(200);
    frame(5000); // nothing scheduled: no-op
    const o = { x: 0 };
    engine.to(o, { x: 1 }, { duration: 1 });
    run(100);
    expect(o.x).toBeCloseTo(0.1, 1);
  });
});
