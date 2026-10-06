import { expect, test } from '@playwright/test';
import { expectNoErrors, goToLevel, openApp, waitForLevel } from './helpers';

/**
 * Phase C: the whole route GPU → Atom as one continuous descent. For every boundary the dive
 * must reveal the next level, end on exactly the next level's first frame (same physical field
 * of view), and the swap itself must need no cover (no dissolve, no flash).
 */
test('seamless descent: every boundary from the card to the atom', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = await openApp(page);
  const frames = async (n: number) => {
    for (let i = 0; i < n; i++) await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(0))));
  };
  const at = async (level: number, local: number) => {
    await page.evaluate(
      ([l, t]) => {
        const x = (window as any).__teardown;
        x.settings.override = true;
        x.settings.progress = x.manager.progressForLevel(l, t);
      },
      [level, local] as const,
    );
    await waitForLevel(page, level);
    await frames(2);
    return page.evaluate(() => {
      const x = (window as any).__teardown;
      const s = x.manager.lastState;
      return {
        seam: s.seam,
        fov: s.fovMeters,
        revealing: !!x.manager.seamLevel,
        seamPass: x.post.seamPass.enabled,
        continuous: x.manager.lastSwapContinuous,
        dissolve: getComputedStyle(document.getElementById('dissolve')!).opacity,
      };
    });
  };
  const dive = (d: number) => 0.84 + 0.16 * d;

  let prevFov = Infinity;
  for (let i = 0; i < 7; i++) {
    const start = await at(i, dive(0.2));
    expect(start.seam).toBe(0);
    const mid = await at(i, dive(0.75));
    expect(mid.seam).toBeGreaterThan(0.2);
    expect(mid.revealing && mid.seamPass).toBe(true);
    const end = await at(i, dive(0.995));
    expect(end.seam).toBeCloseTo(1, 3);
    // Zooming in: the field of view only ever shrinks through a dive.
    expect(end.fov).toBeLessThan(start.fov);
    expect(end.fov).toBeLessThan(prevFov);
    const next = await at(i + 1, 0.001);
    expect(next.continuous, `swap ${i} → ${i + 1} should be seamless`).toBe(true);
    expect(next.dissolve).toBe('0');
    // The next level opens on the view the dive ended on.
    expect(Math.abs(Math.log(next.fov / end.fov))).toBeLessThan(0.05);
    prevFov = next.fov;
  }

  // Scrolling back up crosses the same seam the other way.
  await at(7, 0.001);
  const back = await at(6, dive(0.995));
  expect(back.continuous).toBe(true);
  expect(back.revealing).toBe(true);
  expectNoErrors(errors);
});

test('log ruler follows the view; reverse zoom ends on "You were looking at one."', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = await openApp(page);
  const marker = () =>
    page.evaluate(() => parseFloat((document.querySelector('.ruler-marker') as HTMLElement).style.top));
  await goToLevel(page, 0, 0.5);
  const top = await marker();
  await goToLevel(page, 7, 0.5);
  const bottom = await marker();
  // From the card (tens of cm) to the atom: the marker rides down the ruler.
  expect(bottom).toBeGreaterThan(top + 50);
  await expect(page.locator('.ruler-mark')).toHaveCount(7);

  // Finale → Zoom back out → closing line.
  await goToLevel(page, 7, 0.99);
  await expect.poll(() => page.evaluate(() => (window as any).__teardown.story.finaleVisible)).toBe(true);
  // The 20 s fly-up is wall-clock; software rendering runs at a frame every few seconds, so
  // let the tween engine use real elapsed time and run fast.
  await page.evaluate(() => {
    const { tweens } = (window as any).__teardown;
    tweens.lagSmoothing = false;
    tweens.timeScale = 40;
  });
  await page.locator('#fin-zoomout').click();
  await expect.poll(() => page.evaluate(() => (window as any).__teardown.settings.progress)).toBeLessThan(0.9);
  await expect(page.locator('#coda')).toHaveClass(/on/, { timeout: 120_000 });
  await expect(page.locator('#coda-title')).toHaveText('You were looking at one.');
  await expect(page.locator('#coda-body')).toContainText('2.9 × 10²²');
  expectNoErrors(errors);
});
