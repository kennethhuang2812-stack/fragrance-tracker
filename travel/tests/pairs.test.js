import test from 'node:test';
import assert from 'node:assert/strict';
import { bestPairs, fmtDate } from '../lib/pairs.js';

const day = (price, airlines = 'Qatar Airways') => ({ checked: '2026-11-27', nonstop: { price, airlines, mins: 210, stops: 0 }, onestop: null, hist: [] });
const out = { '2026-12-10': day(414) };
const back = { '2026-12-11': day(279), '2026-12-17': day(279), '2027-01-25': day(250) };

test('pairs respect nights and use round trips', () => {
  const r = bestPairs(out, back, { roundTrips: [{ out: '2026-12-10', back: '2026-12-17', price: 672 }] });
  assert.deepEqual(
    { out: r[0].out, back: r[0].back, nights: r[0].nights, price: r[0].price, roundTrip: r[0].roundTrip },
    { out: '2026-12-10', back: '2026-12-17', nights: 7, price: 672, roundTrip: true });
  assert.equal(r[0].outFlight.price, 414);
  assert.equal(r[0].backFlight.price, 279);
  assert.ok(r.every(p => p.nights !== 1 && p.nights !== 46));
});

test('pairs fall back to the one-way sum', () => {
  const r = bestPairs(out, back, {});
  assert.equal(r[0].price, 693);
  assert.equal(r[0].roundTrip, false);
});

test('pairs ignore a dearer round trip and honour the nights filter', () => {
  const r = bestPairs(out, back, { roundTrips: [{ out: '2026-12-10', back: '2026-12-17', price: 800 }], minNights: 1, maxNights: 60 });
  assert.deepEqual(r.map(p => p.price), [664, 693, 693]);
  assert.equal(r[1].roundTrip, false);
  assert.deepEqual(bestPairs(out, back, { limit: 1 }).length, 1);
});

test('fmtDate', () => {
  assert.equal(fmtDate('2026-12-10'), 'Thu 10 Dec');
  assert.equal(fmtDate('2027-01-01'), 'Fri 1 Jan');
});
