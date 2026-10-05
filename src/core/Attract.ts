import { clamp } from './math';

/**
 * Attract mode: while the landing card is up, the scene is already moving.
 *
 * A slow, endless ping-pong through the first scale's content — the camera drifts in
 * over the card, the fans and lighting keep running — so the very first thing a visitor
 * sees is a live render, not a still frame behind a dialog. It writes straight to the
 * timeline while it is running and hands the progress over on the way out, so starting
 * the dive or exploring freely both continue from wherever the attract loop had reached.
 */
export class Attract {
  private t = 0;
  private p0 = 0;
  private p1 = 0;
  private running = false;

  /** Seconds for one full there-and-back drift. */
  constructor(private period = 34) {}

  start(from: number, to: number) {
    this.p0 = from;
    this.p1 = to;
    this.t = 0;
    this.running = true;
  }

  stop() {
    this.running = false;
  }

  get active() {
    return this.running;
  }

  /** Advance and return the timeline progress for this frame. */
  update(dt: number): number {
    this.t += dt;
    const k = 0.5 - 0.5 * Math.cos((this.t * Math.PI * 2) / this.period);
    return this.p0 + (this.p1 - this.p0) * clamp(k);
  }
}
