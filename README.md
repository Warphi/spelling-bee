# Spelling Bee (clone)

A personal, non-commercial clone of the NYT Spelling Bee.

## How it works

The NYT Spelling Bee page (`nytimes.com/puzzles/spelling-bee`) embeds the full
puzzle — center letter, outer letters, pangrams, and the complete answer list —
in a `window.gameData = {...}` blob in its public HTML, with no auth. We extract
that and serve a clean, static game around it (no ads, paywall, or tracking).

The browser validates guesses against the scraped answer list, with NYT scoring
(4-letter = 1 pt, longer = length, pangram = length + 7) and the full
Beginner → Genius → Queen Bee rank ladder.

## Hosting (GitHub Pages)

Pages only serves static files, so the scrape runs in CI, not at request time:

- `scripts/scrape.mjs` fetches the NYT page and writes `public/puzzle.json`.
- `.github/workflows/deploy.yml` runs it on a daily cron (just after the ~3am ET
  rollover), then deploys `public/` to GitHub Pages. No server, no daily commits.
- The page fetches `puzzle.json` (relative), so it works under the Pages subpath.

The site is marked `noindex` and has a `Disallow: /` robots.txt to keep it out of
search engines. It is personal and non-commercial; all puzzle data is © NYT.

## Local development

```
./run.sh            # or: node server.js  (if node is on PATH)
```

`server.js` serves `public/` and also answers `/puzzle.json` by scraping live
(cached, rolling over at midnight ET) — so the same front-end works locally.
Open http://localhost:3000. Set `PORT` to change the port.
