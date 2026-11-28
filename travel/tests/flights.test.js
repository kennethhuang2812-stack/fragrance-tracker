import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLabel, isBudget, bestOptions, shown, labelsMatchDate } from '../lib/flights.js';
import { L1, L2, L3, L4 } from './fixtures/labels.js';

const routes = JSON.parse(readFileSync(new URL('../routes.json', import.meta.url)));
const BUDGET = routes.budgetAirlines;

test('routes.json has the main route and 20 other pairs', () => {
  assert.deepEqual(routes.main, ['MEL', 'AKL']);
  assert.equal(routes.pairs.length, 20);
  assert.equal(routes.windowDays, 56);
});

test('parses a non-stop', () => {
  assert.deepEqual(parseLabel(L1, '2026-12-10'), {
    price: 414, roundTrip: false, stops: 0, airlines: 'Qatar Airways', operated: '',
    dep: '1:20 am', depDate: '2026-12-10', arr: '6:50 am', arrDate: '2026-12-10',
    fromAirport: 'Melbourne Airport', toAirport: 'Auckland Airport', mins: 210, via: [],
  });
});

test('parses overnight arrival', () => {
  const f = parseLabel(L2, '2026-12-10');
  assert.equal(f.arrDate, '2026-12-11');
  assert.equal(f.mins, 215);
});

test('parses a stopover', () => {
  const f = parseLabel(L3, '2026-12-14');
  assert.equal(f.stops, 1);
  assert.equal(f.mins, 1185);
  assert.deepEqual(f.via, ['Singapore Changi Airport']);
});

test('parses round trip', () => {
  const f = parseLabel(L4, '2026-12-10');
  assert.equal(f.roundTrip, true);
  assert.equal(f.price, 672);
});

test('reads layover and operated-by', () => {
  const l = L3.replace('Stopover (1 of 1) is a 5 hrs 10 min stopover at Singapore Changi Airport in Singapore.',
    'Layover (1 of 1) is a 1 hr 5 min layover at Sydney Airport in Sydney.')
    .replace('Leaves', 'Operated by Qantaslink - National Jet Systems. Leaves');
  const f = parseLabel(l, '2026-12-14');
  assert.deepEqual(f.via, ['Sydney Airport']);
  assert.equal(f.operated, 'Qantaslink - National Jet Systems');
});

test('rolls the year for January arrival', () => {
  const l = L2.replace('December 10', 'December 31').replace('Friday, December 11', 'Friday, January 1');
  const f = parseLabel(l, '2026-12-31');
  assert.equal(f.depDate, '2026-12-31');
  assert.equal(f.arrDate, '2027-01-01');
});

test('ignores non-AUD labels', () => {
  assert.equal(parseLabel(L1.replace('Australian dollars', 'New Zealand dollars'), '2026-12-10'), null);
  assert.equal(parseLabel('Non-stop flight with Qatar Airways. Leaves Melbourne Airport', '2026-12-10'), null);
});

test('rejects labels for another date', () => {
  assert.equal(labelsMatchDate([parseLabel(L1, '2026-12-10')], '2026-12-11'), false);
  assert.equal(labelsMatchDate([parseLabel(L1, '2026-12-10')], '2026-12-10'), true);
});

test('filters budget airlines incl. codeshares', () => {
  const base = parseLabel(L1, '2026-12-10');
  assert.equal(isBudget(parseLabel(L2, '2026-12-10'), BUDGET), true);
  assert.equal(isBudget(parseLabel(L3, '2026-12-14'), BUDGET), true);
  assert.equal(isBudget({ ...base, airlines: 'Qantas and Jetstar' }, BUDGET), true);
  assert.equal(isBudget({ ...base, airlines: 'Qantas', operated: 'Jetstar Airways' }, BUDGET), true);
  assert.equal(isBudget({ ...base, airlines: 'Qantas', operated: 'Qantaslink - National Jet Systems' }, BUDGET), false);
  assert.equal(isBudget({ ...base, airlines: 'Virgin Australia' }, BUDGET), false);
  assert.equal(isBudget({ ...base, airlines: 'T’way Air' }, BUDGET), true);
});

test('bestOptions drops budget and 2+ stops', () => {
  const two = { ...parseLabel(L1, '2026-12-10'), stops: 2, price: 100 };
  const r = bestOptions([parseLabel(L1, '2026-12-10'), parseLabel(L2, '2026-12-10'), parseLabel(L3, '2026-12-14'), two], BUDGET);
  assert.equal(r.nonstop.price, 414);
  assert.equal(r.onestop, null);
});

test('shown rule', () => {
  const ns = { price: 517, mins: 215 };
  assert.equal(shown({ nonstop: ns, onestop: { price: 430, mins: 300 } }).price, 430);
  assert.equal(shown({ nonstop: ns, onestop: { price: 450, mins: 300 } }).price, 517);
  assert.equal(shown({ nonstop: ns, onestop: { price: 430, mins: 400 } }).price, 517);
  const x = { price: 900, mins: 600 };
  assert.equal(shown({ nonstop: null, onestop: x }), x);
  assert.equal(shown({ nonstop: null, onestop: null }), null);
});

test('budget list covers Japan and China budget airlines', () => {
  const base = parseLabel(L1, '2026-12-10');
  for (const name of ['Spring Japan', 'Lucky Air', '9 Air', 'West Air', 'China United Airlines'])
    assert.equal(isBudget({ ...base, airlines: name }, BUDGET), true, name);
  assert.equal(isBudget({ ...base, airlines: 'Air China' }, BUDGET), false);
});
