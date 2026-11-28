# Melbourne liquor price tracker: iPhone app

Same idea as the fragrance tracker, for drinks bought in Melbourne. An installable web app (PWA), no App Store needed.

Files: index.html (the app), data.json (prices), manifest.webmanifest + icons, sw.js (offline support), tools/ (the price checker).

## Install on iPhone
1. Once this folder is on GitHub Pages, open `<pages-url>/alcohol/` in Safari.
2. Tap Share, then Add to Home Screen. It opens full screen as "Liquor" and works offline with the last prices it saw.

## Where prices come from
| Store | How | Notes |
|---|---|---|
| Coles (Liquorland range) | read from the site's search page | shelf price plus "was" price when on special |
| Bottle-Stop | read from the product page | Melbourne stores; online price for Each / Pack (6) / Case (24 or 30) |
| Thirsty Camel | read from the product page | online price, can differ by store |
| Blackhearts & Sparrows | read from the product page | Melbourne bottle shops |
| Dan Murphy's, BWS | search snapshots (≈) | their pages need JavaScript to show prices |
| Purvis Beer, Boccaccio Cellars, Liquor Loot | read from the product page | Shopify stores; Purvis (Richmond) and Boccaccio (Balwyn) are in Melbourne |
| OurCellar | read from the product page | online store that delivers to Melbourne |
| Liquorland, First Choice, Vintage Cellars | never read | robots.txt allows AI agents, but the sites sit behind bot protection; add prices by hand in the app |

Each drink also shows **price per standard drink** (10 g of alcohol), so a slab, a bottle of wine and a bottle of spirits can be compared.

## Keeping prices fresh
A daily scheduled Claude task runs `python3 tools/prices.py check data.json` (re-reads every page listing and adds today's price to its history), then `python3 tools/prices.py find data.json` (looks for missing stores and sizes), adds Dan Murphy's / BWS search snapshots, and commits data.json.

To track another drink, add an entry to `tools/seed.py`, then run `prices.py sync data.json` and `prices.py find data.json`.

Watchlist stars, price alerts and prices you type in are saved on the phone only.
