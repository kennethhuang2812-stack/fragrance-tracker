import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runCheck } from '../tools/check.js';
import { emptyData } from '../lib/merge.js';
import { parseLabel } from '../lib/flights.js';
import { L1 } from './fixtures/labels.js';

const routes = JSON.parse(readFileSync(new URL('../routes.json', import.meta.url)));
const TODAY = '2026-11-27';
const base = parseLabel(L1, '2026-12-10');

function recorder(statusFor = () => 'ok') {
  const calls = [];
  const searchFn = async (fromQ, toQ, date, backDate) => {
    calls.push({ fromQ, toQ, date, backDate });
    const status = statusFor(calls.length);
    return status === 'ok'
      ? { status, flights: [{ ...base, depDate: date, roundTrip: !!backDate }] }
      : { status, flights: [] };
  };
  return { calls, searchFn };
}
const common = { routes, today: TODAY, salesFn: async () => [], sleepFn: async () => {}, robotsFn: async () => ({ ok: true }) };

test('budget is respected', async () => {
  const { calls, searchFn } = recorder();
  const { data } = await runCheck({ ...common, data: emptyData(), budget: 10, searchFn });
  assert.equal(data.meta.searches, 10);
  assert.equal(calls.length, 10);
  assert.ok(calls.every(c => ['MEL', 'AKL'].includes(c.fromQ) && ['MEL', 'AKL'].includes(c.toQ)));
  assert.equal(data.meta.stoppedBy, 'budget');
});

test('bot stops the run', async () => {
  const { searchFn } = recorder(n => (n === 3 ? 'bot' : 'ok'));
  const { data } = await runCheck({ ...common, data: emptyData(), searchFn });
  assert.equal(data.meta.stoppedBy, 'bot');
  assert.equal(data.meta.searches, 3);
});

test('six blanks stop the run', async () => {
  const { searchFn } = recorder(() => 'blank');
  const { data } = await runCheck({ ...common, data: emptyData(), searchFn });
  assert.equal(data.meta.searches, 6);
  assert.equal(data.meta.blanks, 6);
  assert.equal(data.meta.stoppedBy, 'blanks');
});

test('robots.txt refusal stops before any search', async () => {
  const { calls, searchFn } = recorder();
  const { data } = await runCheck({ ...common, data: emptyData(), searchFn, robotsFn: async () => ({ ok: false, why: 'x' }) });
  assert.equal(calls.length, 0);
  assert.equal(data.meta.stoppedBy, 'robots');
});

test('round trips follow the main block', async () => {
  const { calls, searchFn } = recorder();
  const { data } = await runCheck({ ...common, data: emptyData(), budget: 120, searchFn });
  assert.ok(calls.slice(0, 84).every(c => !c.backDate));
  assert.ok(calls.slice(84, 87).every(c => c.backDate), JSON.stringify(calls.slice(84, 87)));
  assert.ok(!calls[87].backDate);
  assert.equal(data.roundTrips['MEL-AKL'].length, 3);
});

test('summary', async () => {
  const { searchFn } = recorder();
  const { data, summary } = await runCheck({ ...common, data: emptyData(), budget: 20, searchFn });
  assert.ok(summary.at(-1).startsWith('Checked'), summary.at(-1));
  assert.equal(summary.at(-1), data.meta.note);
  assert.equal(summary[0], 'No big changes on Melbourne ⇄ Auckland today.');
  assert.match(data.meta.lastRun, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  assert.equal(data.meta.coverage.mainDaysFresh, 20);
});
