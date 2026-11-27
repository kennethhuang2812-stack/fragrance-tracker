# Flight prices: iPhone app

Ken's flight price tracker. It shows the cheapest fare on a decent airline for each day over the
next 8 weeks, led by Melbourne ⇄ Auckland, plus his other routes to Sydney, Japan and China.
It's an installable web app (PWA), so no App Store is needed.

Files: index.html (the app), data.json (prices, written by the daily check), routes.json (the
routes and the budget-airline list), lib/ (code shared by the app and the check), tools/ (the
daily check), tests/, manifest.webmanifest, the icons, and sw.js (offline support).

## Install on iPhone
1. Once this folder is on GitHub Pages, open `<pages-url>/travel/` in Safari.
2. Tap Share, then Add to Home Screen. It opens full screen as "Flights" and works offline with
   the last prices it saw.

## What it shows
- **Melbourne ⇄ Auckland** first: a calendar for each direction, coloured from cheapest (green)
  to dearest (orange). Faded days are more than 2 days old. Tap a day to see the flights and
  links to Google Flights, Skyscanner and the airline.
- **Best pairs**: the cheapest out-and-back pairs for a range of nights (3–30 to start with).
  "Return ticket" means a round-trip fare beat the two one-ways.
- **Other routes**: each route's cheapest fare out and back, and how old its prices are.
- **Sales**: airline sales on these routes, shown at the top.

Prices are for one adult in economy, in AUD, and are the cheapest fare. That fare may not
include a checked bag (Air NZ's "seat" fares don't). Confirm on the airline's site before booking.

## Where prices come from
| Source | How | Notes |
|---|---|---|
| Google Flights | `https://www.google.com/travel/flights?q=...` pages, read one at a time with headless Chromium | Ken approved Google Flights for this app. robots.txt allows these pages. The check never loads `/travel/flights/search` (disallowed), never clicks Google's filters, never changes the browser's user agent, and stops for the day at a bot check. |
| Air New Zealand AU sale page | `airnewzealand.com.au/best-fares`, plain HTML | per-route sale fares and end dates |
| Air New Zealand NZ deals page | `airnewzealand.com/en-nz/book/flight-deals-best-fares` | the sale headline and end date |
| Qantas, Virgin Australia sale pages | not read | their prices load with JavaScript; the plain page has no route or price |
| Qatar Airways offers | not read | the site returns 403 to automated requests |

**Budget airlines are left out**, including when they fly a flight sold under another airline's
number (Google names the airline that flies the plane): Jetstar, Scoot, AirAsia, Zipair, Peach,
Spring Airlines, Cebu Pacific, Tigerair, Bonza, Lion Air, Batik Air, VietJet, Jeju Air, T'way,
Jin Air, HK Express and Air Busan. The list is in `routes.json`.

## The daily check
A scheduled Claude task ("Flight price check") runs early each morning Melbourne time:

    node travel/tools/check.js travel/data.json [--budget 140] [--minutes 70]

It works down a priority list until it reaches the search budget or time limit, or Google shows a
bot check (or 6 blank results in a row):
1. Melbourne ⇄ Auckland, every day for the next 4 weeks, both ways;
2. weeks 5–8 every other day;
3. return-ticket prices for the 3 best pairs;
4. a second focus route, if one is set;
5. the other routes on fixed weekly dates, oldest first;
6. the rest of weeks 5–8, then more dates on other routes.

Then it reads the sale pages, saves `data.json` and prints a summary for the phone notification.
The summary leads with sales, a cheaper best pair, new lows, and drops of $40 or 10% on
Melbourne ⇄ Auckland.

## Changing routes
- **A second focus for a trip** (for example Auckland ⇄ Tokyo): set `"focus2": ["AKL", "TYO"]`
  in `routes.json`, or ask Claude to. It only uses searches left over after Melbourne ⇄ Auckland.
  Set it back to `null` afterwards.
- **Another route:** add a pair to `routes.json` (and a place if it's a new city).

## Tests

    node --test travel/tests/*.test.js

The app test serves the repository with `python3 -m http.server` and drives the page in
headless Chromium against `tests/fixtures/app-data.json`.
