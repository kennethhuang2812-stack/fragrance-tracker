# Fragrance price tracker: iPhone app

An installable web app (PWA) built from the Claude artifact. No App Store needed.

Files: index.html (the app), data.json (prices), manifest.webmanifest + icons (home screen icon and name), sw.js (offline support).

## Install on iPhone
1. Put this folder on any HTTPS host (GitHub Pages, Netlify Drop, Cloudflare Pages).
2. Open the URL in Safari, tap Share, then Add to Home Screen.
3. It opens full screen with its own icon and works offline with the last prices it saw.

## Keeping prices fresh
The daily price check writes to the artifact's database. To update the app, replace data.json on the host with a fresh export of products, retailers, listings and meta/status (same shape as the current file).

Watchlist stars and targets set in the app are saved on the phone only.

## Other apps in this repo
- `alcohol/`: Melbourne liquor price tracker.
- `jobs/`: Job Radar, one search across job boards and company career pages, with an application tracker.
