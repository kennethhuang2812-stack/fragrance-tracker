import test from 'node:test';
import assert from 'node:assert/strict';
import { pageResult, search } from '../tools/google.js';
import { L1, L4 } from './fixtures/labels.js';

const D = '2026-12-10';
const OK_URL = 'https://www.google.com/travel/flights?q=x';

test('pageResult reads one-way labels for the date searched', () => {
  const r = pageResult([L1, L1], D, undefined, OK_URL);
  assert.equal(r.status, 'ok');
  assert.equal(r.flights.length, 2);
});

test('pageResult rejects round-trip labels on a one-way search, and the reverse', () => {
  assert.equal(pageResult([L4], D, undefined, OK_URL).status, 'blank');
  assert.equal(pageResult([L1], D, '2026-12-17', OK_URL).status, 'blank');
  assert.equal(pageResult([L4], D, '2026-12-17', OK_URL).status, 'ok');
});

test('pageResult rejects labels for another date', () => {
  assert.equal(pageResult([L1], '2026-12-11', undefined, OK_URL).status, 'blank');
});

test('pageResult refuses pages Google moved us to that robots.txt disallows, and spots its bot page', () => {
  assert.equal(pageResult([L1], D, undefined, 'https://www.google.com/travel/flights/search?tfs=abc').status, 'blank');
  assert.equal(pageResult([L1], D, undefined, 'https://www.google.com/travel/flights/booking?x').status, 'blank');
  assert.equal(pageResult([L1], D, undefined, 'https://www.google.com/sorry/index?continue=x').status, 'bot');
});

test('search treats a browser failure as a blank, not a crash', async () => {
  const ctx = { newPage: async () => { throw new Error('browser gone'); } };
  const r = await search(ctx, 'MEL', 'AKL', D);
  assert.equal(r.status, 'blank');
});
