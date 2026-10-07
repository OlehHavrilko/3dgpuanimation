import { expect, test } from '@playwright/test';
import { bodyHas, expectNoErrors, goToLevel, openApp, waitForLevel } from './helpers';

/** The memory branch (memory.html): its four scales on the shared engine. */
const openBranch = (page: Parameters<typeof openApp>[0], query = '&quality=medium') =>
  openApp(page, query, '/memory.html');

test('memory branch: all 4 scales build, render and swap without errors', async ({ page }) => {
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

test('memory branch: the end card offers the way back', async ({ page }) => {
  const errors = await openBranch(page);
  await goToLevel(page, 3, 0.97);
  await expect(page.locator('#mem-end')).toHaveClass(/on/);
  await expect(page.locator('#mem-end-back')).toHaveAttribute('href', /#l=3/);
  expectNoErrors(errors);
});

test('memory branch: scroll drives it, Explore and the accuracy note work', async ({ page }) => {
  const errors = await openBranch(page);
  await page.evaluate(() => window.scrollTo(0, 0.6 * (document.documentElement.scrollHeight - innerHeight)));
  await waitForLevel(page, 2);
  await page.keyboard.press('e');
  await expect.poll(() => bodyHas(page, 'exploring')).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => bodyHas(page, 'exploring')).toBe(false);
  await page.locator('#accuracy-btn').click();
  await expect(page.locator('#accuracy')).toContainText('32.6 nm');
  expectNoErrors(errors);
});

test('memory branch: Russian text and sources', async ({ page }) => {
  const errors = await openBranch(page, '&quality=medium&lang=ru');
  await expect(page.locator('#lvl-name')).toHaveText('Чип GDDR7');
  await page.keyboard.press('g');
  await expect(page.locator('#reference')).toHaveClass(/on/);
  await expect(page.locator('#reference')).toContainText('JESD239');
  expectNoErrors(errors);
});

test('memory branch: a failing render loop shows the fallback instead of a silent black page', async ({ page }) => {
  const errors = await openBranch(page);
  await expect(page.locator('#fallback')).toBeHidden();
  await page.evaluate(() => (window as any).__teardown.injectFault(3));
  await expect(page.locator('#fallback')).toBeVisible();
  // The failures are still reported as errors (a real bug keeps failing the other tests).
  expect(errors.filter((e) => e.includes('injected render fault')).length).toBeGreaterThan(0);
});

test('memory branch: InteractionManager.dispose() removes its listeners', async ({ page }) => {
  const errors = await openBranch(page);
  await page.keyboard.press('e');
  await expect.poll(() => bodyHas(page, 'exploring')).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => bodyHas(page, 'exploring')).toBe(false);
  await page.evaluate(() => (window as any).__teardown.interaction.dispose());
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  expect(await bodyHas(page, 'exploring')).toBe(false);
  expectNoErrors(errors);
});
