import { expect, test } from '@playwright/test';
import { expectNoErrors, openApp, waitForLevel } from './helpers';

test('PWA: manifest and icons resolve', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(href!)).json();
  expect(manifest.start_url).toBe('./');
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(['192x192', '512x512', '512x512']);
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
});

test('PWA: once the service worker is in, the app reloads offline', async ({ page, context }) => {
  const errors = await openApp(page);
  // Installed, activated and controlling this page (the worker claims open clients).
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active && !!navigator.serviceWorker.controller;
  });
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => (window as any).__teardown);
  await waitForLevel(page, 0);
  await expect(page.locator('#nav-explore')).toBeVisible();
  await context.setOffline(false);
  expectNoErrors(errors);
});
