/** Runtime settings shared by the render loop, the debug panel and the tour. */
export interface Settings {
  /** Timeline position 0..1 (mirrors the scroll unless `override`). */
  progress: number;
  /** Debug: drive the timeline from `progress` instead of the page scroll. */
  override: boolean;
  bloom: number;
  threshold: number;
  dof: boolean;
  bokeh: number;
  timeScale: number;
  // read-only stats shown in the debug panel
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  pixelRatio: number;
}

export type Quality = 'low' | 'high' | 'auto';

export function readQuality(search: string): Quality {
  const q = new URLSearchParams(search).get('quality');
  return q === 'low' || q === 'high' ? q : 'auto';
}

export function createSettings(quality: Quality): Settings {
  return {
    progress: 0,
    override: false,
    bloom: 1.1,
    threshold: 0.62,
    dof: quality !== 'low',
    bokeh: 1,
    timeScale: 1,
    fps: 0,
    frameMs: 0,
    drawCalls: 0,
    triangles: 0,
    pixelRatio: 0,
  };
}
