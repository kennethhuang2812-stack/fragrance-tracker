// Airline sale pages, read with a plain fetch where robots.txt allows. Only sales on Ken's routes
// are kept. Pages that need JavaScript, or whose robots.txt disallows them, are not read (see README).
import { robotsDecision } from './google.js';

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = n => String(n).padStart(2, '0');
const decode = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const text = s => decode(s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').trim();

/** 'Sale ends 11.59pm AEDT, 1 Dec 2026' → '2026-12-01' */
export function parseEndDate(s) {
  const m = String(s).match(/(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{4})/i);
  return m ? `${m[3]}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(+m[1])}` : null;
}

// Sydney means both Sydney airports in this app.
const placeOf = code => (code === 'WSI' ? 'SYD' : code);

export function kenDirections(routes) {
  const pairs = [routes.main, ...routes.pairs.map(p => [p.a, p.b])];
  return new Set(pairs.flatMap(([a, b]) => [`${a}-${b}`, `${b}-${a}`]));
}

/** Air NZ's Australian "best fares" page: one item per deal on Ken's routes (the cheapest fare shown). */
export function parseAirNZAU(html, routes, url = 'https://www.airnewzealand.com.au/best-fares') {
  const dirs = kenDirections(routes);
  const items = [], seen = new Set();
  for (const block of html.split('<div class="deal-block').slice(1)) {
    const o = block.match(/originPoint=([A-Z]{3})/), d = block.match(/destinationPoint=([A-Z]{3})/);
    const amount = block.match(/<div class="amount">\s*([\d,]+)\s*</);
    if (!o || !d || !amount) continue;
    const dir = `${placeOf(o[1])}-${placeOf(d[1])}`;
    if (!dirs.has(dir)) continue;
    const ends = (block.match(/data-end-date="(\d{4}-\d{2}-\d{2})"/) || [])[1] || null;
    const fare = text((block.match(/<div class="bookingclass">([\s\S]*?)<\/div>/) || [])[1] || '').replace(/\s+/g, ' ');
    const period = block.match(/Travel Period:<\/span>([\s\S]*?)<\/div>/);
    const travel = period ? text(period[1]).split('\n')[0].trim() : '';
    const link = decode((block.match(/href="(https:\/\/flightbookings[^"]+)"/) || [])[1] || url);
    const item = { airline: 'Air New Zealand', dir, price: +amount[1].replace(/,/g, ''), fare, travel, ends, url: link };
    const key = `${dir}|${item.price}|${ends}`;
    if (!seen.has(key)) { seen.add(key); items.push(item); }
  }
  return items;
}

/** Air NZ's New Zealand flight deals page: its sale headline, if it has one. */
export function parseAirNZNZ(html, url = 'https://www.airnewzealand.com/en-nz/book/flight-deals-best-fares') {
  const m = html.match(/<h2[^>]*>([^<]*on sale[^<]*)<\/h2>[\s\S]{0,1500}?(Sale ends[^<.]*)/i);
  if (!m) return null;
  return { airline: 'Air New Zealand', dir: null, title: decode(m[1]).trim(), ends: parseEndDate(m[2]), url };
}

const PAGES = [
  { url: 'https://www.airnewzealand.com.au/best-fares', parse: (h, r, u) => parseAirNZAU(h, r, u) },
  { url: 'https://www.airnewzealand.com/en-nz/book/flight-deals-best-fares', parse: (h, r, u) => [parseAirNZNZ(h, u)].filter(Boolean) },
];

/** Read every sale page robots.txt allows; keep current sales on Ken's routes and headline sales. */
export async function fetchSales(routes, today, fetchFn = fetch) {
  const dirs = kenDirections(routes);
  const out = [];
  for (const page of PAGES) {
    try {
      const origin = new URL(page.url).origin;
      const rb = await fetchFn(`${origin}/robots.txt`);
      if (rb.ok && !robotsDecision(await rb.text(), page.url).ok) continue;
      const r = await fetchFn(page.url);
      if (!r.ok) continue;
      out.push(...page.parse(await r.text(), routes, page.url));
    } catch (e) { /* a sale page that can't be read is skipped */ }
  }
  return out.filter(s => (!s.ends || s.ends >= today) && (s.dir === null || dirs.has(s.dir)));
}
