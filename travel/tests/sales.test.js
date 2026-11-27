import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAirNZAU, parseAirNZNZ, parseEndDate } from '../tools/sales.js';

const routes = JSON.parse(readFileSync(new URL('../routes.json', import.meta.url)));
// Air NZ sale pages as saved on 2026-11-27 (scripts and styles stripped).
const au = readFileSync(new URL('./fixtures/airnz-au.html', import.meta.url), 'utf8');
const nz = readFileSync(new URL('./fixtures/airnz-nz.html', import.meta.url), 'utf8');

test('Air NZ AU: Melbourne to Auckland deal', () => {
  const items = parseAirNZAU(au, routes);
  const mel = items.find(s => s.dir === 'MEL-AKL');
  assert.ok(mel);
  assert.deepEqual({ airline: mel.airline, price: mel.price, fare: mel.fare, ends: mel.ends },
    { airline: 'Air New Zealand', price: 305, fare: 'seat', ends: '2026-12-01' });
  assert.ok(mel.travel.startsWith('Economy: 11 Jan - 22 Jan'), mel.travel);
  assert.ok(mel.url.startsWith('https://'));
});

test('Air NZ AU: Sydney to Auckland deal, and only Ken\'s routes', () => {
  const items = parseAirNZAU(au, routes);
  assert.ok(items.some(s => s.dir === 'SYD-AKL' && s.price === 295));
  const dirs = new Set([...routes.pairs.flatMap(p => [`${p.a}-${p.b}`, `${p.b}-${p.a}`]), 'MEL-AKL', 'AKL-MEL']);
  assert.ok(items.every(s => dirs.has(s.dir)), items.map(s => s.dir).join(','));
  assert.ok(!items.some(s => /RAR/.test(s.dir)));
});

test('Air NZ NZ: sale headline', () => {
  const h = parseAirNZNZ(nz);
  assert.ok(h.title.includes('Asia'), h.title);
  assert.equal(h.ends, '2026-12-03');
  assert.equal(h.dir, null);
  assert.equal(h.airline, 'Air New Zealand');
});

test('end dates', () => {
  assert.equal(parseEndDate('Sale ends 11.59pm AEDT, 1 Dec 2026'), '2026-12-01');
  assert.equal(parseEndDate('Sale ends midnight 3 December 2026'), '2026-12-03');
  assert.equal(parseEndDate('no date here'), null);
});

test('fetchSales keeps current sales and respects robots.txt', async () => {
  const { fetchSales } = await import('../tools/sales.js');
  const pages = {
    'https://www.airnewzealand.com.au/robots.txt': 'user-agent: *\nallow: /',
    'https://www.airnewzealand.com.au/best-fares': au,
    'https://www.airnewzealand.com/robots.txt': 'User-agent: *\nDisallow: /en-nz/book/',
    'https://www.airnewzealand.com/en-nz/book/flight-deals-best-fares': nz,
  };
  const fake = async url => ({ ok: url in pages, text: async () => pages[url] });
  const onFirst = await fetchSales(routes, '2026-11-27', fake);
  assert.ok(onFirst.some(s => s.dir === 'MEL-AKL'));
  assert.ok(!onFirst.some(s => s.dir === null), 'NZ page is disallowed by its robots.txt here');
  const later = await fetchSales(routes, '2026-12-02', fake);
  assert.ok(!later.some(s => s.dir === 'MEL-AKL'), 'the AU sale ended on 1 Dec');
});
