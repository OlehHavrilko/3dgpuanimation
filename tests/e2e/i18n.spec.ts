import { expect, test } from '@playwright/test';
import { expectNoErrors, goToLevel, openApp } from './helpers';

/** Russian: ?lang=ru switches the whole page, the choice is remembered, EN switches back in place. */
test('Russian version: ?lang=ru, remembered, EN switches back', async ({ page }) => {
  const errors = await openApp(page, '&nointro&quality=medium&lang=ru');
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('ru');
  await expect(page.locator('#nav-explore')).toHaveText('Исследовать');
  await expect(page.locator('#lvl-name')).toHaveText('GeForce RTX 5090');
  await expect(page.locator('#lvl-scale')).toHaveText('30 см');

  await goToLevel(page, 3, 0.4);
  await expect(page.locator('#lvl-name')).toHaveText('Кристалл GB202');
  await expect(page.locator('#accuracy-btn')).toHaveText('Насколько это точно?');
  await expect(page.locator('#fov-value')).toContainText(/мм|мкм|см/);

  // The choice survives a reload without the parameter.
  await page.goto('/?debug&nointro&quality=medium');
  await page.waitForFunction(() => (window as any).__teardown);
  await expect(page.locator('#nav-explore')).toHaveText('Исследовать');

  // EN in the HUD switch reloads in English (the debug panel sits over the top-right corner).
  await page.evaluate(() => document.querySelector('.lil-gui')?.remove());
  await page.locator('.hud-top .lang-switch button', { hasText: 'EN' }).click();
  await page.waitForFunction(() => document.documentElement.lang === 'en' && (window as any).__teardown);
  await expect(page.locator('#nav-explore')).toHaveText('Explore');
  expectNoErrors(errors);
});
