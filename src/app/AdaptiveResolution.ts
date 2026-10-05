/**
 * Adaptive resolution: if the frame rate sits below ~52 fps for 1.5 s, render at fewer pixels;
 * once it has been smooth for 8 s, carefully step back up. Hysteresis + cooldowns keep it from
 * oscillating, and single slow frames (level swaps) never trigger it. Pure logic: the caller
 * applies the returned pixel ratio.
 */
export class AdaptiveResolution {
  /** Smoothed frame time (s). */
  ema = 1 / 60;
  private low = 0;
  private good = 0;
  private cooldown = 2;

  constructor(
    public pixelRatio: number,
    private readonly ceiling: () => number,
    private readonly enabled: boolean,
    private readonly floor = 0.6,
  ) {}

  /** Feed one frame; returns the new pixel ratio when it changed, else null. */
  step(dt: number, hidden = false): number | null {
    this.ema += (dt - this.ema) * 0.05;
    if (!this.enabled || hidden) return null;
    this.cooldown -= dt;
    const fps = 1 / this.ema;
    this.low = fps < 52 ? this.low + dt : 0;
    this.good = fps > 57 ? this.good + dt : 0;
    if (this.cooldown > 0) return null;
    if (this.low > 1.5 && this.pixelRatio > this.floor) {
      this.pixelRatio = Math.max(this.floor, this.pixelRatio * 0.85);
      this.low = 0;
      this.cooldown = 2;
      return this.pixelRatio;
    }
    if (this.good > 8 && this.pixelRatio < this.ceiling()) {
      this.pixelRatio = Math.min(this.ceiling(), this.pixelRatio * 1.1);
      this.good = 0;
      this.cooldown = 4;
      return this.pixelRatio;
    }
    return null;
  }
}
