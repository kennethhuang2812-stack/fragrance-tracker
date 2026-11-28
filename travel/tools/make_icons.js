// Draws the app icons (a white plane on the app's blue) with headless Chromium.
// Usage: node travel/tools/make_icons.js
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const DIR = fileURLToPath(new URL('../', import.meta.url));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0b5cad"/>
<g transform="translate(256 262) rotate(-45) scale(9.2) translate(-12 -12)" fill="#fff">
<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></g></svg>`;
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size] of [['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: DIR + name, omitBackground: false });
}
await browser.close();
console.log('icons written');
