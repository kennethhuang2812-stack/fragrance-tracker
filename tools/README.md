# Price tools

Helpers the daily price check can run in its cloud session.

- `render_page.js` reads a store page with Playwright (a real headless browser), for stores
  whose prices only appear after JavaScript runs. It checks robots.txt first and stops on a
  bot check instead of trying to get past it. `node tools/render_page.js <url> ...`
- `cc_history.py` finds past prices for tracked listings in Common Crawl's public web archive
  (data.commoncrawl.org). It prints `{listing id: {date: AUD price}}`.
  `python3 tools/cc_history.py data.json out.json CC-MAIN-2026-43 [more crawls]`

Puppeteer and Selenium do the same job as Playwright, and Scrapy is a crawler framework, so
they are not added. Chrome DevTools is a browser panel rather than something to install.

## Where the prices live

`data.json` in this repository is the main copy of every price. The morning price check and the
sales check edit it directly and push to `main`. The Claude artifact page (`artifact/index.html`,
published at https://claude.ai/artifact/Aqi71ZEHxZbp3hpH4xMBpc) is republished with `data.json`
alongside it, and only keeps the watchlist and price targets in the artifact's own database.
