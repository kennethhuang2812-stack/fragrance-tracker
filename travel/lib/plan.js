// Which Google Flights searches to run today, most important first. The daily check works down
// this list until it runs out of searches or time, or hits a bot check.

export const epochDay = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5;
const fromEpoch = n => new Date(n * 864e5).toISOString().slice(0, 10);

/** The n departure dates from tomorrow. */
export function windowDates(today, n) {
  const t = epochDay(today);
  return Array.from({ length: n }, (_, i) => fromEpoch(t + 1 + i));
}

const pairKey = (a, b) => [a, b].sort().join('|');

function queries(routes, from, to) {
  const pair = routes.pairs.find(p => pairKey(p.a, p.b) === pairKey(from, to));
  const extra = (pair && pair.extra) || {};
  return {
    fromQs: [routes.places[from].q, ...(extra[from] || [])],
    toQs: [routes.places[to].q, ...(extra[to] || [])],
  };
}

function searchesFor(routes, block, from, to, date) {
  const { fromQs, toQs } = queries(routes, from, to);
  const out = [];
  for (const fromQ of fromQs) for (const toQ of toQs)
    out.push({ block, dir: `${from}-${to}`, from, to, fromQ, toQ, date });
  return out;
}

// A route pair's daily blocks: both directions for each date, nearest date first.
function pairBlock(routes, block, [a, b], dates) {
  return dates.flatMap(d => [...searchesFor(routes, block, a, b, d), ...searchesFor(routes, block, b, a, d)]);
}

// Direction-dates ordered never-checked first, then oldest checked, then nearest date.
function byStaleness(routes, block, items, data) {
  const checked = ({ dir, date }) => (data.days?.[dir]?.[date]?.checked) || '';
  return items
    .map((it, i) => ({ ...it, c: checked(it), i }))
    .sort((x, y) => (x.c === y.c ? 0 : x.c < y.c ? -1 : 1) || x.date.localeCompare(y.date) || x.i - y.i)
    .flatMap(({ from, to, date }) => searchesFor(routes, block, from, to, date));
}

/** The ordered list of searches for today: {block, dir, from, to, fromQ, toQ, date}. */
export function planSearches(routes, data, today) {
  const win = windowDates(today, routes.windowDays);
  const t = epochDay(today);
  const near = win.slice(0, 28);
  const far = win.slice(28);
  const farA = far.filter((_, j) => (28 + j + t) % 2 === 0);
  const farB = far.filter((_, j) => (28 + j + t) % 2 !== 0);
  const main = routes.main;
  const f2 = routes.focus2;

  const plan = [
    ...pairBlock(routes, 'main', main, near),
    ...pairBlock(routes, 'main2', main, farA),
  ];
  if (f2) plan.push(...pairBlock(routes, 'focus2', f2, near), ...pairBlock(routes, 'focus2', f2, farA));

  const isFocus = p => f2 && pairKey(p.a, p.b) === pairKey(f2[0], f2[1]);
  const others = routes.pairs.filter(p => !isFocus(p)).flatMap(p => [[p.a, p.b], [p.b, p.a]]);
  const isSample = d => epochDay(d) % 7 === 0;
  const items = dates => others.flatMap(([from, to]) => dates.map(date => ({ dir: `${from}-${to}`, from, to, date })));

  plan.push(...byStaleness(routes, 'sample', items(win.filter(isSample)), data));
  plan.push(...pairBlock(routes, 'main3', main, farB));
  const rest = items(win.filter(d => !isSample(d)));
  if (f2) rest.push(...[[f2[0], f2[1]], [f2[1], f2[0]]].flatMap(([from, to]) => farB.map(date => ({ dir: `${from}-${to}`, from, to, date }))));
  plan.push(...byStaleness(routes, 'rest', rest, data));
  return plan;
}
