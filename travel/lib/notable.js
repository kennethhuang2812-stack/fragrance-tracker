// What changed enough to lead the daily summary (and so the phone notification).
import { shown } from './flights.js';
import { bestPairs, fmtDate } from './pairs.js';

const arrow = dir => dir.replace('-', ' → ');

function windowLow(days, today) {
  let low = null;
  for (const [date, day] of Object.entries(days || {})) {
    if (date <= today) continue;
    const f = shown(day);
    if (f && (!low || f.price < low.f.price)) low = { date, f };
  }
  return low;
}

const saleKey = s => [s.airline, s.dir, s.price, s.ends, s.title].join('|');

/** Plain-English lines for notable changes between two versions of the data, at most 6. */
export function notable(before, after, routes, today) {
  const focus = [routes.main, routes.focus2].filter(Boolean);
  const focusDirs = focus.flatMap(([a, b]) => [`${a}-${b}`, `${b}-${a}`]);
  const kenDirs = new Set([...focusDirs, ...routes.pairs.flatMap(p => [`${p.a}-${p.b}`, `${p.b}-${p.a}`])]);
  const sales = [], pairs = [], lows = [], drops = [];

  const seen = new Set(((before.sales || {}).items || []).map(saleKey));
  for (const s of ((after.sales || {}).items || [])) {
    if (seen.has(saleKey(s))) continue;
    const ends = /^\d{4}-\d{2}-\d{2}$/.test(s.ends || '') ? `, ends ${fmtDate(s.ends)}` : '';
    if (s.dir && kenDirs.has(s.dir)) sales.push(`Sale: ${s.airline} ${arrow(s.dir)} from $${s.price}${ends}.`);
    else if (!s.dir && s.title) sales.push(`Sale: ${s.airline}: ${s.title}${ends}.`);
  }

  for (const [a, b] of focus) {
    const o = `${a}-${b}`, r = `${b}-${a}`;
    const p0 = bestPairs(before.days[o], before.days[r], { roundTrips: (before.roundTrips || {})[o] || [], limit: 1, after: today })[0];
    const p1 = bestPairs(after.days[o], after.days[r], { roundTrips: (after.roundTrips || {})[o] || [], limit: 1, after: today })[0];
    if (p0 && p1 && p0.price - p1.price >= 30)
      pairs.push(`Best ${a} ⇄ ${b} pair now $${p1.price}: out ${fmtDate(p1.out)}, back ${fmtDate(p1.back)} (was $${p0.price}).`);
  }

  for (const dir of focusDirs) {
    const l0 = windowLow(before.days[dir], today), l1 = windowLow(after.days[dir], today);
    if (l0 && l1 && l1.f.price < l0.f.price)
      lows.push(`New low for ${arrow(dir)}: $${l1.f.price} on ${fmtDate(l1.date)} (${l1.f.airlines}).`);
    for (const [date, day] of Object.entries(after.days[dir] || {})) {
      if (date <= today) continue;
      const f0 = shown((before.days[dir] || {})[date]), f1 = shown(day);
      if (!f0 || !f1) continue;
      const fall = f0.price - f1.price;
      if (fall >= 40 || (fall > 0 && fall >= 0.1 * f0.price))
        drops.push(`${arrow(dir)} ${fmtDate(date)} now $${f1.price} on ${f1.airlines} (was $${f0.price}).`);
    }
  }
  return [...sales, ...pairs, ...lows, ...drops].slice(0, 6);
}
