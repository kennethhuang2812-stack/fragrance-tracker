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
- **Search syntax:** `designer -senior "product manager" react|vue` (all words must match, `-word` excludes, quotes for phrases, `a|b` for either).
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

Seek, LinkedIn and Indeed have no public feed, so they can't be included. Paste a job from them with **Tracker › Add a job by hand** to track it with the rest.

## Data
Settings, tracker, hidden lists and saved searches live in the browser's storage on this device. **Sources › Backup** exports and imports them as one JSON file.
