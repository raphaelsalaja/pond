# `core/refresh`

Per-save metadata refresh + per-source harvesters live here.

- `index.ts` decides between the cheap server-side OG path
  (`og.ts`) and the hidden Chromium harvester (`scrape-window.ts`)
  for auth-walled sources.
- `harvest/<source>.ts` files are the in-page scrapers run inside
  the hidden window. They serialise themselves to a string and
  return a normalised `ScrapedHarvest`.
- `yt-dlp.ts` covers video downloads, gated by user prefs.

> **Adding a new source?** Read
> [`harvest/CAPTURE-STANDARD.md`](harvest/CAPTURE-STANDARD.md)
> first — every source-agnostic field that the page exposes goes
> on `IngestPayload`, and source-specific fields go on
> `raw.<source>`. The current per-source coverage matrix lives in
> [`harvest/COVERAGE.md`](harvest/COVERAGE.md).
