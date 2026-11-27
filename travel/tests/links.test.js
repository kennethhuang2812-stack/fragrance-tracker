import test from 'node:test';
import assert from 'node:assert/strict';
import { googleUrl, skyscannerUrl, airlineUrl } from '../lib/links.js';

const query = url => new URL(url).searchParams.get('q');

test('googleUrl one way', () => {
  const u = googleUrl('MEL', 'AKL', '2026-12-10');
  assert.ok(u.startsWith('https://www.google.com/travel/flights?q='));
  assert.equal(query(u), 'Flights to AKL from MEL on 2026-12-10 one way');
  const p = new URL(u).searchParams;
  assert.deepEqual([p.get('curr'), p.get('hl'), p.get('gl')], ['AUD', 'en-AU', 'AU']);
});

test('googleUrl round trip', () => {
  assert.equal(query(googleUrl('MEL', 'AKL', '2026-12-10', '2026-12-17')), 'Flights to AKL from MEL on 2026-12-10 through 2026-12-17');
});

test('skyscannerUrl', () => {
  assert.equal(skyscannerUrl('MEL', 'AKL', '2026-12-10'), 'https://www.skyscanner.com.au/transport/flights/mel/akl/261210/');
  assert.equal(skyscannerUrl('AKL', 'Tokyo', '2027-01-05'), 'https://www.skyscanner.com.au/transport/flights/akl/tyoa/270105/');
});

test('airlineUrl', () => {
  assert.ok(airlineUrl('Qatar Airways').startsWith('https://'));
  assert.equal(airlineUrl('Qantas and JAL'), airlineUrl('Qantas'));
  assert.equal(airlineUrl('Some Unknown Air'), null);
});
