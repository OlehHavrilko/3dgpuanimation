import { writeFileSync, mkdirSync } from 'node:fs';
import { test } from '@playwright/test';
import { goToLevel, openApp } from './helpers';

/**
 * Level activation benchmark: walks 1 -> 8 and back 8 -> 1, recording what the LevelProfiler
 * measured for every swap. Only runs with BENCH=<label>; writes bench/<label>.{json,md}.
 *   BENCH=after npx playwright test bench
 *   BENCH=baseline BENCH_QUERY='&cache=0' npx playwright test bench   (level cache off)
 * Numbers from SwiftShader are CPU-bound: compare runs against each other, not against a GPU.
 */
const label = process.env.BENCH;
test.skip(!label, 'set BENCH=<label> to run the benchmark');
// Real heap numbers (performance.memory is quantised without this flag).
test.use({
  launchOptions: {
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--enable-precise-memory-info',
    ],
  },
});

test('level activation benchmark', async ({ page }) => {
  test.setTimeout(900_000);
  await openApp(page, process.env.BENCH_QUERY ?? '');
  const order = [1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 0];
  for (const i of order) {
    await goToLevel(page, i, 0.5);
    await page.waitForTimeout(1500); // let background work (if any) settle between swaps
    await page.evaluate(() => (window as any).__teardown.manager.whenIdle?.());
  }
  const records = await page.evaluate(() => (window as any).__teardown.profiler.records);
  const env = await page.evaluate(() => ({
    ua: navigator.userAgent,
    gl: (() => {
      const gl = (window as any).__teardown.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
    })(),
  }));
  mkdirSync('bench', { recursive: true });
  writeFileSync(
    `bench/${label}.json`,
    JSON.stringify({ label, date: new Date().toISOString(), env, records }, null, 2),
  );

  const cols = [
    'index',
    'name',
    'cached',
    'disposeMs',
    'buildMs',
    'warmupMs',
    'firstFrameMs',
    'nextFrameMs',
    'transitionMs',
    'programsCompiled',
    'geometries',
    'textures',
    'gpuMB',
    'heapMB',
  ];
  const md = [
    `# Level activation benchmark: ${label}`,
    '',
    `Renderer: ${env.gl}`,
    '',
    `| ${cols.join(' | ')} |`,
    `| ${cols.map(() => '---').join(' | ')} |`,
    ...records.map((r: Record<string, unknown>) => `| ${cols.map((c) => String(r[c])).join(' | ')} |`),
  ].join('\n');
  writeFileSync(`bench/${label}.md`, md + '\n');
  console.log(md);
});
