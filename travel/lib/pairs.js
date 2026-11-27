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

/** Cheapest out-and-back pairs. A recorded round-trip total is used when it beats the two one-ways. */
export function bestPairs(outDays, backDays, { minNights = 3, maxNights = 30, limit = 10, roundTrips = [] } = {}) {
  const rt = new Map(roundTrips.map(r => [`${r.out}|${r.back}`, r]));
  const backs = Object.entries(backDays || {}).map(([d, day]) => [d, shown(day)]).filter(([, f]) => f);
  const pairs = [];
  for (const [out, day] of Object.entries(outDays || {})) {
    const outFlight = shown(day);
    if (!outFlight) continue;
    for (const [back, backFlight] of backs) {
      const nights = epochDay(back) - epochDay(out);
      if (nights < minNights || nights > maxNights) continue;
      const sum = outFlight.price + backFlight.price;
      const r = rt.get(`${out}|${back}`);
      const roundTrip = !!r && r.price < sum;
      pairs.push({ out, back, nights, price: roundTrip ? r.price : sum, outFlight, backFlight, roundTrip });
    }
  }
  pairs.sort((a, b) => a.price - b.price || a.nights - b.nights || a.out.localeCompare(b.out));
  return pairs.slice(0, limit);
}
