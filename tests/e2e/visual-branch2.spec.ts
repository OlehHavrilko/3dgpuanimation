import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';
import { expectNoErrors, openApp } from './helpers';

/**
 * Visual regression for the compute branch (compute.html), same method as visual.spec.ts: the loop
 * is paused and stepped at a fixed rate from a freshly built level, and the drawing buffer is
 * compared with the PNGs in visual-branch2.spec.ts-snapshots/ (Linux, SwiftShader).
 */
const FRAMES = 40;
const STEP = 1 / 30;
const SNAPSHOT = { threshold: 0.2, maxDiffPixelRatio: 0.005 };

const SHOTS: { name: string; level: number; local: number }[] = [
  { name: 'c1-sm', level: 0, local: 0.3 },
  { name: 'c2-warp', level: 1, local: 0.7 },
  { name: 'c3-fma', level: 2, local: 0.6 },
  { name: 'c4-gates', level: 3, local: 0.45 },
  // The warp revealed inside the SM (seam).
  { name: 'seam-sm-warp', level: 0, local: 0.96 },
];

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
  test(`compute frame: ${shot.name}`, async ({ page }) => {
    test.setTimeout(600_000);
    const errors = await openApp(page, '&quality=medium', '/compute.html');
    await page.evaluate(() => {
      const t = (window as any).__teardown;
      t.clock.paused = true;
      t.post.grainScale = 0;
    });
    // Leave for a scale whose cache window excludes the target, so the target is built fresh.
    await setProgress(page, shot.level < 2 ? 3 : 0, 0.5);
    await step(page, 1);
    await page.evaluate(settle);

    await setProgress(page, shot.level, shot.local);
    await page.evaluate(() => (window as any).__teardown.clock.reset(0));
    await step(page, 1);
    expect(await page.evaluate(() => (window as any).__teardown.manager.currentIndex)).toBe(shot.level);
    await page.evaluate(settle);
    await step(page, FRAMES - 1);

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
