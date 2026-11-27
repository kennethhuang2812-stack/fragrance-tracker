import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { windowDates, planSearches, epochDay } from '../lib/plan.js';

const routes = JSON.parse(readFileSync(new URL('../routes.json', import.meta.url)));
const TODAY = '2026-11-27';
const daysBetween = (a, b) => epochDay(b) - epochDay(a);

test('windowDates', () => {
  const w = windowDates(TODAY, 56);
  assert.equal(w.length, 56);
  assert.equal(w[0], '2026-11-28');
  assert.equal(w[55], '2027-01-22');
});

test('main block first', () => {
  const p = planSearches(routes, { days: {} }, TODAY);
  assert.ok(p.slice(0, 56).every(s => s.block === 'main'));
  assert.notEqual(p[56].block, 'main');
  assert.deepEqual({ dir: p[0].dir, date: p[0].date, fromQ: p[0].fromQ, toQ: p[0].toQ },
    { dir: 'MEL-AKL', date: '2026-11-28', fromQ: 'MEL', toQ: 'AKL' });
  assert.deepEqual({ dir: p[1].dir, date: p[1].date }, { dir: 'AKL-MEL', date: '2026-11-28' });
  assert.equal(p[55].date, '2026-12-25');
});

test('main2 is every other day', () => {
  const p = planSearches(routes, { days: {} }, TODAY);
  const m2 = p.filter(s => s.block === 'main2');
  assert.equal(m2.length, 28);
  assert.ok(p.slice(56, 84).every(s => s.block === 'main2'));
  const dates = m2.filter(s => s.dir === 'MEL-AKL').map(s => s.date);
  for (let i = 1; i < dates.length; i++) assert.equal(daysBetween(dates[i - 1], dates[i]), 2);
});

test('main3 covers the rest', () => {
  const p = planSearches(routes, { days: {} }, TODAY);
  const w = windowDates(TODAY, 56).slice(28);
  for (const dir of ['MEL-AKL', 'AKL-MEL']) {
    const got = p.filter(s => (s.block === 'main2' || s.block === 'main3') && s.dir === dir).map(s => s.date);
    assert.equal(got.length, 28);
    assert.deepEqual([...got].sort(), w);
  }
});

test('sample dates are fixed weekdays', () => {
  const p = planSearches(routes, { days: {} }, TODAY);
  const sample = p.filter(s => s.block === 'sample');
  assert.ok(sample.every(s => epochDay(s.date) % 7 === 0));
  const byDir = {};
  for (const s of sample) (byDir[s.dir] ||= []).push(s);
  assert.equal(Object.keys(byDir).length, 40);
  for (const [dir, list] of Object.entries(byDir)) {
    assert.equal(new Set(list.map(s => s.date)).size, 8, dir);
    const wsi = ['SYD-AKL', 'AKL-SYD', 'MEL-SYD', 'SYD-MEL'].includes(dir);
    assert.equal(list.length, wsi ? 16 : 8, dir);
  }
  assert.ok(byDir['MEL-SYD'].some(s => s.toQ === 'WSI'));
  assert.ok(byDir['SYD-AKL'].some(s => s.fromQ === 'WSI'));
});

test('stale samples first', () => {
  const sampleDates = windowDates(TODAY, 56).filter(d => epochDay(d) % 7 === 0);
  const d0 = sampleDates[0];
  const days = { 'AKL-TYO': {}, 'TYO-AKL': {} };
  for (const d of sampleDates) { days['AKL-TYO'][d] = { checked: TODAY }; days['TYO-AKL'][d] = { checked: TODAY }; }
  days['AKL-TYO'][d0] = { checked: '2026-11-20' };
  days['TYO-AKL'][d0] = { checked: '2026-11-26' };
  const sample = planSearches(routes, { days }, TODAY).filter(s => s.block === 'sample');
  const a = sample.findIndex(s => s.dir === 'AKL-TYO' && s.date === d0);
  const b = sample.findIndex(s => s.dir === 'TYO-AKL' && s.date === d0);
  assert.ok(a >= 0 && b >= 0 && a < b);
  const never = sample.findIndex(s => s.dir === 'MEL-TYO');
  assert.ok(never < a, 'never-checked directions come before checked ones');
});

test('focus2 after main2', () => {
  const p = planSearches({ ...routes, focus2: ['AKL', 'TYO'] }, { days: {} }, TODAY);
  const i = p.findIndex(s => s.block === 'focus2');
  assert.equal(i, 84);
  assert.ok(!p.some(s => s.block === 'sample' && (s.dir === 'AKL-TYO' || s.dir === 'TYO-AKL')));
});

test('main2 alternates: a far date is checked one day and not the next', () => {
  const far = windowDates(TODAY, 56)[40];
  const inMain2 = t => planSearches(routes, { days: {} }, t).some(s => s.block === 'main2' && s.date === far && s.dir === 'MEL-AKL');
  assert.notEqual(inMain2('2026-11-27'), inMain2('2026-11-28'));
  assert.notEqual(inMain2('2026-11-28'), inMain2('2026-11-29'));
});
