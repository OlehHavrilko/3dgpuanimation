import { expect, test } from '@playwright/test';
import { expectNoErrors, goToLevel, openApp } from './helpers';

/** Spoken narration: off by default, V / the button turns it on, and a recorded clip is fetched in the page language. */
test('voice: toggles, loads the manifest and plays a recorded clip', async ({ page }) => {
  const clips: string[] = [];
  page.on('request', (r) => {
    if (/\/voice\/(manifest\.json|ru\/[0-9a-f]{8}\.mp3)/.test(r.url())) clips.push(r.url());
  });
  const errors = await openApp(page, '&nointro&quality=medium&lang=ru');
  const button = page.locator('#nav-voice');
  await expect(button).toHaveText('Голос');
  expect(clips).toHaveLength(0);

  await button.click();
  await expect(button).toHaveText('Голос вкл');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  // The confirmation phrase is itself a recorded clip.
  await expect.poll(() => clips.some((u) => u.endsWith('.mp3'))).toBe(true);
  expect(clips.some((u) => u.endsWith('manifest.json'))).toBe(true);

  await page.keyboard.press('v');
  await expect(button).toHaveText('Голос');
  await goToLevel(page, 1, 0.4);
  expectNoErrors(errors);
});
