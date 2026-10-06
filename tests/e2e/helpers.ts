import { expect, type Page } from '@playwright/test';

/**
 * Open the app with the debug handle (window.__teardown) and collect JS errors.
 * Defaults: no landing card (its attract drift owns the timeline) and a fixed quality tier,
 * so the run doesn't depend on the machine's core count. `path` opens another page (memory.html).
 */
export async function openApp(page: Page, query = '&nointro&quality=medium', path = '/') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  await page.goto(`${path}?debug${query}`);
  await page.waitForFunction(() => (window as any).__teardown);
  // The lil-gui panel overlaps the inspector in screenshots; tests never need it.
  await page.evaluate(() => document.querySelector('.lil-gui')?.remove());
  await waitForLevel(page, 0);
  return errors;
}

/** Jump the timeline (debug override, no scrolling) to a level's local position. */
export async function goToLevel(page: Page, index: number, local = 0.5) {
  await page.evaluate(
    ([i, l]) => {
      const t = (window as any).__teardown;
      t.settings.override = true;
      t.settings.progress = t.manager.progressForLevel(i, l);
    },
    [index, local] as const,
  );
  await waitForLevel(page, index);
}

/** Wait until `index` is active AND its first frame has been rendered (profiler record exists). */
export async function waitForLevel(page: Page, index: number) {
  await page.waitForFunction(
    (i) => {
      const t = (window as any).__teardown;
      const recs = t.profiler.records;
      return (
        t.manager.currentIndex === i &&
        recs.length > 0 &&
        recs[recs.length - 1].index === i &&
        !t.profiler.awaitingFirstFrame
      );
    },
    index,
    { timeout: 120_000 },
  );
}

export async function bodyHas(page: Page, cls: string) {
  return page.evaluate((c) => document.body.classList.contains(c), cls);
}

export function expectNoErrors(errors: string[]) {
  // SwiftShader may warn about GPU stalls; those are not errors of ours.
  expect(errors.filter((e) => !/GPU stall|WebGL-/.test(e))).toEqual([]);
}
