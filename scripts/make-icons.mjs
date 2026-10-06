/**
 * Render the PWA icons from one SVG (same motif as favicon.svg: a die outline around an atom).
 * Run: node scripts/make-icons.mjs   (uses the Playwright Chromium already installed for tests)
 */
import { chromium } from '@playwright/test';

/** `pad` shrinks the motif for maskable icons, whose outer ~10 % may be cropped to a circle. */
const svg = (pad) => {
  const s = 1 - pad * 2;
  const t = (v) => 256 + (v - 256) * s;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><radialGradient id="g"><stop offset="0" stop-color="#e9ffd0"/><stop offset="0.35" stop-color="#a6e05a"/><stop offset="1" stop-color="#76b900" stop-opacity="0"/></radialGradient></defs>
  <rect width="512" height="512" ${pad ? '' : 'rx="96"'} fill="#05080a"/>
  <rect x="${t(128)}" y="${t(128)}" width="${256 * s}" height="${256 * s}" rx="${24 * s}" fill="none" stroke="#76b900" stroke-width="${28 * s}"/>
  <circle cx="256" cy="256" r="${110 * s}" fill="url(#g)" opacity="0.55"/>
  <circle cx="256" cy="256" r="${44 * s}" fill="#e9ffd0"/>
</svg>`;
};

const icons = [
  { file: 'icon-192.png', size: 192, pad: 0 },
  { file: 'icon-512.png', size: 512, pad: 0 },
  { file: 'icon-maskable-512.png', size: 512, pad: 0.1 },
  { file: 'apple-touch-icon.png', size: 180, pad: 0.06 },
];

const browser = await chromium.launch();
for (const { file, size, pad } of icons) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg(pad)}`,
  );
  await page.screenshot({ path: `public/icons/${file}`, omitBackground: true });
  await page.close();
}
await browser.close();
console.log('icons written to public/icons/');
