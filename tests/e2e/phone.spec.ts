import { devices, expect, test } from '@playwright/test';
import { expectNoErrors, goToLevel, openApp } from './helpers';

/**
 * Phone preset: a 3x touch screen must not fall back to the 1x desktop "low" look. Checks the
 * probed preset (no forced tier), the render resolution and that the metal stack draws cleanly.
 */
const { defaultBrowserType: _browser, ...pixel } = devices['Pixel 7'];
test.use(pixel);

test('phone gets a sharp preset without DOF and a clean metal stack', async ({ page }) => {
  const errors = await openApp(page, '&nointro');
  const tier = await page.evaluate(() => (window as any).__teardown.settings.tier as string);
  expect(tier).toContain('phone');
  const ratio = await page.evaluate(() => {
    const c = document.getElementById('gl') as HTMLCanvasElement;
    return c.width / c.clientWidth;
  });
  expect(ratio).toBeGreaterThanOrEqual(1.25);
  expect(await page.evaluate(() => (window as any).__teardown.settings.dof)).toBe(false);

  await goToLevel(page, 4, 0.5);
  // A NaN/Inf leak through bloom shows as a near-white or near-black frame.
  // Read back in the same frame the app drew it (the drawing buffer is not preserved).
  const mean = await page.evaluate(
    () =>
      new Promise<number>((resolve) =>
        requestAnimationFrame(() => {
          const src = document.getElementById('gl') as HTMLCanvasElement;
          const c = document.createElement('canvas');
          c.width = 64;
          c.height = 64;
          const g = c.getContext('2d')!;
          g.drawImage(src, 0, 0, 64, 64);
          const d = g.getImageData(0, 0, 64, 64).data;
          let sum = 0;
          for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
          resolve(sum / (d.length / 4));
        }),
      ),
  );
  expect(mean).toBeGreaterThan(5);
  expect(mean).toBeLessThan(200);
  expectNoErrors(errors);
});
