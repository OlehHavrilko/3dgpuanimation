import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';
import { expectNoErrors, openApp } from './helpers';

/**
 * Visual regression: one deterministic frame per scale, plus the view modes and a seam, compared
 * with the PNGs in visual.spec.ts-snapshots/. The render loop is paused and advanced by hand at
 * a fixed step from a freshly built level, so the same build draws the same pixels.
 *
 * After an intended visual change, refresh the baselines: run the "Update visual snapshots"
 * workflow, or locally `npm run test:visual -- --update-snapshots` (Linux only: SwiftShader
 * output differs between platforms).
 */

/** Frames advanced before the shot: long enough for every eased value (rate 5–8/s) to settle. */
const FRAMES = 40;
const STEP = 1 / 30;
/** Antialiased edges may move a little between Chromium patch releases; real changes move more. */
const SNAPSHOT = { threshold: 0.2, maxDiffPixelRatio: 0.005 };

const SHOTS: { name: string; level: number; local: number; mode?: string }[] = [
  { name: '1-gpu', level: 0, local: 0.3 },
  { name: '2-pcb', level: 1, local: 0.45 },
  { name: '3-package', level: 2, local: 0.45 },
  { name: '4-die', level: 3, local: 0.5 },
  { name: '5-metal', level: 4, local: 0.5 },
  { name: '6-finfet', level: 5, local: 0.5 },
  { name: '7-lattice', level: 6, local: 0.5 },
  { name: '8-atom', level: 7, local: 0.5 },
  { name: '9-nucleus', level: 8, local: 0.7 },
  // The next scale revealed inside the die (SeamEffect, blended grade).
  { name: 'seam-die-metal', level: 3, local: 0.96 },
  // The atom's nucleus shrinking to true size as the nucleus scale takes over.
  { name: 'seam-atom-nucleus', level: 7, local: 0.96 },
  { name: 'xray-gpu', level: 0, local: 0.3, mode: 'X-Ray' },
  { name: 'section-gpu', level: 0, local: 0.3, mode: 'Section' },
];

/** Pause the loop and drive the timeline by hand. */
async function setProgress(page: Page, level: number, local: number) {
  await page.evaluate(
    ([i, l]) => {
      const t = (window as any).__teardown;
      t.settings.override = true;
      t.settings.progress = t.manager.progressForLevel(i, l);
    },
    [level, local] as const,
  );
}

const step = (page: Page, frames: number) =>
  page.evaluate(([n, dt]) => (window as any).__teardown.clock.step(n, dt), [frames, STEP] as const);
const settle = () => (window as any).__teardown.manager.whenIdle();

for (const shot of SHOTS) {
  test(`frame: ${shot.name}`, async ({ page }) => {
    // Two level builds and 40 software-rendered frames; the heavy scales take minutes.
    test.setTimeout(600_000);
    const errors = await openApp(page);
    await page.evaluate(() => {
      const t = (window as any).__teardown;
      t.clock.paused = true;
      // Film grain is time-seeded noise over every pixel; it is not what these shots guard.
      t.post.grainScale = 0;
    });

    // Leave for a scale whose cache window excludes the target, so the target is built fresh.
    await setProgress(page, shot.level < 4 ? 7 : 0, 0.5);
    await step(page, 1);
    await page.evaluate(settle);

    await setProgress(page, shot.level, shot.local);
    await page.evaluate(() => (window as any).__teardown.clock.reset(0));
    await step(page, 1);
    expect(await page.evaluate(() => (window as any).__teardown.manager.currentIndex)).toBe(shot.level);
    // Neighbours are built and warmed in idle time; let that finish before the counted frames.
    await page.evaluate(settle);
    if (shot.mode) {
      await page.evaluate((m) => (window as any).__teardown.interaction.setViewMode(m), shot.mode);
    }
    await step(page, FRAMES - 1);

    // Read the drawing buffer in the same task as the last render (it is not preserved), so
    // the PNG is exactly the frame, with no compositor or HUD in it.
    const png = await page.evaluate(
      ([dt]) => {
        const t = (window as any).__teardown;
        t.clock.step(1, dt);
        return t.renderer.domElement.toDataURL('image/png') as string;
      },
      [STEP] as const,
    );
    expect(Buffer.from(png.split(',')[1], 'base64')).toMatchSnapshot(`${shot.name}.png`, SNAPSHOT);
    expectNoErrors(errors);
  });
}
