import { expect, test } from '@playwright/test';
import { bodyHas, expectNoErrors, goToLevel, openApp, waitForLevel } from './helpers';

/**
 * Baseline: every user-facing feature that exists today, exercised end to end.
 * Functional checks only (SwiftShader gives no meaningful frame rate).
 */

test('all 8 levels build, render and swap without errors', async ({ page }) => {
  const errors = await openApp(page);
  for (let i = 0; i < 8; i++) {
    await goToLevel(page, i, 0.5);
    const state = await page.evaluate(() => {
      const t = (window as any).__teardown;
      return { index: t.manager.currentIndex, calls: t.renderer.info.render.calls, caption: t.manager.current.caption };
    });
    expect(state.index).toBe(i);
    expect(state.calls).toBeGreaterThan(0);
    expect(state.caption.length).toBeGreaterThan(0);
  }
  expectNoErrors(errors);
});

test('scrolling the page drives the timeline', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => window.scrollTo(0, 0.62 * (document.documentElement.scrollHeight - innerHeight)));
  await waitForLevel(page, 4);
  expectNoErrors(errors);
});

test('Explore: E enters, Esc leaves, camera is handed back', async ({ page }) => {
  const errors = await openApp(page);
  await goToLevel(page, 0, 0.3);
  await page.keyboard.press('e');
  await expect.poll(() => bodyHas(page, 'exploring')).toBe(true);
  expect(await page.evaluate(() => (window as any).__teardown.ctx.view.freeCamera)).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => bodyHas(page, 'exploring')).toBe(false);
  expect(await page.evaluate(() => (window as any).__teardown.ctx.view.freeCamera)).toBe(false);
  expectNoErrors(errors);
});

test('hover + click selects an entity and opens the inspector', async ({ page }) => {
  const errors = await openApp(page);
  await goToLevel(page, 0, 0.05);
  // The card fills the centre of the frame at the start of level 1.
  await page.mouse.move(470, 250, { steps: 4 });
  await expect.poll(() => page.evaluate(() => document.getElementById('tip')!.classList.contains('on'))).toBe(true);
  await page.mouse.click(470, 250);
  await expect.poll(() => bodyHas(page, 'inspecting')).toBe(true);
  await expect(page.locator('#inspector .insp-title')).not.toHaveText('');
  expectNoErrors(errors);
});

test('view modes: X-Ray, Section, Thermal, back to Normal', async ({ page }) => {
  const errors = await openApp(page);
  await goToLevel(page, 0, 0.3);
  const mode = (m: string) => page.evaluate((x) => (window as any).__teardown.interaction.setViewMode(x), m);
  const probe = () =>
    page.evaluate(() => {
      const t = (window as any).__teardown;
      let shader = 0;
      t.manager.current.scene.traverse((o: any) => {
        if (o.isMesh && o.material?.isShaderMaterial && o.material.uniforms?.uColor) shader++;
      });
      return { mode: t.interaction.views.mode, clip: t.renderer.clippingPlanes.length, swapped: shader };
    });

  await mode('X-Ray');
  expect(await probe()).toMatchObject({ mode: 'X-Ray', clip: 0 });
  expect((await probe()).swapped).toBeGreaterThan(10);

  await mode('Section');
  expect(await probe()).toMatchObject({ mode: 'Section', clip: 1 });

  await mode('Thermal');
  expect((await probe()).mode).toBe('Thermal');
  await expect
    .poll(() => page.evaluate(() => (window as any).__teardown.interaction.views.thermal.temp('gpu')), {
      timeout: 60_000,
    })
    .toBeGreaterThan(30);

  await mode('Normal');
  expect(await probe()).toEqual({ mode: 'Normal', clip: 0, swapped: 0 });
  expectNoErrors(errors);
});

test('signal trace: PCB stages, then the die path', async ({ page }) => {
  const errors = await openApp(page);
  await goToLevel(page, 1, 0.4);
  await page.evaluate(() => (window as any).__teardown.ctx.trace(4, 1));
  await expect(page.locator('#inspector .insp-kind')).toContainText('Trace 1/3', { timeout: 60_000 });
  await expect(page.locator('#inspector .insp-title')).toHaveText('GDDR7 · M5');

  // Continue into the die: the die level builds a 4-stage plan for the same channel.
  await page.evaluate(() => (window as any).__teardown.interaction.exitExplore(true));
  await goToLevel(page, 3, 0.5);
  const plan = await page.evaluate(() =>
    (window as any).__teardown.manager.current.tracePlan().map((h: any) => h.info.title),
  );
  expect(plan).toEqual([
    'Memory controller 5',
    'L2 cache · east partition',
    expect.stringMatching(/^GPC \d+$/),
    expect.stringMatching(/^SM \d+/),
  ]);
  await expect(page.locator('#inspector .insp-kind')).toContainText('Trace 1/4', { timeout: 60_000 });
  expectNoErrors(errors);
});

test('transistor gate controls', async ({ page }) => {
  const errors = await openApp(page);
  await goToLevel(page, 5, 0.6);
  await page.keyboard.press('e');
  await page.locator('#inspector .seg button', { hasText: /^OFF$/ }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__teardown.manager.current.gateOn)).toBeLessThan(0.05);
  await page.locator('#inspector .seg button', { hasText: /^ON$/ }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__teardown.manager.current.gateOn)).toBeGreaterThan(0.95);
  expectNoErrors(errors);
});

test('follow the electron: tour runs, tracer is visible, F stops it', async ({ page }) => {
  const errors = await openApp(page);
  await page.locator('#nav-follow').click();
  await expect.poll(() => bodyHas(page, 'following')).toBe(true);
  await expect
    .poll(() => page.evaluate(() => (window as any).__teardown.interaction.tracer.points.visible), { timeout: 60_000 })
    .toBe(true);
  // The tour advances the timeline on its own.
  await expect
    .poll(() => page.evaluate(() => (window as any).__teardown.settings.progress), { timeout: 60_000 })
    .toBeGreaterThan(0.005);
  await page.keyboard.press('f');
  await expect.poll(() => bodyHas(page, 'following')).toBe(false);
  expectNoErrors(errors);
});

test('levels release GPU resources when swapped out', async ({ page }) => {
  const errors = await openApp(page);
  const mem = () => page.evaluate(() => ({ ...(window as any).__teardown.renderer.info.memory }));
  await goToLevel(page, 0, 0.5);
  const first = await mem();
  for (const i of [1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 0]) await goToLevel(page, i, 0.5);
  const again = await mem();
  // Same level, same scene: the counts must come back to where they were.
  expect(again).toEqual(first);
  expectNoErrors(errors);
});
