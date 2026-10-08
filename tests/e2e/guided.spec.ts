import { expect, test } from '@playwright/test';
import { bodyHas, expectNoErrors, goToLevel, openApp, waitForLevel } from './helpers';

/** The guided-experience layer: landing, tour, acts, key numbers, finale, labels, palette, deep links. */

test('landing: attract drift, then Start the descent runs the guided tour', async ({ page }) => {
  const errors = await openApp(page, '&quality=medium');
  await expect(page.locator('#intro')).not.toHaveClass(/hide/);
  // The landing keeps the scene moving on its own.
  const p0 = await page.evaluate(() => (window as any).__teardown.settings.progress);
  await expect
    .poll(() => page.evaluate(() => (window as any).__teardown.settings.progress), { timeout: 60_000 })
    .not.toBe(p0);
  await page.locator('#intro-tour').click();
  await expect(page.locator('#intro')).toHaveClass(/hide/);
  expect(await page.evaluate(() => (window as any).__teardown.tour.playing)).toBe(true);
  await expect(page.locator('#tour-play')).toHaveText('Pause');
  // Space pauses it.
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => (window as any).__teardown.tour.playing)).toBe(false);
  expectNoErrors(errors);
});

test('acts and key numbers appear where they belong', async ({ page }) => {
  const errors = await openApp(page);
  await goToLevel(page, 2, 0.5);
  // Act cards never come back to back: let the Act I card's cooldown run out first (it counts
  // frame time, which is slow under SwiftShader).
  await expect
    .poll(() => page.evaluate(() => (window as any).__teardown.story.cardCooldown), { timeout: 120_000 })
    .toBeLessThanOrEqual(0);
  await goToLevel(page, 3, 0.1); // first scale of Act II
  await expect(page.locator('#act')).toHaveClass(/on/);
  await expect(page.locator('#act-title')).toHaveText('The Computation');
  await goToLevel(page, 3, 0.45); // past the "92.2 billion" mark
  await expect(page.locator('#keynum')).toHaveClass(/on/);
  await expect(page.locator('#kn-number')).toHaveText('92.2');
  expectNoErrors(errors);
});

test('finale opens at the bottom of the nucleus and Share frame downloads a PNG', async ({ page }) => {
  const errors = await openApp(page);
  await goToLevel(page, 8, 0.99);
  await expect.poll(() => page.evaluate(() => (window as any).__teardown.story.finaleVisible)).toBe(true);
  await expect(page.locator('#finale')).toHaveClass(/on/);
  const download = page.waitForEvent('download', { timeout: 60_000 });
  await page.locator('#fin-share').click();
  expect((await download).suggestedFilename()).toMatch(/^diedive-09-.*\.png$/);
  expectNoErrors(errors);
});

test('3D labels (L) and the command palette (Ctrl+K)', async ({ page }) => {
  const errors = await openApp(page);
  await goToLevel(page, 0, 0.3);
  await page.keyboard.press('l');
  await expect(page.locator('#nav-labels')).toHaveClass(/on/);
  await expect.poll(() => page.locator('#labels .label-text').count()).toBeGreaterThan(0);

  await page.keyboard.press('Control+k');
  await expect.poll(() => bodyHas(page, 'palette')).toBe(true);
  await page.keyboard.type('Silicon lattice');
  await page.keyboard.press('Enter');
  await expect.poll(() => bodyHas(page, 'palette')).toBe(false);
  // The palette jumps by scrolling the timeline there.
  await waitForLevel(page, 6);
  expectNoErrors(errors);
});

test('deep link opens a scale at a point inside it, in a view mode', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug&quality=medium#l=5&p=40&v=Section');
  await page.waitForFunction(() => (window as any).__teardown);
  await waitForLevel(page, 4);
  await expect
    .poll(() => page.evaluate(() => (window as any).__teardown.interaction.views.mode), { timeout: 60_000 })
    .toBe('Section');
  // The URL keeps the point inside the scale (5 % steps), so the frame can be shared back.
  await expect
    .poll(() => page.evaluate(() => location.hash), { timeout: 60_000 })
    .toMatch(/^#l=5&p=(35|40|45)&v=Section$/);
  expectNoErrors(errors);
});

test('Sources & glossary: G opens it, tabs switch, a term jumps to its scale', async ({ page }) => {
  const errors = await openApp(page);
  await page.keyboard.press('g');
  await expect(page.locator('#reference')).toHaveClass(/on/);
  await expect(page.locator('#ref-glossary dt')).toHaveCount(28);
  // While open, scene keys do nothing: F must not start the Trace.
  await page.keyboard.press('f');
  expect(await bodyHas(page, 'following')).toBe(false);
  await page.locator('#ref-tab-sources').click();
  await expect(page.locator('#ref-sources')).toBeVisible();
  await expect(page.locator('#ref-sources a')).toHaveCount(10);
  await page.keyboard.press('Escape');
  await expect(page.locator('#reference')).not.toHaveClass(/on/);
  // The accuracy note links to the sources.
  await page.locator('#accuracy-btn').click();
  await page.locator('.acc-more').click();
  await expect(page.locator('#ref-sources')).toBeVisible();
  // "Show ▸" on a glossary term closes the panel and flies to that scale.
  await page.locator('#ref-tab-glossary').click();
  // (A neighbouring scale: under software rendering every level on the way costs seconds.)
  await page.locator('#ref-glossary dt', { hasText: 'GDDR7' }).locator('.ref-go').click();
  await expect(page.locator('#reference')).not.toHaveClass(/on/);
  await expect
    .poll(() => page.evaluate(() => (window as any).__teardown.manager.currentIndex), { timeout: 120_000 })
    .toBe(1);
  expectNoErrors(errors);
});

test('F follows the electron, Shift+F does not', async ({ page }) => {
  const errors = await openApp(page);
  await page.keyboard.press('Shift+F');
  expect(await bodyHas(page, 'following')).toBe(false);
  await page.keyboard.press('f');
  await expect.poll(() => bodyHas(page, 'following')).toBe(true);
  // Starting the guided tour takes the timeline back from follow mode.
  await page.keyboard.press('Space');
  await expect.poll(() => bodyHas(page, 'following')).toBe(false);
  expect(await page.evaluate(() => (window as any).__teardown.tour.playing)).toBe(true);
  expectNoErrors(errors);
});

test('sound toggle', async ({ page }) => {
  const errors = await openApp(page);
  await page.locator('#nav-sound').click();
  await expect(page.locator('#nav-sound')).toHaveText('Sound on');
  await page.locator('#nav-sound').click();
  await expect(page.locator('#nav-sound')).toHaveText('Sound');
  expectNoErrors(errors);
});

test('WebGL context loss pauses rendering and recovers', async ({ page }) => {
  const errors = await openApp(page);
  await goToLevel(page, 1, 0.5);
  await page.evaluate(() => {
    const t = (window as any).__teardown;
    (window as any).__lose = t.renderer.getContext().getExtension('WEBGL_lose_context');
    (window as any).__lose.loseContext();
  });
  await expect.poll(() => bodyHas(page, 'context-lost')).toBe(true);
  await page.evaluate(() => (window as any).__lose.restoreContext());
  await expect.poll(() => bodyHas(page, 'context-lost')).toBe(false);
  // Keeps working after the restore: a neighbour level can still be entered and drawn.
  await goToLevel(page, 2, 0.5);
  expect(await page.evaluate(() => (window as any).__teardown.renderer.info.render.calls)).toBeGreaterThan(0);
  expectNoErrors(errors);
});
