import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { expectNoErrors, goToLevel, openApp } from './helpers';

/**
 * Accessibility: axe-core (WCAG 2.1 A + AA rules) over every state a visitor reaches: the
 * landing card, the HUD on a scale, Explore with the inspector, the command palette, the
 * sources & glossary sheet, the finale and the Russian page.
 */

async function audit(page: Page, include?: string) {
  let axe = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  if (include) axe = axe.include(include);
  const { violations } = await axe.analyze();
  // One line per failing node, so the CI log says what to fix without a report download.
  const lines = violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')} — ${n.failureSummary}`));
  expect(lines).toEqual([]);
}

test('landing card', async ({ page }) => {
  await page.goto('/?quality=medium');
  await expect(page.locator('#intro')).toBeVisible();
  await audit(page);
});

test('HUD on a scale, both languages', async ({ page }) => {
  const errors = await openApp(page);
  await goToLevel(page, 3, 0.5);
  await audit(page);

  await openApp(page, '&nointro&quality=medium&lang=ru');
  await goToLevel(page, 3, 0.5);
  await audit(page);
  expectNoErrors(errors);
});

test('Explore with the inspector open', async ({ page }) => {
  const errors = await openApp(page);
  await goToLevel(page, 0, 0.05);
  await page.mouse.click(470, 250);
  await expect.poll(() => page.evaluate(() => document.body.classList.contains('inspecting'))).toBe(true);
  await audit(page);
  expectNoErrors(errors);
});

test('command palette and the sources sheet', async ({ page }) => {
  const errors = await openApp(page);
  await page.keyboard.press('Control+k');
  await expect(page.locator('.pal-panel')).toBeVisible();
  await audit(page);
  await page.keyboard.press('Escape');

  await page.keyboard.press('g');
  await expect(page.locator('.ref-panel')).toBeVisible();
  await audit(page);
  expectNoErrors(errors);
});

test('finale', async ({ page }) => {
  const errors = await openApp(page);
  await goToLevel(page, 8, 0.99);
  await expect.poll(() => page.evaluate(() => (window as any).__teardown.story.finaleVisible)).toBe(true);
  await audit(page);
  expectNoErrors(errors);
});
