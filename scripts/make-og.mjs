// Renders public/og.jpg: a 1200x630 share card over the live RTX 5090 card scene.
// Usage: npm run build && npx vite preview --port 4173 & node scripts/make-og.mjs
// Renders with SwiftShader, so no GPU is required.
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const OUT = process.env.OUT ?? 'public/og.jpg';
const CARD = 0;
const AT = Number(process.env.AT ?? 0.08);

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
page.setDefaultTimeout(300_000);

await page.goto(`${BASE}/?debug&nointro&quality=high&lang=en`);
await page.waitForFunction(() => window.__teardown);
await page.evaluate(
  ([i, at]) => {
    const t = window.__teardown;
    t.settings.override = true;
    t.settings.progress = t.manager.progressForLevel(i, at);
  },
  [CARD, AT],
);
await page.waitForFunction(
  (i) => {
    const t = window.__teardown;
    return t.manager.currentIndex === i && t.profiler.records.length > 0 && !t.profiler.awaitingFirstFrame;
  },
  CARD,
  { timeout: 600_000 },
);
await page.evaluate(
  (k) =>
    new Promise((r) => {
      let i = 0;
      const f = () => (++i >= k ? r(0) : requestAnimationFrame(f));
      requestAnimationFrame(f);
    }),
  10,
);

// Only the WebGL canvas stays; the card text is laid over it.
await page.addStyleTag({
  content: `
    body > *:not(#gl):not(#og), #act, #keynum, .lil-gui { visibility: hidden !important; opacity: 0 !important; }
    #gl { transform: translateX(var(--shift, 230px)); }
    #og { position: fixed; inset: 0; z-index: 99999; pointer-events: none;
      background: linear-gradient(90deg, rgba(0,0,0,.85) 0%, rgba(0,0,0,.55) 35%, rgba(0,0,0,0) 60%); }
    #og .t { position: absolute; left: 64px; top: 50%; transform: translateY(-50%); max-width: 520px; font-family: 'DejaVu Sans', system-ui, sans-serif; color: #eef2e6; }
    #og .eyebrow { font-family: 'DejaVu Sans Mono', monospace; font-weight: 700; font-size: 17px; letter-spacing: .32em; color: #8fd14f; }
    #og h1 { margin: 12px 0 10px; font-size: 92px; line-height: 1; font-weight: 700; letter-spacing: -.01em; }
    #og h1 span { color: #8fd14f; }
    #og .gpu { font-weight: 700; font-size: 30px; letter-spacing: .06em; color: #8fd14f; margin-bottom: 18px; }
    #og p { margin: 0; font-size: 25px; line-height: 1.32; color: #d6dccd; }
  `,
});
await page.evaluate(() => {
  const el = document.createElement('div');
  el.id = 'og';
  el.innerHTML =
    '<div class="t"><div class="eyebrow">INTERACTIVE 3D · WEBGL</div>' +
    '<h1>Die<span>Dive</span></h1>' +
    '<div class="gpu">GEFORCE RTX 5090</div>' +
    '<p>A live 3D teardown: from the card<br>down to a single silicon atom.</p></div>';
  document.body.appendChild(el);
});
await page.waitForTimeout(500);
await page.screenshot({ path: OUT, type: 'jpeg', quality: 88 });
await browser.close();
console.log('wrote', OUT);
