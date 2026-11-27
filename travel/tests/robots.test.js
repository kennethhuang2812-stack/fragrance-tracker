import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { robotsDecision } from '../tools/google.js';
import { googleUrl } from '../lib/links.js';

// google.com/robots.txt as saved on 2026-11-27.
const txt = readFileSync(new URL('./fixtures/google-robots.txt', import.meta.url), 'utf8');

test('Google allows the ?q= flight pages the checker reads', () => {
  assert.deepEqual(robotsDecision(txt, googleUrl('MEL', 'AKL', '2026-12-10')), { ok: true });
});

test('Google disallows the filtered search pages, which the checker never loads', () => {
  assert.equal(robotsDecision(txt, 'https://www.google.com/travel/flights/search?tfs=abc').ok, false);
  assert.equal(robotsDecision(txt, 'https://www.google.com/search?q=flights').ok, false);
});

test('a site that disallows everything blocks the page', () => {
  assert.equal(robotsDecision('User-agent: *\nDisallow: /', googleUrl('MEL', 'AKL', '2026-12-10')).ok, false);
});
