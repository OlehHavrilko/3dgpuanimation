// Captures the README media: one screenshot per scale and a short GIF of the descent.
// Usage: npm run build && npx vite preview --port 4173 & node scripts/capture-media.mjs
// Needs ffmpeg on PATH for the GIF. Renders with SwiftShader, so no GPU is required.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const OUT = 'docs/media';
const NAMES = ['gpu', 'pcb', 'package', 'die', 'metal', 'finfet', 'lattice', 'atom'];
// Where in each level the shot is taken: past the intro, before the dive.
const SHOT_AT = [0.3, 0.45, 0.45, 0.5, 0.5, 0.5, 0.5, 0.5];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
// Software rendering at the high tier can take tens of seconds per frame.
page.setDefaultTimeout(300_000);

const settle = (n) =>
  page.evaluate(
    (k) =>
      new Promise((r) => {
        let i = 0;
        const f = () => (++i >= k ? r(0) : requestAnimationFrame(f));
        requestAnimationFrame(f);
      }),
    n,
  );

const goTo = async (level, local) => {
  await page.evaluate(
    ([i, l]) => {
      const t = window.__teardown;
      t.settings.override = true;
      t.settings.progress = t.manager.progressForLevel(i, l);
    },
    [level, local],
  );
  await page.waitForFunction(
    (i) => {
      const t = window.__teardown;
      const recs = t.profiler.records;
      return t.manager.currentIndex === i && recs.length > 0 && !t.profiler.awaitingFirstFrame;
    },
    level,
    { timeout: 600_000 },
  );
};

// Act title cards and anchor numbers are timed for the tour; in a still they cover the scene.
const clean = () =>
  page.addStyleTag({
    content: '.lil-gui, #act, #keynum { display: none !important; }',
  });
const noKeynum = () => page.evaluate(() => document.body.classList.remove('keynum-on'));

// Landing card, as a first-time visitor sees it.
if (!existsSync(`${OUT}/00-landing.png`)) {
  await page.goto(`${BASE}/?quality=high`);
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}/00-landing.png` });
}

await page.goto(`${BASE}/?debug&nointro&quality=high`);
await page.waitForFunction(() => window.__teardown);
await clean();

// Existing shots are kept, so an interrupted run can resume; delete a file to retake it.
for (let i = 0; i < 8; i++) {
  const file = `${OUT}/${String(i + 1).padStart(2, '0')}-${NAMES[i]}.png`;
  if (existsSync(file)) continue;
  await goTo(i, SHOT_AT[i]);
  await settle(8);
  await noKeynum();
  await settle(2);
  await page.screenshot({ path: file });
  console.log('shot', NAMES[i]);
}

// The finale card at the bottom of the atom.
if (!existsSync(`${OUT}/09-finale.png`)) {
  await goTo(7, 0.95);
  await settle(40);
  await page.screenshot({ path: `${OUT}/09-finale.png` });
  console.log('shot finale');
}

// GIF: step the timeline from the card to the atom, one frame per step, at the medium tier.
await page.goto(`${BASE}/?debug&nointro&quality=medium`);
await page.waitForFunction(() => window.__teardown);
await clean();
const frames = mkdtempSync(join(tmpdir(), 'descent-'));
await page.setViewportSize({ width: 960, height: 540 });
const FRAMES = Number(process.env.FRAMES ?? 80);
for (let f = 0; f < FRAMES; f++) {
  const p = f / (FRAMES - 1);
  const level = Math.min(7, Math.floor(p * 8));
  const local = Math.min(0.999, p * 8 - level);
  await goTo(level, local);
  await noKeynum();
  await settle(3);
  await page.screenshot({ path: join(frames, `f${String(f).padStart(4, '0')}.png`) });
  if (f % 20 === 0) console.log('frame', f);
}
await browser.close();

execFileSync('ffmpeg', [
  '-y',
  '-loglevel',
  'error',
  '-framerate',
  '10',
  '-i',
  join(frames, 'f%04d.png'),
  '-vf',
  'scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
  '-loop',
  '0',
  `${OUT}/descent.gif`,
]);
rmSync(frames, { recursive: true, force: true });
console.log('done');
