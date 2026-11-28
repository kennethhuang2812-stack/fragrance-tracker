// The daily flight price check: works down today's search plan, records what it finds in
// travel/data.json and prints a short summary for the scheduled task's notification.
// Usage: node travel/tools/check.js travel/data.json [--budget N] [--minutes M]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { planSearches } from '../lib/plan.js';
import { emptyData, applyDay, applyRoundTrip, prune } from '../lib/merge.js';
import { bestPairs } from '../lib/pairs.js';
import { notable } from '../lib/notable.js';
import { robotsAllowsFlights } from './google.js';

const MAX_BLANKS_IN_A_ROW = 6;

export function melbourneToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(now);
}

export function melbourneIso(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(p => [p.type, p.value]));
  const local = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  const off = Math.round((Date.parse(local + 'Z') - Math.floor(now.getTime() / 1000) * 1000) / 60000);
  const sign = off >= 0 ? '+' : '-', a = Math.abs(off);
  return `${local}${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

const STOPPED = {
  budget: 'stopped at the search budget',
  time: 'stopped at the time limit',
  bot: "stopped by Google's bot check",
  blanks: `stopped after ${MAX_BLANKS_IN_A_ROW} blank searches in a row`,
  robots: "Google's robots.txt no longer allows these pages, so nothing was searched",
  null: 'finished every planned search',
};

/** Run one daily check. Returns the updated data and the summary lines. */
export async function runCheck({ data, routes, today, budget = 140, minutes = 70, searchFn, salesFn, sleepFn,
  robotsFn = robotsAllowsFlights }) {
  const before = structuredClone(data);
  prune(before, today);
  prune(data, today);
  const started = Date.now();
  const [a, b] = routes.main;
  const mainDirs = [`${a}-${b}`, `${b}-${a}`];
  let searches = 0, blanks = 0, inARow = 0, stoppedBy = null;

  const run = async (fromQ, toQ, date, backDate) => {
    if (searches >= budget) { stoppedBy = 'budget'; return null; }
    if (Date.now() - started > minutes * 60000) { stoppedBy = 'time'; return null; }
    if (searches > 0) await sleepFn(4000 + Math.random() * 4000);
    searches++;
    const r = await searchFn(fromQ, toQ, date, backDate);
    if (r.status === 'bot') { stoppedBy = 'bot'; return null; }
    if (r.status !== 'ok') {
      blanks++; inARow++;
      if (inARow >= MAX_BLANKS_IN_A_ROW) stoppedBy = 'blanks';
      return [];
    }
    inARow = 0;
    return r.flights;
  };

  const robots = await robotsFn();
  if (!robots.ok) stoppedBy = 'robots';
  const plan = stoppedBy ? [] : planSearches(routes, data, today);
  const firstBlock = plan.filter(s => s.block === 'main' || s.block === 'main2');
  const later = plan.filter(s => s.block !== 'main' && s.block !== 'main2');

  // Each stored flight remembers which airport search found it (Sydney vs Western Sydney), so the
  // app's links open the search that has it.
  const apply = (s, flights) => applyDay(data, s.dir, s.date,
    flights && flights.map(f => ({ ...f, fromQ: s.fromQ, toQ: s.toQ })), today, routes.budgetAirlines);

  for (const s of firstBlock) {
    const flights = await run(s.fromQ, s.toQ, s.date);
    if (flights === null || stoppedBy) { if (flights) apply(s, flights); break; }
    apply(s, flights);
  }
  if (!stoppedBy) {
    const pairs = bestPairs(data.days[mainDirs[0]], data.days[mainDirs[1]],
      { limit: 3, after: today, roundTrips: data.roundTrips[mainDirs[0]] || [] });
    for (const p of pairs) {
      const flights = await run(routes.places[a].q, routes.places[b].q, p.out, p.back);
      if (flights === null || stoppedBy) break;
      applyRoundTrip(data, mainDirs[0], p.out, p.back, flights, today, routes.budgetAirlines, routes.roundTripUnsafe || []);
    }
  }
  if (!stoppedBy) {
    for (const s of later) {
      const flights = await run(s.fromQ, s.toQ, s.date);
      if (flights === null) break;
      apply(s, flights);
      if (stoppedBy) break;
    }
  }

  try {
    const items = await salesFn(routes, today);
    data.sales = { checked: today, items };
  } catch (e) { /* keep the last sales seen */ }
  prune(data, today);

  const fresh = dirs => dirs.reduce((n, dir) => n + Object.values(data.days[dir] || {}).filter(d => d.checked === today).length, 0);
  const mainDaysFresh = fresh(mainDirs);
  const otherDaysFresh = fresh(Object.keys(data.days).filter(d => !mainDirs.includes(d)));
  const mainTotal = 2 * routes.windowDays;
  const mainText = mainDaysFresh >= mainTotal ? 'Melbourne ⇄ Auckland fully up to date'
    : `Melbourne ⇄ Auckland ${mainDaysFresh} of ${mainTotal} days up to date`;
  const note = `Checked ${searches} searches (${blanks} blank); ${mainText}; ${STOPPED[stoppedBy]}.`;
  data.meta = { lastRun: melbourneIso(), note, searches, blanks, stoppedBy, coverage: { mainDaysFresh, otherDaysFresh } };

  let lines = [];
  try { lines = notable(before, data, routes, today); } catch (e) { lines = [`Couldn't work out today's changes: ${String(e).slice(0, 120)}`]; }
  const summary = [...(lines.length ? lines : ['No big changes on Melbourne ⇄ Auckland today.']), note];
  return { data, summary };
}

async function main(argv) {
  const file = argv[0];
  if (!file) { console.error('Usage: node travel/tools/check.js travel/data.json [--budget N] [--minutes M]'); process.exit(2); }
  const opt = name => { const i = argv.indexOf(`--${name}`); return i >= 0 ? +argv[i + 1] : undefined; };
  const routes = JSON.parse(readFileSync(new URL('../routes.json', import.meta.url), 'utf8'));
  const data = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : emptyData();
  const { openBrowser, search } = await import('./google.js');
  const { fetchSales } = await import('./sales.js');
  const { browser, ctx } = await openBrowser();
  try {
    const { data: out, summary } = await runCheck({
      data, routes, today: melbourneToday(),
      budget: opt('budget'), minutes: opt('minutes'),
      searchFn: (f, t, d, back) => search(ctx, f, t, d, back),
      salesFn: fetchSales,
      sleepFn: ms => new Promise(r => setTimeout(r, ms)),
    });
    writeFileSync(file, JSON.stringify(out), 'utf8');
    console.log(summary.join('\n'));
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(e => { console.error(e); process.exit(1); });
}
