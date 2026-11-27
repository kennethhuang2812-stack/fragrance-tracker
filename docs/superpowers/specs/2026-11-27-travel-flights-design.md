# Travel flights tracker: design

Date: 2026-11-27. Status: waiting for Ken's approval.

## Why

Ken lives between Melbourne and Auckland and also flies to Japan and China. Today, finding the
cheapest decent flight for a trip means searching each date by hand on several sites. He wants an
app that keeps watching his regular routes so that, when he decides to go somewhere, he can see
the cheapest days at a glance and pick a pair of flights. On 2026-11-27 this was done once by hand
for Melbourne → Auckland → Melbourne (it found Qatar Airways' new Melbourne–Auckland flights,
$672 return against about $800 on Air NZ or Qantas). The app does the same thing automatically,
every day, for all his routes.

The original ask was a one-stop travel app (flights, hotels, Airbnb, car hire, activities).
Ken chose to do **flights first**; stays and the rest are later projects.

## Goals

- For each of Ken's routes, in both directions, show the cheapest **decent-airline** one-way fare
  for each departure day over the next 8 weeks, with how fresh each price is.
- For the route he is focused on, check every day of the window every day, and show the best
  out-and-back pairs (with the stay length) so he can book from the app's links.
- Flag airline sales that cover his routes (Air NZ's sale page, for example), and tell him when a
  focused route gets notably cheaper.
- Work like his fragrance and liquor apps: an installable iPhone web app on the same GitHub
  Pages site, fed by a scheduled Claude cloud session that commits a data file.
- Cost nothing beyond his Claude plan (Ken chose the free option over a paid data feed).

## Non-goals

- Hotels, Airbnb, car hire, activities (later, starting with stays in Japan and China).
- Live "search now" from the phone (needs a server and a paid key). Instead, every route and day
  has one-tap links to the same search on Google Flights, Skyscanner and the airline's own site.
- Booking inside the app, passenger details, points or award seats.
- "Secondhand" tickets: airline tickets are tied to the passenger's name, so there is no real
  resale market. Mistake-fare and deal sites may be a later idea.

## Anti-goals (failure even if it works)

- Showing a Jetstar, Scoot or other budget-airline flight as the cheapest option, including one
  sold under a Qantas (or other) flight number but flown by Jetstar.
- A price that looks current but is days old without saying so.
- Getting around a bot check or captcha, disguising the browser, or reading pages a site's
  robots.txt disallows.
- Breaking the fragrance or liquor apps that share the site.

## Constraints

- Hosting: the GitHub repository `kennethhuang2812-stack/fragrance-tracker`, served by GitHub
  Pages from `main`. The fragrance app is at the root and the liquor app at `/alcohol/`. The
  travel app goes in `/travel/`.
- The root service worker (`sw.js`, the fragrance app's) handles every request under the site
  and only skips `/alcohol/`. It must also skip `/travel/`, with its cache version bumped. This is
  the only change allowed outside `travel/`.
- Data source: Google Flights search pages of the form
  `https://www.google.com/travel/flights?q=Flights to AKL from MEL on 2026-12-10 one way&curr=AUD&hl=en-AU&gl=AU`.
  google.com/robots.txt allows `/travel/flights` and disallows `/travel/flights/search`,
  `/travel/flights/s/` and `/travel/flights/booking`. Google's two-month price chart and its
  filters (airline, stops) only exist on the disallowed `/travel/flights/search` pages, so the
  checker never uses them. It makes one `?q=` search per route, direction and date.
  Ken's other checks say "Never scrape Google". Ken approved an exception for Google Flights
  `?q=` pages for this app only. All his other site rules still apply: robots.txt, no getting
  around bot checks, no disguised browser.
- What was learned on 2026-11-27 (headless Chromium via the proxy, as `tools/render_page.js`
  does):
  - Each result has an `aria-label` starting "From 414 Australian dollars. Non-stop flight with
    Qatar Airways. Leaves Melbourne Airport at 1:20 am on Thursday, December 10 and arrives at
    Auckland Airport at 6:50 am ... Total duration 3 hrs 30 min." The "flight with X" part names
    the airline(s) that **fly** the plane. A Qantas-numbered flight flown by Jetstar says "with
    Jetstar", and a connection says "with Qantas and Jetstar". Regional operators appear as
    "Operated by Qantaslink - National Jet Systems". Times use a narrow no-break space before
    am/pm.
  - Google's own airline filter works on the airline that sells the ticket, so Jetstar-flown
    Qantas flights get through it. The checker filters on the label text itself.
  - Reusing one browser tab across searches returned stale or empty results, so each search
    uses a fresh tab. Wait until result labels exist (up to about 25 s) and check that their
    departure date matches the date searched.
  - About a third of searches came back blank when three ran in parallel, and parallel runs hit
    Google's "unusual traffic" bot check. The checker runs one search at a time with pauses and
    stops for the day on a bot check.
  - Searching "Flights to AKL from MEL on 2026-12-10 through 2026-12-17" gives round-trip totals,
    which can be lower than two one-ways (Qatar: $672 vs $693).
- Budget: unknown until measured. The guess is about 100 searches per daily run, so the checker
  is budget-driven: it works through a priority queue until it runs out of time or searches, or
  hits a bot check. Everything not checked keeps its last price and date.

## Approaches considered

1. **Free daily check reading Google Flights pages** (chosen by Ken). No cost or sign-up, and it
   works like his other two apps. Limits: Google's throttling caps how many route-days are
   checked each day, and a Google page redesign breaks the reader until it's fixed.
2. **Paid feed (SerpApi Google Flights, US$25–75 a month).** Same data as clean JSON, no blanks,
   about 165 searches a day on the US$75 plan. Not chosen because of the cost. The app's data
   file doesn't depend on the source, so this can be swapped in later.
3. **Live search from the phone.** Ruled out: needs a server holding a paid key, and would be no
   faster than opening Google Flights.

## Decided by Ken

- Flights first; stays and the rest later.
- The free option (approach 1).
- No Jetstar, Scoot or other budget airlines.
- Routes: Melbourne/Sydney ↔ Auckland; Melbourne ↔ Sydney; Auckland and Melbourne/Sydney ↔
  Tokyo and Osaka; Auckland and Melbourne/Sydney ↔ Shanghai, Beijing, Guangzhou and Shenzhen.
  That makes 21 route pairs, 42 directions.
- Reading Google Flights `?q=` pages is allowed for this app only (the exception to "Never scrape
  Google" above).
- His current trip: Melbourne → Auckland in the next one to two weeks, back whenever is cheapest.

## Calls made in this design (Ken can change any)

- **One adult, economy, prices in AUD, cheapest fare shown.** Some cheapest fares (Air NZ
  "Seat") have no checked bag; the app says so on the day view.
- **Budget airlines excluded** if any airline flying the trip matches: Jetstar, Scoot, AirAsia
  / AirAsia X, Zipair, Peach, Spring Airlines, Cebu Pacific, Tigerair, Bonza, Lion Air, Batik Air,
  VietJet, Jeju Air, T'way, Jin Air, HK Express, Air Busan. The list lives in one place in the
  checker. **Counted as decent:** Air NZ, Qantas (including QantasLink), Virgin Australia, Qatar,
  Emirates, JAL, ANA, Singapore Airlines, Cathay Pacific, China Eastern, China Southern, Air China,
  and other full-service airlines.
- **Window:** departures from tomorrow to 8 weeks out.
- **Focus route:** Melbourne ↔ Auckland is the focus by default. Every day in the window is
  checked every day in both directions, with round-trip totals for the best few pairs. Ken
  changes the focus (for example to Auckland ↔ Tokyo for a Japan trip) by asking Claude, which
  edits `travel/routes.json`. The phone app can't tell the cloud check what to do.
- **Other routes:** checked from a rotating queue, oldest-checked dates first, aiming for at least
  one date a week per direction across the window. With spare budget, it adds more dates nearest
  to today. The numbers: the focus route takes about 112 searches a day (2 directions × 56 days),
  and a weekly sample of the other 40 directions takes about 48 a day. If the real budget is
  closer to 100, the focus route's next 4 weeks come first (daily), its weeks 5–8 every other
  day, and the other routes get a date about every fortnight. The run summary reports the
  coverage it actually got.
- **Stops:** for each route-day, keep the cheapest non-stop and the cheapest with one stop (a
  trip with two or more stops is ignored). The app shows the non-stop by default and the one-stop
  when it is cheaper by a set margin (builder's choice, say 15%) and under about 1.5× the non-stop
  time.
- **Price history:** each route-day keeps a short history ({d, a}), so the app can show "down $40
  since yesterday" and "lowest seen".
- **Sales:** each run reads airline sale pages whose robots.txt allows it with a plain fetch:
  Air NZ AU (`/best-fares`) and NZ (`/en-nz/book/flight-deals-best-fares`), plus Qantas,
  Virgin Australia and Qatar sale pages if allowed. It keeps the offers that cover Ken's routes
  (route, "from" price, travel periods, end date) for a sales banner.
- **Alerts:** like the other trackers, the scheduled task's push notification is the alert. Its
  summary leads with anything notable: a new lowest price on the focus route for any day in the
  window, a drop of $40 or 10% or more on a focus-route day, the best pair getting at least $30
  cheaper, or a sale covering a route.
- **No Claude artifact copy** of this app. GitHub Pages only.
- **Sydney means both airports:** Kingsford Smith (SYD) and Western Sydney International (WSI),
  since Air NZ flies WSI–Auckland. The airport is labelled on each flight. Tokyo means Haneda
  and Narita; Osaka means Kansai.
- **Dates** are local departure dates at the origin airport.
- **Shipping:** built on the session branch and merged to `main` by pull request. The scheduled
  task is created after the merge, so it always works on `main`.

## What the app shows (sketch)

```
Flights                                  checked 6:05 am
[ Air NZ sale: MEL→AKL from $305, travel from 11 Jan, ends Tue ]

MEL ⇄ AKL   (focus)        cheapest  $414 out · $279 back
SYD ⇄ AKL                  $389 · $301        2 days ago
MEL ⇄ SYD                  $129 · $119
AKL ⇄ Tokyo                $1,020 · $980      5 days ago
...

── MEL → AKL ───────────────────────────────
 Dec  M   T   W   T   F   S   S
      .  .  507 414 414  .  507     (colour = cheaper/dearer)
 tap a day → Qatar 1:20am–6:50am $414 · Air NZ 10:20am $517 ...
             [Google Flights] [Skyscanner] [Airline]

Best pairs (5–21 nights)
 $672  Qatar Thu 10 Dec → Qatar Thu 17 Dec (7 nights, return ticket)
 $747  Qatar Thu 10 Dec → Qantas Tue 22 Dec (12 nights)
```

- Home: one row per route pair, with the cheapest out and back in the window, how old the data
  is, and a sale banner when one applies.
- Route view: a calendar for each direction, coloured by price, with "checked X days ago" on
  stale days. Tap a day for its flights (airline, times, stops, duration, price, bag note) and
  search links.
- Best pairs (focus route): the cheapest out-and-back pairs, with a nights filter (default 3–30).
  Return-ticket totals are used when checked, otherwise the sum of the one-ways.
- Same look and feel as the liquor app (system font, light/dark tokens, cards, bottom-safe
  areas). Installable: manifest, icons, its own service worker scoped to `/travel/`, works
  offline with the last data.

## Data (shape left to the builder)

- `travel/routes.json`: route pairs (airport or city codes, labels), the focus pair, the window
  length and the excluded airlines.
- `travel/data.json`: per direction and departure date, the best non-stop and one-stop options
  (price, airlines, times, duration, stops, checked date, short history), round-trip totals for
  focus pairs, sales, and meta (last run, run note, searches done, blanks, bot-check hit).
- `travel/tools/`: the checker (Node + Playwright, reusing `tools/render_page.js` patterns: proxy,
  robots.txt check, bot-check stop) and a small sales reader.

## Daily scheduled task

A new scheduled task in Ken's account ("Flight price check"), run early each morning Melbourne
time. Its prompt tells it to:
1. clone the repository;
2. run the checker within the budget (one search at a time, fresh tab each, pauses, stop on a
   bot check);
3. read the sale pages;
4. commit only `travel/data.json` to `main` and push;
5. end with a short summary that leads with notable drops or sales.

It follows the site rules in Ken's other checks, except that Google Flights is always its price
source (Ken: "always scrape google"). It still keeps to robots.txt and stops at a bot check.

## Left to the builder

- The data file format, the checker's code structure, pacing and time limits.
- How to map Google's airline and airport text, and city vs airport codes (Tokyo = HND + NRT).
- The exact colour scale, layout details and icons.
- Measuring the real daily budget in the first runs and tuning the queue.
- Tests for the label parser, the budget-airline filter and pair building, using saved label
  samples from 2026-11-27.
