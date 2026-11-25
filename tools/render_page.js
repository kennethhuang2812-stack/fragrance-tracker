// Reads a store page with a real browser (Playwright), for stores whose prices only appear
// after JavaScript runs. It checks robots.txt first and stops if the page is disallowed,
// and it reports a bot check instead of trying to get past it.
// Usage: node tools/render_page.js <url> [more urls]
// Prints one JSON line per URL: {url, ok, reason?, title, prices, ld}
const {chromium} = require('playwright');

const AGENTS = ['claude-user', 'claudebot', 'anthropic-ai', '*'];

async function robotsAllows(ctx, url) {
  const u = new URL(url);
  let txt = '';
  try {
    const r = await ctx.request.get(`${u.origin}/robots.txt`, {timeout: 20000});
    if (!r.ok()) return {ok: r.status() === 404, why: `robots.txt returned ${r.status()}`};
    txt = await r.text();
  } catch (e) { return {ok: false, why: 'robots.txt could not be read'}; }
  if (/<html|just a moment|captcha/i.test(txt.slice(0, 2000))) return {ok: false, why: 'robots.txt is behind a bot check'};
  // Group rules by user-agent, then use the most specific group that names us.
  const groups = []; let cur = null, lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim(); if (!line) continue;
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { if (!lastWasAgent || !cur) { cur = {agents: [], rules: []}; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasAgent = true; }
    else { lastWasAgent = false; if (cur && (k === 'allow' || k === 'disallow')) cur.rules.push({allow: k === 'allow', path: v}); }
  }
  let g = null;
  for (const a of AGENTS) { g = groups.find(x => x.agents.includes(a)); if (g) break; }
  if (!g) return {ok: true};
  const path = u.pathname + u.search; let best = null;
  for (const r of g.rules) {
    if (!r.path) continue;
    const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return best && !best.allow ? {ok: false, why: `robots.txt disallows ${best.path}`} : {ok: true};
}

(async () => {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch(proxy ? {proxy: {server: proxy}} : {});
  const ctx = await browser.newContext({locale: 'en-AU'});
  for (const url of process.argv.slice(2)) {
    const rb = await robotsAllows(ctx, url);
    if (!rb.ok) { console.log(JSON.stringify({url, ok: false, reason: rb.why})); continue; }
    const page = await ctx.newPage();
    try {
      const res = await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 30000});
      await page.waitForTimeout(5000);
      const title = await page.title();
      const body = (await page.innerText('body')).replace(/\s+/g, ' ');
      if (/captcha|just a moment|access denied|verify you are human|enable javascript and cookies/i.test(title + ' ' + body.slice(0, 1000))) {
        console.log(JSON.stringify({url, ok: false, reason: 'bot check; not getting past it'}));
      } else {
        const ld = await page.$$eval('script[type="application/ld+json"]', x => x.map(y => y.textContent));
        console.log(JSON.stringify({url, ok: true, status: res && res.status(), title,
          prices: (body.match(/\$\s?[\d,]+\.\d\d/g) || []).slice(0, 20), ld}));
      }
    } catch (e) {
      console.log(JSON.stringify({url, ok: false, reason: 'page did not load: ' + e.message.split('\n')[0]}));
    }
    await page.close();
  }
  await browser.close();
})();
