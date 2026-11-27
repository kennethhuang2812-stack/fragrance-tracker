// Loads the app in headless Chromium against a fixture data file, with "today" frozen at
// 2026-11-27 in Melbourne, and checks what Ken would see on his phone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

async function serve() {
  const port = await freePort();
  const proc = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', ROOT], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/travel/`); if (r.ok) break; } catch (e) { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  return { base: `http://127.0.0.1:${port}`, stop: () => proc.kill() };
}

async function openApp(base, path = '/travel/?data=tests/fixtures/app-data.json') {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Australia/Melbourne', serviceWorkers: 'block' });
  await ctx.addInitScript(() => {
    const T = Date.parse('2026-11-27T10:00:00+11:00');
    const D = Date;
    class Frozen extends D { constructor(...a) { super(...(a.length ? a : [T])); } static now() { return T; } }
    window.Date = Frozen;
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base + path);
  return { browser, page, errors };
}

test('the app shows Melbourne ⇄ Auckland, pairs, a day sheet and other routes', async () => {
  const srv = await serve();
  const { browser, page, errors } = await openApp(srv.base);
  try {
    await page.waitForSelector('.cal');
    assert.match(await page.locator('h2.route').first().innerText(), /Melbourne ⇄ Auckland/);
    assert.match(await page.locator('.sale').innerText(), /\$305/);
    const pair = await page.locator('.pairs .row').first().innerText();
    assert.match(pair, /\$672/);
    assert.match(pair, /7 nights/);
    await page.click('[data-dir="MEL-AKL"][data-date="2026-12-10"]');
    const sheet = page.locator('#sheet');
    await sheet.waitFor();
    const text = await sheet.innerText();
    assert.match(text, /Qatar Airways/);
    assert.match(text, /1:20 am/);
    const href = await sheet.locator('a[href^="https://www.google.com/travel/flights?q="]').first().getAttribute('href');
    assert.ok(href);
    await page.keyboard.press('Escape');
    const syd = page.locator('.others .row', { hasText: 'Sydney ⇄ Auckland' });
    assert.equal(await syd.count(), 1);
    assert.match(await syd.innerText(), /7 days ago/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390));
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    srv.stop();
  }
});

test('a route row opens that route, and Back returns home', async () => {
  const srv = await serve();
  const { browser, page, errors } = await openApp(srv.base);
  try {
    await page.waitForSelector('.cal');
    await page.locator('.others .row', { hasText: 'Sydney ⇄ Auckland' }).click();
    await page.waitForFunction(() => location.hash === '#SYD-AKL');
    // hashchange renders after the hash updates, so wait for the new heading.
    await page.waitForFunction(() => /Sydney/.test(document.querySelector('h2.route')?.textContent || ''), null, { timeout: 5000 });
    assert.match(await page.locator('h2.route').first().innerText(), /Sydney ⇄ Auckland/);
    assert.equal(await page.locator('[data-dir="SYD-AKL"][data-date="2026-12-14"]').count(), 1);
    await page.click('.nav button');
    await page.waitForFunction(() => /Melbourne/.test(document.querySelector('h2.route')?.textContent || ''), null, { timeout: 5000 });
    assert.match(await page.locator('h2.route').first().innerText(), /Melbourne ⇄ Auckland/);
    assert.equal(await page.evaluate(() => location.hash), '');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    srv.stop();
  }
});

test('the fragrance and liquor apps still load', async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const [path, name] of [['/', /Fragrance|Prices/i], ['/alcohol/', /Liquor/]]) {
      await page.goto(srv.base + path);
      await page.waitForSelector('h1');
      assert.match(await page.locator('h1').first().innerText(), name, path);
    }
  } finally {
    await browser.close();
    srv.stop();
  }
});

test("the fragrance app's offline worker leaves /travel/ to its own worker", async () => {
  const { readFileSync } = await import('node:fs');
  const sw = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /url\.pathname\.includes\('\/travel\/'\)/);
  assert.match(sw, /const CACHE = 'fpt-v23';/);
});
