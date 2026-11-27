// Folding search results into travel/data.json.
import { bestOptions, shown } from './flights.js';

const HIST_MAX = 60;

export function emptyData() {
  return {
    meta: { lastRun: null, note: '', searches: 0, blanks: 0, stoppedBy: null, coverage: {} },
    days: {},
    roundTrips: {},
    sales: { checked: null, items: [] },
  };
}

const strip = f => {
  if (!f) return null;
  const { roundTrip, ...rest } = f;
  return rest;
};
const cheaper = (a, b) => (!a ? b : !b ? a : b.price < a.price ? b : a);

/** Record one search's flights for a direction and departure date. A blank (null or []) changes nothing. */
export function applyDay(data, dir, date, flights, today, budgetAirlines) {
  if (!flights || !flights.length) return;
  const days = (data.days[dir] ||= {});
  const old = days[date];
  const best = bestOptions(flights, budgetAirlines);
  let nonstop = strip(best.nonstop), onestop = strip(best.onestop);
  if (old && old.checked === today) {
    nonstop = cheaper(old.nonstop, nonstop);
    onestop = cheaper(old.onestop, onestop);
  }
  const day = { checked: today, nonstop, onestop, hist: (old && old.hist) ? [...old.hist] : [] };
  const s = shown(day);
  day.hist = day.hist.filter(h => h.d !== today);
  if (s) day.hist.push({ d: today, a: s.price });
  day.hist = day.hist.slice(-HIST_MAX);
  days[date] = day;
}

/** Record a round-trip total for an out-and-back pair. A blank, a page of one-way fares, or a fare
 * whose airline also runs a budget airline (its return flight could be a budget one) changes nothing. */
export function applyRoundTrip(data, dir, out, back, flights, today, budgetAirlines, unsafe = []) {
  const rts = (flights || []).filter(f => f && f.roundTrip);
  if (!rts.length) return;
  const f = shown(bestOptions(rts, budgetAirlines));
  if (!f) return;
  if (f.airlines.split(/ and |, /).some(n => unsafe.includes(n.trim()))) return;
  const list = (data.roundTrips[dir] ||= []);
  const entry = { out, back, price: f.price, airlines: f.airlines, checked: today };
  const i = list.findIndex(r => r.out === out && r.back === back);
  if (i >= 0) list[i] = entry; else list.push(entry);
}

/** Drop departures on or before today, and keep history short. */
export function prune(data, today) {
  for (const dir of Object.keys(data.days)) {
    for (const date of Object.keys(data.days[dir])) {
      if (date <= today) delete data.days[dir][date];
      else data.days[dir][date].hist = (data.days[dir][date].hist || []).slice(-HIST_MAX);
    }
  }
  for (const dir of Object.keys(data.roundTrips)) {
    data.roundTrips[dir] = data.roundTrips[dir].filter(r => r.out > today);
  }
}
