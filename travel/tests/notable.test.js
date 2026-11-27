import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { notable } from '../lib/notable.js';
import { emptyData } from '../lib/merge.js';

const routes = JSON.parse(readFileSync(new URL('../routes.json', import.meta.url)));
const day = (price, airlines) => ({ checked: '2026-11-27', nonstop: { price, airlines, mins: 210, stops: 0 }, onestop: null, hist: [] });

function build(mel10, akl11, sales = []) {
  const d = emptyData();
  d.days['MEL-AKL'] = { '2026-12-07': day(507, 'Air New Zealand'), '2026-12-10': day(mel10, 'Qatar Airways') };
  d.days['AKL-MEL'] = { '2026-12-11': day(akl11, 'Qatar Airways'), '2026-12-17': day(279, 'Qatar Airways') };
  d.sales.items = sales;
  return d;
}

test('notable lines, in order', () => {
  const before = build(517, 300);
  const after = build(470, 280, [{ airline: 'Air New Zealand', dir: 'MEL-AKL', price: 305, ends: '2026-12-01' }]);
  assert.deepEqual(notable(before, after, routes, '2026-11-27'), [
    'Sale: Air New Zealand MEL → AKL from $305, ends Tue 1 Dec.',
    'Best MEL ⇄ AKL pair now $749: out Thu 10 Dec, back Thu 17 Dec (was $786).',
    'New low for MEL → AKL: $470 on Thu 10 Dec (Qatar Airways).',
    'MEL → AKL Thu 10 Dec now $470 on Qatar Airways (was $517).',
  ]);
});

test('nothing changed means no lines', () => {
  assert.deepEqual(notable(build(517, 300), build(517, 300), routes, '2026-11-27'), []);
});

test('a sale already seen, or on a route Ken does not fly, is not repeated', () => {
  const s = { airline: 'Air New Zealand', dir: 'MEL-AKL', price: 305, ends: '2026-12-01' };
  const other = { airline: 'Air New Zealand', dir: 'MEL-RAR', price: 414, ends: '2026-12-01' };
  assert.deepEqual(notable(build(517, 300, [s]), build(517, 300, [s, other]), routes, '2026-11-27'), []);
});

test('a first run with no earlier data reports no drops', () => {
  assert.deepEqual(notable(emptyData(), build(470, 280), routes, '2026-11-27'), []);
});
