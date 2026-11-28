# Job Radar: one search across job boards and company career pages

An installable web app (PWA), the same idea as the fragrance and liquor trackers. No server and no account: the phone reads each source's public feed directly and keeps everything on the device.

## Install on iPhone
1. Once this folder is on GitHub Pages, open `<pages-url>/jobs/` in Safari.
2. Tap Share, then Add to Home Screen. It opens full screen as "Jobs".

## How it's better than a single job site
- **One search, many sources.** Job boards plus companies' own career pages, in one list.
- **Duplicates merged.** The same role on several sites becomes one listing ("On 3 sites"), with the company's own page first. The same role in several cities becomes one listing ("4 openings").
- **Straight from the company.** Follow a company's Greenhouse, Lever or Ashby careers page and see its jobs the moment they're posted, often before they reach job boards.
- **"NEW" since your last refresh**, and **saved searches** that show how many new jobs match.
- **Real filters:** remote only, salary shown, minimum yearly pay, posted within, job type, location (optionally including worldwide-remote jobs), source.
- **Search syntax:** `finance|accounting -senior "no experience"` (all words must match, `-word` excludes, quotes for phrases, `a|b` for either).
- **Hide what you never want:** single jobs, whole companies, or title words ("senior", "sales", "unpaid").
- **Old-posting warning** on listings over 60 days old, which are often already filled.
- **Application tracker:** Saved → Applied → Interviewing → Offer / Rejected / Withdrawn, with applied date, follow-up date (set to a week after applying), notes, a "follow-up due" count, reply rate, a **Listing gone** flag when a job you're tracking disappears, and CSV export.

## Sources
| Source | What | Notes |
|---|---|---|
| Remotive | remote jobs | public API, on by default |
| Remote OK | remote jobs, mostly tech | public API, on by default |
| Jobicy | remote jobs, all fields | public API, latest 100, on by default |
| Arbeitnow | Europe, mostly Germany | public API, off by default (it floods the list with German jobs) |
| Greenhouse / Lever / Ashby | any company that uses them | add by careers link or name; Airwallex, Xero, Culture Amp and Deputy are followed to start with |

## Seek, LinkedIn, Indeed and Jora
These have no public feed and block automated reading, so their jobs can't be pulled into the list. Instead, the **Also search** buttons under the filters run whatever you've searched in the app on each site, opening in your browser:

| Site | What carries over |
|---|---|
| Seek | words (with or / not), location, posted within, job type; Remote and Entry level go in as extra words |
| LinkedIn | words (OR / NOT), location, Remote, Entry level (internship + entry level), posted within, job type |
| Indeed | words, location, Remote, Entry level, posted within (up to 14 days) |
| Jora | the first word or phrase, location, plus "remote" / "entry level" |

Location defaults to all of Australia. To track a job you found there, use **Tracker › Add a job by hand**.

## Finance searches set up from the start
Saved searches, each showing how many new jobs match, and each one also runs on Seek, LinkedIn, Indeed and Jora:
Finance · Entry-level finance · Remote finance · No experience · Banking · Commercial banking.

Finance companies followed from the start: Zip, Block (Afterpay), Wise, Prospa, Plenti (more in Quick add). Jobicy's finance section is read as well. The big four banks and Macquarie aren't on Greenhouse, Lever or Ashby, so the app can't follow them directly; the Seek and LinkedIn buttons cover them.

The **Entry level** filter keeps jobs with a junior title (graduate, junior, trainee, intern, assistant…) or a description that says so ("no experience required", "0–2 years"), and drops senior, lead, manager and director titles.

Plain words search job titles, companies, tags and locations; "quoted phrases" also search descriptions.

## Data
Settings, tracker, hidden lists and saved searches live in the browser's storage on this device. **Sources › Backup** exports and imports them as one JSON file.
