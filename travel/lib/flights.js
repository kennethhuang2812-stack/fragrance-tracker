// Reading Google Flights result labels, and choosing which flights to show.
// Shared by the daily check (Node) and the app (browser), so no Node-only imports.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

const pad = n => String(n).padStart(2, '0');

// Google gives "Thursday, December 10" with no year: take the year from a nearby known date,
// moving to the next year when the month wraps past December.
function dateNear(monthName, day, near) {
  const m = MONTHS.indexOf(monthName) + 1;
  if (!m) return null;
  let y = +near.slice(0, 4);
  const nm = +near.slice(5, 7);
  if (m < nm - 6) y += 1;
  else if (m > nm + 6) y -= 1;
  return `${y}-${pad(m)}-${pad(+day)}`;
}

/** Parse one result label into a flight, or null if it isn't a priced AUD result. */
export function parseLabel(label, searchDate) {
  const t = String(label || '').replace(/[  ]/g, ' ');
  const pm = t.match(/^From ([\d,]+) Australian dollars( round trip total)?\./);
  if (!pm) return null;
  let stops;
  if (/Non-stop flight/.test(t)) stops = 0;
  else {
    const sm = t.match(/(\d+) stops? flight/);
    if (!sm) return null;
    stops = +sm[1];
  }
  const lm = t.match(/Leaves (.+?) at (\d{1,2}:\d{2} [ap]m) on \w+, (\w+) (\d{1,2}) and arrives at (.+?) at (\d{1,2}:\d{2} [ap]m) on \w+, (\w+) (\d{1,2})\./);
  if (!lm) return null;
  const depDate = dateNear(lm[3], lm[4], searchDate);
  const arrDate = depDate && dateNear(lm[7], lm[8], depDate);
  if (!depDate || !arrDate) return null;
  const dm = t.match(/Total duration (?:(\d+) hrs?)?\s*(?:(\d+) min)?\./);
  const mins = dm ? (+(dm[1] || 0)) * 60 + (+(dm[2] || 0)) : null;
  return {
    price: +pm[1].replace(/,/g, ''),
    roundTrip: !!pm[2],
    stops,
    airlines: (t.match(/flight with ([^.]+)\./) || [])[1] || '',
    operated: (t.match(/Operated by ([^.]+)\./) || [])[1] || '',
    dep: lm[2], depDate,
    arr: lm[6], arrDate,
    fromAirport: lm[1], toAirport: lm[5],
    mins,
    via: [...t.matchAll(/(?:[Ss]topover|[Ll]ayover) at (.+?) in [^.]+\./g)].map(m => m[1]),
  };
}

const norm = s => String(s || '').toLowerCase().replace(/[‘’`]/g, "'");

/** True if a budget airline flies (or sells) any part of the trip. */
export function isBudget(f, budgetAirlines) {
  const text = norm(f.airlines + ' ' + f.operated);
  return budgetAirlines.some(b => text.includes(norm(b)));
}

/** Cheapest non-stop and cheapest one-stop option, leaving out budget airlines and 2+ stops. */
export function bestOptions(flights, budgetAirlines) {
  let nonstop = null, onestop = null;
  for (const f of flights) {
    if (!f || f.stops > 1 || isBudget(f, budgetAirlines)) continue;
    if (f.stops === 0 && (!nonstop || f.price < nonstop.price)) nonstop = f;
    if (f.stops === 1 && (!onestop || f.price < onestop.price)) onestop = f;
  }
  return { nonstop, onestop };
}

/** The option the app shows for a day: the one-stop only if it is clearly cheaper and not much longer. */
export function shown(day) {
  const { nonstop, onestop } = day || {};
  if (!nonstop) return onestop || null;
  if (onestop && onestop.price <= 0.85 * nonstop.price && onestop.mins <= 1.5 * nonstop.mins) return onestop;
  return nonstop;
}

/** True if every flight on the page leaves on the date searched (guards against a stale page). */
export function labelsMatchDate(flights, date) {
  return flights.length > 0 && flights.every(f => f && f.depDate === date);
}
