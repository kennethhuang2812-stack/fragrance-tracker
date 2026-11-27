// Out-and-back pairs for a route, cheapest first. Shared by the app and the daily check.
import { shown } from './flights.js';

const epochDay = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5;
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-12-10' → 'Thu 10 Dec' */
export function fmtDate(d) {
  const x = new Date(epochDay(d) * 864e5);
  return `${WD[x.getUTCDay()]} ${x.getUTCDate()} ${MO[x.getUTCMonth()]}`;
}

/** Cheapest out-and-back pairs. A recorded round-trip total is used when it beats the two one-ways
 * and is at least as fresh as both one-way prices. `after` leaves out departures on or before a date. */
export function bestPairs(outDays, backDays, { minNights = 3, maxNights = 30, limit = 10, roundTrips = [], after = '' } = {}) {
  const rt = new Map(roundTrips.map(r => [`${r.out}|${r.back}`, r]));
  const backs = Object.entries(backDays || {}).map(([d, day]) => [d, day, shown(day)]).filter(([d, , f]) => f && d > after);
  const pairs = [];
  for (const [out, day] of Object.entries(outDays || {})) {
    const outFlight = shown(day);
    if (!outFlight || out <= after) continue;
    for (const [back, backDay, backFlight] of backs) {
      const nights = epochDay(back) - epochDay(out);
      if (nights < minNights || nights > maxNights) continue;
      const sum = outFlight.price + backFlight.price;
      const r = rt.get(`${out}|${back}`);
      const fresh = !!r && !!r.checked && r.checked >= day.checked && r.checked >= backDay.checked;
      const roundTrip = fresh && r.price < sum;
      pairs.push({ out, back, nights, price: roundTrip ? r.price : sum, outFlight, backFlight, roundTrip, rt: roundTrip ? r : null });
    }
  }
  pairs.sort((a, b) => a.price - b.price || a.nights - b.nights || a.out.localeCompare(b.out));
  return pairs.slice(0, limit);
}
