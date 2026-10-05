import type { EntityInfo, PickHit } from '../core/types';
import { content } from '../content';

/** Seconds each trace waypoint stays selected before the next one. */
const STAGE_SECONDS = 3.6;

/**
 * Auto-advancing signal trace: steps through a level's waypoints, handing each one (with a
 * "Trace i/n" label) to `onStage`, which selects it and flies the camera there.
 */
export class TraceRunner {
  private run: { stages: PickHit[]; i: number; t: number } | null = null;

  constructor(private onStage: (hit: PickHit) => void) {}

  get active() {
    return this.run !== null;
  }

  /** Start a plan; `delay` seconds before the first stage (e.g. to let an arrival flash clear). */
  start(stages: PickHit[] | null | undefined, delay = 0) {
    this.run = stages?.length ? { stages, i: -1, t: -delay } : null;
  }

  stop() {
    this.run = null;
  }

  step(dt: number) {
    const run = this.run;
    if (!run) return;
    run.t += dt;
    const due = run.i < 0 ? run.t >= 0 : run.t > STAGE_SECONDS;
    if (!due || run.i >= run.stages.length - 1) return;
    run.i++;
    run.t = 0;
    const st = run.stages[run.i];
    const info: EntityInfo = { ...st.info, kind: content.ui.traceStage(run.i + 1, run.stages.length, st.info.kind) };
    this.onStage({ ...st, info });
  }
}
