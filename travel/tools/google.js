// Reads Google Flights search pages (https://www.google.com/travel/flights?q=...) with headless
// Chromium. Ken approved Google Flights for this app. It keeps to robots.txt, never loads
// /travel/flights/search, never clicks Google's filters, never changes the user agent, and stops
// at a bot check instead of trying to get past it.
import { createRequire } from 'node:module';
import { parseLabel, labelsMatchDate } from '../lib/flights.js';
import { googleUrl } from '../lib/links.js';

const require = createRequire(import.meta.url);
const BOT = /unusual traffic|not a robot|recaptcha/i;
const AGENTS = ['claude-user', 'claudebot', 'anthropic-ai', '*'];

export async function openBrowser() {
  const { chromium } = require('playwright');
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch(proxy ? { proxy: { server: proxy } } : {});
  const ctx = await browser.newContext({ locale: 'en-AU', timezoneId: 'Australia/Melbourne' });
  return { browser, ctx };
}

// Same rule as tools/render_page.js: use the most specific user-agent group that names us,
// then the longest matching path rule (Allow wins a tie).
export function robotsDecision(txt, url) {
  const u = new URL(url);
  const groups = []; let cur = null, lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim(); if (!line) continue;
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') {
      if (!lastWasAgent || !cur) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(v.toLowerCase()); lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && (k === 'allow' || k === 'disallow')) cur.rules.push({ allow: k === 'allow', path: v });
    }
  }
  let g = null;
  for (const a of AGENTS) { g = groups.find(x => x.agents.includes(a)); if (g) break; }
  if (!g) return { ok: true };
  const path = u.pathname + u.search; let best = null;
  for (const r of g.rules) {
    if (!r.path) continue;
    const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return best && !best.allow ? { ok: false, why: `robots.txt disallows ${best.path}` } : { ok: true };
}

export async function robotsAllowsFlights() {
  try {
    const r = await fetch('https://www.google.com/robots.txt');
    if (!r.ok) return { ok: false, why: `robots.txt returned ${r.status}` };
    return robotsDecision(await r.text(), googleUrl('MEL', 'AKL', '2026-12-10'));
  } catch (e) {
    return { ok: false, why: 'robots.txt could not be read' };
  }
}

// Pages google.com/robots.txt disallows (the checker must never load them), and Google's bot page.
const DISALLOWED = ['/travel/flights/search', '/travel/flights/s/', '/travel/flights/booking', '/travel/search'];
const disallowed = url => { const p = new URL(url).pathname; return DISALLOWED.some(d => p.startsWith(d)); };

/** Turn a results page's labels into a search result, rejecting anything that isn't exactly
 * what was searched: another date, one-way vs round trip, a disallowed page, or Google's bot page. */
export function pageResult(labels, date, backDate, finalUrl) {
  if (new URL(finalUrl).pathname.startsWith('/sorry')) return { status: 'bot', flights: [] };
  if (disallowed(finalUrl)) return { status: 'blank', flights: [] };
  const flights = labels.map(l => parseLabel(l, date)).filter(Boolean);
  if (!labelsMatchDate(flights, date)) return { status: 'blank', flights: [] };
  if (flights.some(f => f.roundTrip !== !!backDate)) return { status: 'blank', flights: [] };
  return { status: 'ok', flights };
}

/** One Google Flights search in a fresh tab: {status: 'ok'|'blank'|'bot', flights}. */
export async function search(ctx, fromQ, toQ, date, backDate) {
  let page = null;
  try {
    page = await ctx.newPage();
    // Never let the page load a disallowed Google path, even if Google redirects or a click navigates.
    await page.route(u => u.hostname === 'www.google.com' && disallowed(u.href), r => r.abort());
    await page.goto(googleUrl(fromQ, toQ, date, backDate), { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (new URL(page.url()).pathname.startsWith('/sorry')) return { status: 'bot', flights: [] };
    let ready = false;
    for (let waited = 0; waited < 25000 && !ready; waited += 1500) {
      await page.waitForTimeout(1500);
      const text = await page.innerText('body').catch(() => '');
      if (BOT.test(text.slice(0, 3000))) return { status: 'bot', flights: [] };
      if (/No results returned/i.test(text)) return { status: 'blank', flights: [] };
      const n = await page.$$eval('[aria-label^="From "]', es => es.length);
      ready = n > 0 && /results returned/.test(text);
    }
    if (!ready) return { status: 'blank', flights: [] };
    const more = await page.$('button[aria-label*="more flights"], button:has-text("more flights")');
    if (more) { await more.click().catch(() => {}); await page.waitForTimeout(3000); }
    const labels = await page.$$eval('[aria-label^="From "]', es => [...new Set(es.map(e => e.getAttribute('aria-label')))]);
    return pageResult(labels, date, backDate, page.url());
  } catch (e) {
    return { status: 'blank', flights: [], error: String(e).slice(0, 160) };
  } finally {
    if (page) await page.close().catch(() => {});
  }
}
