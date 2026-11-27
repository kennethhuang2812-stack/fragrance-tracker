import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLabel } from '../lib/flights.js';
import { emptyData, applyDay, applyRoundTrip, prune } from '../lib/merge.js';
import { L1, L2, L4 } from './fixtures/labels.js';

const BUDGET = JSON.parse(readFileSync(new URL('../routes.json', import.meta.url))).budgetAirlines;
const D = '2026-12-10';
const flights = () => [parseLabel(L1, D), parseLabel(L2, D)];

test('applies a day', () => {
  const data = emptyData();
  applyDay(data, 'MEL-AKL', D, flights(), '2026-11-27', BUDGET);
  const day = data.days['MEL-AKL'][D];
  assert.equal(day.nonstop.price, 414);
  assert.equal(day.nonstop.roundTrip, undefined);
  assert.equal(day.onestop, null);
  assert.equal(day.checked, '2026-11-27');
  assert.deepEqual(day.hist, [{ d: '2026-11-27', a: 414 }]);
});

test('blank keeps previous day', () => {
  const data = emptyData();
  applyDay(data, 'MEL-AKL', D, flights(), '2026-11-27', BUDGET);
  const before = structuredClone(data.days['MEL-AKL'][D]);
  applyDay(data, 'MEL-AKL', D, null, '2026-11-28', BUDGET);
  applyDay(data, 'MEL-AKL', D, [], '2026-11-28', BUDGET);
  assert.deepEqual(data.days['MEL-AKL'][D], before);
  applyDay(data, 'MEL-AKL', '2026-12-11', null, '2026-11-28', BUDGET);
  assert.equal(data.days['MEL-AKL']['2026-12-11'], undefined);
});

test('second query keeps the cheaper', () => {
  const data = emptyData();
  applyDay(data, 'MEL-AKL', D, flights(), '2026-11-27', BUDGET);
  const qantas = { ...parseLabel(L1, D), airlines: 'Qantas', price: 380 };
  applyDay(data, 'MEL-AKL', D, [qantas], '2026-11-27', BUDGET);
  let day = data.days['MEL-AKL'][D];
  assert.equal(day.nonstop.price, 380);
  assert.deepEqual(day.hist, [{ d: '2026-11-27', a: 380 }]);
  applyDay(data, 'MEL-AKL', D, [{ ...qantas, price: 500 }], '2026-11-27', BUDGET);
  day = data.days['MEL-AKL'][D];
  assert.equal(day.nonstop.price, 380);
  assert.equal(day.hist.length, 1);
});

test('a new day replaces yesterday\'s options and adds to history', () => {
  const data = emptyData();
  applyDay(data, 'MEL-AKL', D, flights(), '2026-11-27', BUDGET);
  applyDay(data, 'MEL-AKL', D, [{ ...parseLabel(L1, D), price: 450 }], '2026-11-28', BUDGET);
  const day = data.days['MEL-AKL'][D];
  assert.equal(day.nonstop.price, 450);
  assert.deepEqual(day.hist, [{ d: '2026-11-27', a: 414 }, { d: '2026-11-28', a: 450 }]);
});

test('round trip upsert', () => {
  const data = emptyData();
  applyRoundTrip(data, 'MEL-AKL', D, '2026-12-17', [parseLabel(L4, D)], '2026-11-27', BUDGET);
  applyRoundTrip(data, 'MEL-AKL', D, '2026-12-17', [{ ...parseLabel(L4, D), price: 650 }], '2026-11-28', BUDGET);
  applyRoundTrip(data, 'MEL-AKL', D, '2026-12-18', null, '2026-11-28', BUDGET);
  assert.equal(data.roundTrips['MEL-AKL'].length, 1);
  assert.deepEqual(data.roundTrips['MEL-AKL'][0],
    { out: D, back: '2026-12-17', price: 650, airlines: 'Qatar Airways', checked: '2026-11-28' });
});

test('prune drops past days and caps history', () => {
  const data = emptyData();
  applyDay(data, 'MEL-AKL', '2026-11-27', flights().map(f => ({ ...f, depDate: '2026-11-27' })), '2026-11-20', BUDGET);
  applyDay(data, 'MEL-AKL', '2026-11-28', flights().map(f => ({ ...f, depDate: '2026-11-28' })), '2026-11-20', BUDGET);
  data.days['MEL-AKL']['2026-11-28'].hist = Array.from({ length: 70 }, (_, i) => ({ d: `x${String(i).padStart(2, '0')}`, a: i }));
  data.roundTrips['MEL-AKL'] = [{ out: '2026-11-27', back: '2026-12-01', price: 1 }, { out: '2026-11-28', back: '2026-12-01', price: 2 }];
  prune(data, '2026-11-27');
  assert.deepEqual(Object.keys(data.days['MEL-AKL']), ['2026-11-28']);
  const h = data.days['MEL-AKL']['2026-11-28'].hist;
  assert.equal(h.length, 60);
  assert.equal(h[0].a, 10);
  assert.deepEqual(data.roundTrips['MEL-AKL'].map(r => r.out), ['2026-11-28']);
});
