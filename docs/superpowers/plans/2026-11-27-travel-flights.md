# Travel Flights Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An installable iPhone web app at `/travel/` that shows the cheapest decent-airline fares
for Ken's routes over the next 8 weeks, led by Melbourne ⇄ Auckland, fed by a daily cloud check
that reads Google Flights.

**Architecture:** Pure logic lives in `travel/lib/` as browser-and-Node ES modules: label parsing,
filtering, the search planner, merging, pairs and notable changes. The app and the checker share
these modules. `travel/tools/` has the Playwright Google Flights runner, the airline-sale reader
and the `check.js` CLI that the scheduled task runs. It writes `travel/data.json`. `travel/index.html`
is a single-page app in the liquor app's style.

**Tech Stack:** Node 22 (built-in `node:test`, no npm dependencies). Playwright is installed
globally: in ES modules load it with `createRequire(import.meta.url)('playwright')`, because a
bare `import` fails. Plain HTML/CSS/JS with `<script type="module">`. Python 3 only for
`http.server` in the app test.

**Spec:** `docs/superpowers/specs/2026-11-27-travel-flights-design.md`

## Global Constraints

- Nothing outside `travel/` changes except root `sw.js`: skip `/travel/` like `/alcohol/`, and bump `CACHE` `'fpt-v22'` → `'fpt-v23'`.
- `travel/package.json` is `{"type": "module", "private": true}` so Node treats `travel/**/*.js` as ES modules.
- One adult, economy, AUD. A label counts only if it starts `From <n> Australian dollars`.
- Google Flights is read only at `https://www.google.com/travel/flights?q=<query>&curr=AUD&hl=en-AU&gl=AU`. Never load `/travel/flights/search`, `/travel/flights/s/` or `/travel/flights/booking`, and never click Google's filters or price graph (they navigate to `/travel/flights/search`). Clicking the "more flights" button is fine.
- One search at a time, a fresh tab for each search, a pause of 4–8 s (random) between searches, default user agent (never changed).
- Stop the whole run on a bot check: page text matches `/unusual traffic|not a robot|recaptcha/i`. Also stop after 6 blanks in a row. Never try to get around either.
- Budget airlines (match case-insensitive against `airlines + ' ' + operated`, apostrophes normalised): `Jetstar, Scoot, AirAsia, Zipair, Peach, Spring Airlines, Cebu Pacific, Tigerair, Bonza, Lion Air, Batik Air, VietJet, Jeju Air, T'way, Jin Air, HK Express, Air Busan`.
- "Today" is the Australia/Melbourne date. The window is the 56 departure dates from tomorrow.
- Shown option per day: the one-stop wins only if its price ≤ 0.85 × the non-stop price and its minutes ≤ 1.5 × the non-stop minutes. With no non-stop, the one-stop is shown. Trips with 2+ stops are ignored.
- Notable: a per-day drop of ≥ $40 or ≥ 10% on a focus route; a new window low for a focus direction; the best main pair ≥ $30 cheaper; a new sale covering one of Ken's directions.
- Pairs: nights filter default 3–30. Use a round-trip total when one is recorded and it's cheaper than the sum of the one-ways.
- Main route `["MEL","AKL"]` always takes the first searches. `focus2` only gets what's left after the main blocks.
- Writing style in the app and summaries: plain English, `$414`, dates like `Thu 10 Dec`.

## Review Focus

1. A search that loads but comes back blank (no labels, "No results") must keep that day's old price and `checked` date, and never write an empty day → Task 3 test `blank keeps previous day`.
2. A stale page from the previous search, where the labels' departure date differs from the date searched, must be rejected as a whole → Task 1 test `rejects labels for another date`, used by Task 5's `search()`.
3. Overnight and year-end flights: arrival next day, and a 31 Dec departure that lands 1 Jan 2027 → Task 1 test `rolls the year for January arrival`.
4. Google showing another currency (NZD when reached from a different region) must not be read as AUD → Task 1 test `ignores non-AUD labels`.
5. Old data: days before today must disappear from the data and calendar, and history stays capped → Task 3 test `prune drops past days and caps history`.

---

### Task 1: Routes config, label parser and airline filter

**Files:**
- Create: `travel/package.json`, `travel/routes.json`, `travel/lib/flights.js`, `travel/tests/fixtures/labels.js` (exports `L1`–`L4` below, reused by later tests)
- Test: `travel/tests/flights.test.js`

**Interfaces:**
- Produces:
  - `routes.json`: `{windowDays: 56, main: ["MEL","AKL"], focus2: null, places: {CODE: {label, q}}, pairs: [{a, b, extra?: {CODE: [q...]}}], budgetAirlines: [...]}`
  - `parseLabel(label: string, searchDate: string) → Flight | null`, where Flight = `{price, roundTrip, stops, airlines, operated, dep, depDate, arr, arrDate, fromAirport, toAirport, mins, via: string[]}`. Times are normalised to `"1:20 am"` with a normal space. Dates are `YYYY-MM-DD`.
  - `isBudget(f: Flight, budgetAirlines: string[]) → boolean`
  - `bestOptions(flights: Flight[], budgetAirlines) → {nonstop: Flight|null, onestop: Flight|null}` (cheapest of each; budget and 2+ stops removed)
  - `shown(day: {nonstop, onestop}) → Flight|null` (the rule in Global Constraints)
  - `labelsMatchDate(flights: Flight[], date) → boolean` (every flight's depDate === date)

- [ ] **Step 1: Write `routes.json`.** Places:
  - MEL `{label:"Melbourne", q:"MEL"}`, SYD `{label:"Sydney", q:"SYD"}`, AKL `{label:"Auckland", q:"AKL"}`
  - TYO `"Tokyo"`, OSA `"Osaka"`, SHA `"Shanghai"`, BJS `"Beijing"`, CAN `"Guangzhou"`, SZX `"Shenzhen"`, each with `q` equal to its label

  Pairs are the 20 non-main pairs: SYD–AKL, MEL–SYD, AKL–TYO, AKL–OSA, MEL–TYO, SYD–TYO, MEL–OSA, SYD–OSA, then AKL/MEL/SYD × SHA, BJS, CAN, SZX. SYD–AKL and MEL–SYD get `extra: {"SYD": ["WSI"]}`, because a "Sydney" search only returns Kingsford Smith (checked 2026-11-27) and Western Sydney Airport serves these routes. Add the budget list from Global Constraints.

- [ ] **Step 2: Write the failing tests** with these label strings (L1–L4 are real, captured 2026-11-27; the others are built from them):

```js
const L1 = 'From 414 Australian dollars. Non-stop flight with Qatar Airways. Leaves Melbourne Airport at 1:20 am on Thursday, December 10 and arrives at Auckland Airport at 6:50 am on Thursday, December 10. Total duration 3 hrs 30 min.   Select flight';
const L2 = 'From 638 Australian dollars. Non-stop flight with Jetstar. Leaves Melbourne Airport at 11:55 pm on Thursday, December 10 and arrives at Auckland Airport at 5:30 am on Friday, December 11. Total duration 3 hrs 35 min.   Select flight';
const L3 = 'From 1023 Australian dollars. 1 stop flight with Scoot. Leaves Melbourne Airport at 1:25 pm on Monday, December 14 and arrives at Narita International Airport at 7:10 am on Tuesday, December 15. Total duration 19 hrs 45 min.  Stopover (1 of 1) is a 5 hrs 10 min stopover at Singapore Changi Airport in Singapore. Select flight';
const L4 = L1.replace('Australian dollars.', 'Australian dollars round trip total.').replace('414', '672');
```

  Tests:
  - `parses a non-stop`: parseLabel(L1,'2026-12-10') deep-equals `{price:414, roundTrip:false, stops:0, airlines:'Qatar Airways', operated:'', dep:'1:20 am', depDate:'2026-12-10', arr:'6:50 am', arrDate:'2026-12-10', fromAirport:'Melbourne Airport', toAirport:'Auckland Airport', mins:210, via:[]}`.
  - `parses overnight arrival`: L2 gives arrDate `'2026-12-11'` and mins 215.
  - `parses a stopover`: L3 gives stops 1, mins 1185, via `['Singapore Changi Airport']`.
  - `parses round trip`: L4 gives roundTrip true, price 672.
  - `reads layover and operated-by`: take L3, change the stopover sentence to `Layover (1 of 1) is a 1 hr 5 min layover at Sydney Airport in Sydney.` and add `Operated by Qantaslink - National Jet Systems. ` before `Leaves`. Expect via `['Sydney Airport']` and operated `'Qantaslink - National Jet Systems'`.
  - `rolls the year for January arrival`: L2 with `December 10` → `December 31` and `Friday, December 11` → `Friday, January 1`, searchDate `'2026-12-31'`, gives depDate `'2026-12-31'` and arrDate `'2027-01-01'`.
  - `ignores non-AUD labels`: L1 with `New Zealand dollars` gives `null`. A label without `From <n>` also gives `null`.
  - `rejects labels for another date`: `labelsMatchDate([parseLabel(L1,'2026-12-10')], '2026-12-11') === false`.
  - `filters budget airlines incl. codeshares`: isBudget is true for L2 (`Jetstar`), L3 (`Scoot`), airlines `'Qantas and Jetstar'` and operated `'Jetstar Airways'`. It's false for `'Qantas'` with operated `'Qantaslink - National Jet Systems'`, and false for `'Virgin Australia'`.
  - `bestOptions drops budget and 2+ stops`: [L1, L2, L3] → nonstop price 414, onestop null.
  - `shown rule`: with nonstop {price:517, mins:215}:
    - onestop {price:430, mins:300} → the onestop
    - onestop {price:450, mins:300} → the nonstop
    - onestop {price:430, mins:400} → the nonstop
    - `{nonstop:null, onestop:X}` → X
    - `{nonstop:null, onestop:null}` → null

- [ ] **Step 3: Run `node --test travel/tests/` → fails** (module not found).
- [ ] **Step 4: Implement `travel/lib/flights.js`** with the signatures above. Regexes are position-free (`/flight with ([^.]+)\./`, `/Operated by ([^.]+)\./`, `/(?:stopover|layover) at (.+?) in [^.]+\./g`). Allow `hr`/`hrs` and an optional `min` when parsing durations. Normalise ` ` to a space.
- [ ] **Step 5: Run `node --test travel/tests/` → all pass.**
- [ ] **Step 6: Commit** `git add travel && git commit -m "Travel: routes config, flight label parser and budget-airline filter"`

### Task 2: Search planner

**Files:**
- Create: `travel/lib/plan.js`
- Test: `travel/tests/plan.test.js`

**Interfaces:**
- Consumes: the `routes.json` shape from Task 1; the `data.json` shape from Task 3 (`data.days[dir][date].checked`).
- Produces:
  - `windowDates(today: string, n: number) → string[]` (tomorrow … tomorrow+n−1)
  - `planSearches(routes, data, today) → Search[]`, where Search = `{block, dir, from, to, fromQ, toQ, date}` and dir is `"MEL-AKL"`.
  - Block order, which fixes the searches' order:
    1. `'main'`: main route, window indexes 0–27, nearest date first, alternating MEL-AKL / AKL-MEL for each date.
    2. `'main2'`: main route, indexes 28–55 where `(i + epochDay(today)) % 2 === 0`, same alternation.
    3. `'focus2'`: if `focus2` is set, the same two patterns for it.
    4. `'sample'`: every other direction, at window dates where `epochDay(date) % 7 === 0`. Never-checked comes first, then oldest `checked`, then nearest date.
    5. `'main3'`: the main route's remaining indexes 28–55.
    6. `'rest'`: every other direction's remaining dates, ordered like block 4.

    `epochDay(d) = Date.UTC(d)/864e5`. A direction whose places have extra `q`s (Sydney → WSI) gives one Search per from/to query combination for each date.

- [ ] **Step 1: Write the failing tests** (today `'2026-11-27'`, `routes.json` from Task 1, data `{days:{}}`):
  - `windowDates`: length 56, first `'2026-11-28'`, last `'2027-01-22'`.
  - `main block first`: the first 56 searches are block `'main'`. [0] is `{dir:'MEL-AKL', date:'2026-11-28', fromQ:'MEL', toQ:'AKL'}`, [1] is `{dir:'AKL-MEL', date:'2026-11-28'}`, [55] has date `'2026-12-25'`.
  - `main2 is every other day`: the main2 searches number 28, and their dates are 2 days apart.
  - `main3 covers the rest`: main2 and main3 dates together cover window indexes 28–55 for each main direction, with no overlap.
  - `sample dates are fixed weekdays`: every sample date d satisfies `epochDay(d) % 7 === 0`. Each of the 40 other directions has exactly 8 sample dates. SYD-AKL, AKL-SYD, MEL-SYD and SYD-MEL have 16 sample searches, because each date is searched with both `SYD` and `WSI`.
  - `stale samples first`: with `data.days['AKL-TYO'][d0] = {checked:'2026-11-20'}` and `data.days['TYO-AKL'][d0] = {checked:'2026-11-26'}` at the first sample date d0, and every other sample of those two directions checked `'2026-11-27'`, AKL-TYO d0 comes before TYO-AKL d0 in the sample block.
  - `focus2 after main2`: with `routes.focus2 = ['AKL','TYO']`, the first focus2 search's index is 84 and its block is `'focus2'`.
- [ ] **Step 2: Run `node --test travel/tests/plan.test.js` → fails.**
- [ ] **Step 3: Implement `travel/lib/plan.js`.**
- [ ] **Step 4: Run → passes.**
- [ ] **Step 5: Commit** `"Travel: search planner (main route first, weekly samples for other routes)"`

### Task 3: Data merge, round trips and pruning

**Files:**
- Create: `travel/lib/merge.js`
- Test: `travel/tests/merge.test.js`

**Interfaces:**
- Consumes: `bestOptions`, `shown` (Task 1).
- Produces:
  - data.json shape: `{meta:{lastRun, note, searches, blanks, stoppedBy, coverage}, days:{dir:{date:{checked, nonstop, onestop, hist:[{d,a}]}}}, roundTrips:{dir:[{out, back, price, airlines, checked}]}, sales:{checked, items:[]}}`. `nonstop` and `onestop` are Flights from Task 1 minus `roundTrip`.
  - `emptyData() → data`
  - `applyDay(data, dir, date, flights: Flight[]|null, today, budgetAirlines) → void`
    - `null` or `[]` is a blank: the day is left untouched.
    - Otherwise set nonstop and onestop from `bestOptions`. If `day.checked === today` already (a second query, like WSI, for the same day), keep the cheaper of the old and new options.
    - Set `checked = today`.
    - Upsert `hist` with `{d: today, a: shown(day).price}` (replace today's entry), capped at 60 entries.
  - `applyRoundTrip(data, dir, out, back, flights: Flight[], today, budgetAirlines) → void`: stores `shown(bestOptions(flights))`, upserting by out+back; a blank is ignored.
  - `prune(data, today) → void`: removes days and round trips whose (out) date ≤ today, and caps hist at 60.

- [ ] **Step 1: Write the failing tests:**
  - `applies a day`: applyDay with [L1, L2] parsed for 2026-12-10 → nonstop.price 414, onestop null, checked `'2026-11-27'`, hist `[{d:'2026-11-27',a:414}]`.
  - `blank keeps previous day`: after the above, `applyDay(..., null, '2026-11-28')` and `applyDay(..., [], '2026-11-28')` leave the day deep-equal to before.
  - `second query keeps the cheaper`: on the same today, apply a Qantas non-stop at 380 → nonstop.price 380 and a single hist entry `{a:380}`. Applying a 500 afterwards keeps 380.
  - `round trip upsert`: two applyRoundTrip calls for the same out/back keep one entry with the latest price.
  - `prune drops past days and caps history`: with days on `'2026-11-27'` and `'2026-11-28'` and today `'2026-11-27'`, only `'2026-11-28'` stays. A hist of 70 entries is cut to the newest 60.
- [ ] **Step 2: Run → fails.** **Step 3: Implement `travel/lib/merge.js`.** **Step 4: Run → passes.**
- [ ] **Step 5: Commit** `"Travel: merge search results into the data file"`

### Task 4: Best pairs and notable changes

**Files:**
- Create: `travel/lib/pairs.js`, `travel/lib/notable.js`
- Test: `travel/tests/pairs.test.js`, `travel/tests/notable.test.js`

**Interfaces:**
- Consumes: `shown` (Task 1); the data shape (Task 3).
- Produces:
  - `bestPairs(outDays, backDays, {minNights=3, maxNights=30, limit=10, roundTrips=[]}) → Pair[]`, where Pair = `{out, back, nights, price, outFlight, backFlight, roundTrip}`, sorted by price then nights.
  - `fmtDate('2026-12-10') → 'Thu 10 Dec'`
  - `notable(before, after, routes, today) → string[]`, with the copy below, at most 6 lines, in the order: sales, pair, new lows, drops.

- [ ] **Step 1: Write the failing tests:**
  - `pairs respect nights and use round trips`: out `{'2026-12-10': Qatar 414}`, back `{'2026-12-11': 279, '2026-12-17': 279, '2027-01-25': 250}`, roundTrips `[{out:'2026-12-10', back:'2026-12-17', price:672}]`. Result[0] is `{out:'2026-12-10', back:'2026-12-17', nights:7, price:672, roundTrip:true}`. No pair has nights 1 or 46.
  - `pairs fall back to the one-way sum`: without roundTrips, result[0].price is 693 and roundTrip false.
  - `fmtDate`: `'2026-12-10'` → `'Thu 10 Dec'`.
  - `notable` (after vs before, today `'2026-11-27'`):
    - Before: MEL-AKL 2026-12-07 Air NZ 507 and 2026-12-10 Qatar 517; AKL-MEL 2026-12-11 Qatar 300 and 2026-12-17 Qatar 279. After: the same, except MEL-AKL 2026-12-10 is 470 and AKL-MEL 2026-12-11 is 280, plus a new sale `{airline:'Air New Zealand', dir:'MEL-AKL', price:305, ends:'2026-12-01'}`.
    - The result is exactly, in this order:
      1. `'Sale: Air New Zealand MEL → AKL from $305, ends Tue 1 Dec.'`
      2. `'Best MEL ⇄ AKL pair now $749: out Thu 10 Dec, back Thu 17 Dec (was $786).'`
      3. `'New low for MEL → AKL: $470 on Thu 10 Dec (Qatar Airways).'`
      4. `'MEL → AKL Thu 10 Dec now $470 on Qatar Airways (was $517).'`
    - AKL-MEL 300 → 280 ($20, 6.7%) gets no line, and AKL-MEL's window low stays 279.
    - An unchanged before/after → `[]`.
- [ ] **Step 2: Run → fails.** **Step 3: Implement both modules.** **Step 4: Run → passes.**
- [ ] **Step 5: Commit** `"Travel: best out-and-back pairs and notable changes"`

### Task 5: Google Flights runner and links

**Files:**
- Create: `travel/lib/links.js`, `travel/tools/google.js`
- Test: `travel/tests/links.test.js`

**Interfaces:**
- Consumes: `parseLabel`, `labelsMatchDate` (Task 1).
- Produces:
  - `googleUrl(fromQ, toQ, date, backDate?) → string`. The query is `Flights to ${toQ} from ${fromQ} on ${date} one way`; with a back date it's `... on ${date} through ${backDate}` instead. Append `&curr=AUD&hl=en-AU&gl=AU`.
  - `skyscannerUrl(fromQ, toQ, date) → string`: `https://www.skyscanner.com.au/transport/flights/<from>/<to>/<yymmdd>/`, using lower-case 3-letter codes. City names map to Skyscanner city codes: Tokyo→tyoa, Osaka→osaa, Shanghai→csha, Beijing→bjsa, Guangzhou→can, Shenzhen→szx. Check each one opens the right city in a real browser and fix the map.
  - `airlineUrl(name) → string|null`: a map for Air New Zealand, Qantas, Virgin Australia, Qatar Airways, Emirates, JAL, ANA, Singapore Airlines, Cathay Pacific, China Eastern, China Southern, Air China.
  - `openBrowser() → {browser, ctx}` (proxy from `HTTPS_PROXY`, locale `en-AU`, timezone `Australia/Melbourne`)
  - `robotsAllowsFlights() → {ok, why}`: fetches `https://www.google.com/robots.txt` once and checks that `/travel/flights?q=` isn't disallowed for `*`, using the same longest-match rule as `tools/render_page.js` (copy the logic, don't import it).
  - `search(ctx, fromQ, toQ, date, backDate?) → {status: 'ok'|'blank'|'bot', flights: Flight[]}`
    - Uses a new page.
    - Polls every 1.5 s, up to 25 s, for `[aria-label^="From "]` together with the body text `results returned`. Returns `'bot'` on the bot-check regex and `'blank'` on a timeout or `No results returned`.
    - Clicks the "more flights" button if present and waits 3 s.
    - Reads the unique labels and parses them. Returns `'blank'` if `labelsMatchDate` fails.
    - Closes the page.

- [ ] **Step 1: Write failing tests** for `googleUrl('MEL','AKL','2026-12-10')`, which decodes to a query of exactly `Flights to AKL from MEL on 2026-12-10 one way`; the round-trip form (`through 2026-12-17`); `skyscannerUrl('MEL','AKL','2026-12-10')` → `https://www.skyscanner.com.au/transport/flights/mel/akl/261210/`; and `airlineUrl('Qatar Airways')` starting `https://`.
- [ ] **Step 2: Run → fails.** **Step 3: Implement both files.** **Step 4: Run → passes.**
- [ ] **Step 5: Live check.**
  - Write a throwaway script in the scratchpad (not the repo) that calls `search` for MEL→AKL on the date 14 days ahead.
  - Expected: status `'ok'` and more than 5 flights, with depDate equal to the date searched.
  - Also run one round-trip search. Expected: `roundTrip` true on its flights.
- [ ] **Step 6: Commit** `"Travel: Google Flights runner and search links"`

### Task 6: Airline sale reader

**Files:**
- Create: `travel/tools/sales.js`, `travel/tests/fixtures/airnz-au.html`, `travel/tests/fixtures/airnz-nz.html`
- Test: `travel/tests/sales.test.js`

**Interfaces:**
- Consumes: `routes.json` places (to map city names to codes).
- Produces:
  - `parseAirNZAU(html, routes) → Sale[]`, where Sale = `{airline, dir, price, fare, travel, ends, url}`
  - `parseAirNZNZ(html) → Sale|null`, a headline item `{airline, dir:null, title, ends, url}`
  - `fetchSales(routes, today) → Sale[]`: checks robots.txt for each page, fetches, parses, and drops items with ends < today or a dir not in Ken's directions (a headline has dir null and is kept).

- [ ] **Step 1: Save fixtures:**
  - `curl -sL https://www.airnewzealand.com.au/best-fares` → `airnz-au.html`
  - `curl -sL https://www.airnewzealand.co.nz/best-fares` → `airnz-nz.html` (it redirects to airnewzealand.com/en-nz)
  - Strip the `<script>` blocks to keep the files small.
- [ ] **Step 2: Write failing tests** against the fixtures (captured 2026-11-27):
  - AU includes `{dir:'MEL-AKL', price:305, fare:'seat', ends:'2026-12-01'}` with travel starting `'Economy: 11 Jan - 22 Jan'`.
  - AU also includes `{dir:'SYD-AKL', price:295}`.
  - It has no item for a route outside Ken's pairs, such as Melbourne to Rarotonga.
  - NZ headline: title contains `'Asia'`, ends `'2026-12-03'`.
  - Date parsing: `'Sale ends 11.59pm AEDT, 1 Dec 2026'` → `'2026-12-01'`, and `'Sale ends midnight 3 December 2026'` → `'2026-12-03'`.
- [ ] **Step 3: Run → fails.** **Step 4: Implement.** **Step 5: Run → passes.**
- [ ] **Step 6: Check the Qantas, Virgin Australia and Qatar sale pages.**
  - For each, add a parser (with a fixture and a test) only if robots.txt allows the page and the plain HTML, with no JavaScript run, shows the route, price and end date.
  - Otherwise note it in `travel/README.md` (Task 8) as "not read: <reason>".
- [ ] **Step 7: Commit** `"Travel: airline sale reader (Air NZ)"`

### Task 7: The `check.js` CLI

**Files:**
- Create: `travel/tools/check.js`
- Test: `travel/tests/check.test.js`

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces:
  - `runCheck({data, routes, today, budget=140, minutes=70, searchFn, salesFn, sleepFn}) → Promise<{data, summary: string[]}>`, exported for tests. `searchFn(fromQ, toQ, date, backDate?) → Promise<{status, flights}>` (the CLI binds `search` to its browser context), `salesFn(routes, today) → Promise<Sale[]>`, `sleepFn(ms) → Promise`.
  - CLI: `node travel/tools/check.js travel/data.json [--budget N] [--minutes M]`. It reads `travel/routes.json`, uses the real `search`, `fetchSales` and sleep, writes the data compactly (`JSON.stringify`, UTF-8), and prints the summary lines.
  - Order inside runCheck:
    1. `robotsAllowsFlights()`; stop with `stoppedBy:'robots'` if it fails.
    2. Run the plan's `main` and `main2` searches.
    3. Run round trips for the 3 cheapest distinct main pairs (`bestPairs` on MEL-AKL out and AKL-MEL back), via `searchFn(..., backDate)` with `applyRoundTrip`.
    4. Run the rest of the plan.
    5. Stop on `'bot'`, after 6 blanks in a row, at the budget, or at the time limit.
    6. Then `salesFn`, `prune`, and set `meta` (lastRun with the Melbourne offset, `searches`, `blanks`, `stoppedBy`, and coverage `{mainDaysFresh, otherDaysFresh}` = counts checked today).
    7. Set `meta.note` to one sentence: `Checked 132 searches (9 blank); Melbourne ⇄ Auckland fully up to date; stopped by budget.`
    8. Summary = `notable(before, after, routes, today)` lines, or `No big changes on Melbourne ⇄ Auckland today.`, then the note line.

- [ ] **Step 1: Write failing tests** with a fake `searchFn` that returns L1-based flights for any date (re-dated to the date searched), a fake `salesFn` returning `[]` and a no-op `sleepFn`:
  - `budget is respected`: budget 10 → `meta.searches === 10`, and all 10 are main-route.
  - `bot stops the run`: a searchFn that returns `'bot'` on call 3 → `meta.stoppedBy === 'bot'` and `meta.searches === 3`.
  - `six blanks stop the run`: an always-blank searchFn → `meta.searches === 6` and `stoppedBy === 'blanks'`.
  - `round trips follow the main block`: budget 120 → the 85th–87th searchFn calls (1-based; calls 1–84 are the main and main2 blocks) have a backDate.
  - `summary`: with an empty starting data, the summary's last line starts `Checked`.
- [ ] **Step 2: Run → fails.** **Step 3: Implement.** **Step 4: Run → passes.**
- [ ] **Step 5: Live run, small.**
  - Run `node travel/tools/check.js travel/data.json --budget 8 --minutes 10` (start from `emptyData()` if the file is missing).
  - Expected: it prints a summary, and `travel/data.json` has MEL-AKL and AKL-MEL days checked today.
- [ ] **Step 6: Commit** the CLI and tests, but not `data.json` yet: `"Travel: daily check CLI"`

### Task 8: The app

**Files:**
- Create: `travel/index.html`, `travel/sw.js`, `travel/manifest.webmanifest`, `travel/tools/make_icons.js`, `travel/icon-192.png`, `travel/icon-512.png`, `travel/apple-touch-icon.png`, `travel/README.md`, `travel/tests/fixtures/app-data.json`
- Modify: `sw.js` (root), the two lines in Global Constraints
- Test: `travel/tests/app.test.js`

**Interfaces:**
- Consumes: `shown` (Task 1), `bestPairs` and `fmtDate` (Task 4), `googleUrl`, `skyscannerUrl` and `airlineUrl` (Task 5), and the data shape (Task 3).
- Produces: the page. `?data=<path>` overrides the data URL (used by the test).

- [ ] **Step 1: Write the failing Playwright test.**
  - It starts `python3 -m http.server` on a free port at the repo root and opens `/travel/?data=tests/fixtures/app-data.json` at a 390×844 viewport.
  - The fixture has:
    - MEL-AKL: 2026-12-10 Qatar 414, 2026-12-05 Air NZ 507
    - AKL-MEL: 2026-12-17 Qatar 279
    - a round trip 2026-12-10 → 2026-12-17 at 672
    - one SYD-AKL day
    - one sale (MEL-AKL from $305, ends 2026-12-01)
    - `meta.lastRun`
  - Run it with today frozen at 2026-11-27: inject `Date` through `page.addInitScript`.
  - Assertions:
    - The heading text contains `Melbourne ⇄ Auckland`.
    - The sale banner contains `$305`.
    - The first pair row contains `$672` and `7 nights`.
    - Tapping the calendar cell for 10 Dec shows `Qatar Airways`, `1:20 am` and a link whose href starts `https://www.google.com/travel/flights?q=`.
    - The "Other routes" list has a row containing `Sydney`.
    - The Sydney row, whose fixture day was checked 2026-11-20, shows `7 days ago`.
    - `document.documentElement.scrollWidth <= 390`.
- [ ] **Step 2: Run `node --test travel/tests/app.test.js` → fails.**
- [ ] **Step 3: Build `travel/index.html`.**
  - Copy the liquor app's head metas, colour-token block and `ls$` storage helper (`alcohol/index.html`, lines 1–40 and 119), with a blue accent (`--accent:#0b5cad` light / `#6fb1ff` dark).
  - Load data with `fetch(dataUrl + '?t=' + Date.now(), {cache:'no-store'})`, falling back to the localStorage copy under key `tvl-data`. Show `Offline: showing prices from <date>` when the fallback is used.
  - Home screen, top to bottom:
    - sale banner
    - `Melbourne ⇄ Auckland` with a calendar for each direction
    - "Best pairs", with a nights control (min/max, default 3–30, saved in localStorage under `tvl-nights`)
    - "Other routes", one row per pair with its cheapest out and back and age (`2 days ago`). Tapping a row opens that pair's calendars via `#SYD-AKL`, and Back returns.
  - Calendar cells: the shown price, coloured by quintile within that direction's window (green cheapest → orange dearest). Dim a cell checked more than 2 days ago, and show `–` with no data.
  - Tapping a cell opens a day sheet with:
    - the non-stop and one-stop options (airline, times, `+1` when arrDate > depDate, duration, stops and via, price)
    - when the airline is Air New Zealand, the note `Cheapest fare may not include a checked bag.`
    - Google Flights, Skyscanner and airline links
- [ ] **Step 4: Add `travel/manifest.webmanifest`** (name "Flight Prices", short_name "Flights", start_url and scope `./`, standalone). Add `travel/sw.js`, copied from `alcohol/sw.js` with `CACHE='tvl-v1'` and `lib/*.js` in SHELL. Generate the icons with `make_icons.js` (Playwright screenshots of an inline SVG plane on the accent colour at 512, 192 and 180). Apply the root `sw.js` change.
- [ ] **Step 5: Run `node --test travel/tests/` → all pass.** Also load `/` and `/alcohol/` in the same server and check each still shows its own heading, so the fragrance and liquor apps aren't broken.
- [ ] **Step 6: Write `travel/README.md`** in the style of `alcohol/README.md`: install steps, where prices come from (Google Flights `?q=` pages; robots.txt rules; the bot-check stop), sale pages read and not read, how to change the focus (edit `routes.json` `focus2`, or ask Claude), and the daily task.
- [ ] **Step 7: Commit** `"Travel: iPhone app for flight prices"`

### Task 9: First full run and handover

**Files:**
- Modify: `travel/data.json` (generated)

- [ ] **Step 1: Run the full check:** `node travel/tools/check.js travel/data.json --budget 140 --minutes 70`, in the background, waiting on its exit. Expected: it ends with a summary. Note `meta.searches`, `blanks` and `stoppedBy` as the first measurement of the real budget.
- [ ] **Step 2: Tune the budget.** If `stoppedBy` is `'bot'` or `'blanks'` before about 80 searches, lower the CLI default budget to 10 below that count and retest Task 7. Otherwise keep 140.
- [ ] **Step 3: Serve the app locally with the real `data.json` and take a phone-size screenshot.** Expected: the Melbourne ⇄ Auckland calendars are filled for the next 4 weeks.
- [ ] **Step 4: Commit and push** `"Travel: first flight prices"` to `claude/elegant-clarke-u8tocx`.
- [ ] **Step 5: Ask Ken whether to open a pull request into `main`.** GitHub Pages serves `main`, so the app is live only after the merge. Don't open the pull request without his yes.
- [ ] **Step 6: After the merge, create the scheduled task** with `create_trigger`:
  - name `Flight price check`, cron `CRON_TZ=Australia/Melbourne 43 4 * * *`, `create_new_session_on_fire: true`, notifications `{push: true}`, initiation `human_request`
  - prompt below, verbatim

```
You are running the daily flight price check for Ken's travel app. Do the whole check yourself; nobody is watching, so don't ask questions. "Today" is the current date in Australia/Melbourne (YYYY-MM-DD).

THE APP: a static iPhone web app in the folder travel/ of the GitHub repository kennethhuang2812-stack/fragrance-tracker (GitHub Pages, branch main). It reads travel/data.json. Never touch anything outside travel/.

1. Attach the repository with push access (Claude_Code_Remote add_repo tool; load it with ToolSearch if deferred) and clone it with depth 1 on main.
2. Run: node travel/tools/check.js travel/data.json  (it can take over an hour, so run it in the background and wait for it to exit). Playwright and Chromium are already installed; never install them. The script reads only Google Flights pages of the form https://www.google.com/travel/flights?q=..., which Ken approved for this app, one search at a time, and stops on a bot check. Never change it to get around a bot check, never change the browser's user agent, and never load /travel/flights/search or any page robots.txt disallows.
3. If the script fails with an error, read the error, fix the script only if the fix is small and obvious (for example Google changed a label), run node --test travel/tests/ to confirm, and run it again once. Otherwise leave data.json as it was.
4. Commit only travel/data.json (plus travel/tools or travel/lib changes if you had to fix the checker) with the message "Update flight prices <today>" and push to main. If the push is rejected because main moved, run git pull --rebase once and push again. If pushing still fails, say so in the summary with the exact error.
5. End with the summary lines the script printed (under 8 lines), leading with anything notable on Melbourne ⇄ Auckland, and say whether the app was updated.
```

- [ ] **Step 7: Tell Ken** the app's address (`<pages-url>/travel/`), how to add it to the Home Screen, and when the daily check runs.
