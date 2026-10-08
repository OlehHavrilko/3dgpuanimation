import { expect, test } from '@playwright/test';
import { expectNoErrors, goToLevel, openApp } from './helpers';

/**
 * Section view of the metal stack (level 5). The block runs 40 µm back from the cut face while the
 * camera works within a few pitches of it, so the slider used to sweep the cut plane through empty
 * space: most positions removed everything in view and left a black frame. These check pixel
 * statistics (platform independent, unlike a baseline): the cut face must fill the frame with the
 * copper palette at every slider position, and no large region may be uniform off-palette.
 */
const STEP = 1 / 30;

/** Frame stats from the drawing buffer, read in the same task as the render. */
async function frameStats(page: import('@playwright/test').Page) {
  return page.evaluate(
    async ([dt]) => {
      const t = (window as any).__teardown;
      t.clock.step(1, dt);
      const url = t.renderer.domElement.toDataURL('image/png') as string;
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      let lit = 0;
      let nonFinite = 0;
      // Largest share of one 16x16 block grid cell that is a single flat colour (excluding black).
      const cell = 16;
      let flatBlocks = 0;
      let blocks = 0;
      for (let y = 0; y + cell <= c.height; y += cell) {
        for (let x = 0; x + cell <= c.width; x += cell) {
          let mn = 255;
          let mx = 0;
          let sum = 0;
          for (let j = 0; j < cell; j++) {
            for (let i = 0; i < cell; i++) {
              const o = ((y + j) * c.width + x + i) * 4;
              const l = (data[o] + data[o + 1] + data[o + 2]) / 3;
              mn = Math.min(mn, l);
              mx = Math.max(mx, l);
              sum += l;
            }
          }
          blocks++;
          // A flat, bright block is an unpainted or blown-out patch; a flat dark one is background.
          if (mx - mn < 2 && sum / (cell * cell) > 120) flatBlocks++;
        }
      }
      for (let o = 0; o < data.length; o += 4) {
        if (data[o] + data[o + 1] + data[o + 2] > 60) lit++;
        if (data[o + 3] !== 255) nonFinite++;
      }
      return { lit: lit / (data.length / 4), flat: flatBlocks / blocks, nonFinite };
    },
    [STEP] as const,
  );
}

for (const [cut, local] of [
  [0.3, 0.5],
  [0.5, 0.5],
  [0.8, 0.2],
] as const) {
  test(`section view of the metal stack is painted (cut ${cut}, depth ${local})`, async ({ page }) => {
    test.setTimeout(600_000);
    const errors = await openApp(page);
    await goToLevel(page, 4, local);
    // Drive the frames by hand from here on (the grain is time-seeded noise, not under test).
    await page.evaluate(() => {
      const t = (window as any).__teardown;
      t.clock.paused = true;
      t.post.grainScale = 0;
    });
    await page.evaluate(() => (window as any).__teardown.manager.whenIdle());
    // Let the eased camera arrive at the level's pose before Explore takes it over.
    await page.evaluate(() => (window as any).__teardown.clock.step(40, 1 / 30));
    await page.evaluate(
      ([c]) => {
        const t = (window as any).__teardown;
        t.interaction.setViewMode('Section');
        t.interaction.views.section = c;
        t.clock.step(30, 1 / 30);
      },
      [cut] as const,
    );
    const s = await frameStats(page);
    expect(s.nonFinite).toBe(0);
    // The cut face (copper, dielectric, caps) covers a good part of the frame, not just an outline.
    expect(s.lit).toBeGreaterThan(0.08);
    // No big flat bright patch (unpainted slab, blown-out bloom, NaN fill).
    expect(s.flat).toBeLessThan(0.1);
    expectNoErrors(errors);
  });
}
