import { expect, test } from '@playwright/test';
import { bodyHas, expectNoErrors, goToLevel, openApp, waitForLevel } from './helpers';

/** The compute branch (compute.html): its four scales on the shared engine. */
const openBranch = (page: Parameters<typeof openApp>[0], query = '&quality=medium') =>
  openApp(page, query, '/compute.html');

test('compute branch: all 4 scales build, render and swap without errors', async ({ page }) => {
  const errors = await openBranch(page);
  for (let i = 0; i < 4; i++) {
    await goToLevel(page, i, 0.5);
    const state = await page.evaluate(() => {
      const t = (window as any).__teardown;
      return { index: t.manager.currentIndex, calls: t.renderer.info.render.calls, caption: t.manager.current.caption };
    });
    expect(state.index).toBe(i);
    expect(state.calls).toBeGreaterThan(0);
    expect(state.caption.length).toBeGreaterThan(0);
  }
  await expect(page.locator('#lvl-index')).toHaveText('04 / 04');
  expectNoErrors(errors);
});

test('compute branch: the end card offers the way back', async ({ page }) => {
  const errors = await openBranch(page);
  await goToLevel(page, 3, 0.97);
  await expect(page.locator('#cmp-end')).toHaveClass(/on/);
  await expect(page.locator('#cmp-end-back')).toHaveAttribute('href', /#l=6/);
  expectNoErrors(errors);
});

test('compute branch: scroll drives it, Explore and the accuracy note work', async ({ page }) => {
  const errors = await openBranch(page);
  await page.evaluate(() => window.scrollTo(0, 0.6 * (document.documentElement.scrollHeight - innerHeight)));
  await waitForLevel(page, 2);
  await page.keyboard.press('e');
  await expect.poll(() => bodyHas(page, 'exploring')).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => bodyHas(page, 'exploring')).toBe(false);
  await page.locator('#accuracy-btn').click();
  await expect(page.locator('#accuracy')).toContainText('IEEE 754');
  expectNoErrors(errors);
});

test('compute branch: Russian text and sources', async ({ page }) => {
  const errors = await openBranch(page, '&quality=medium&lang=ru');
  await expect(page.locator('#lvl-name')).toHaveText('Потоковый мультипроцессор');
  await page.keyboard.press('g');
  await expect(page.locator('#reference')).toHaveClass(/on/);
  await expect(page.locator('#reference')).toContainText('IEEE 754');
  expectNoErrors(errors);
});

test('compute branch: the main descent offers it, and the branch is reachable by deep link', async ({ page }) => {
  const errors = await openApp(page);
  await expect(page.locator('#fin-compute')).toHaveAttribute('href', './compute.html');
  expectNoErrors(errors);
  const branch = await openBranch(page, '&quality=medium');
  await expect(page.locator('#lvl-name')).toHaveText('Streaming Multiprocessor');
  await expect(page.locator('#nav-voice')).toHaveCount(1);
  expectNoErrors(branch);
});
