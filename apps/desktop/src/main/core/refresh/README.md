# `core/refresh`

Hidden-Chromium page harvesting + list-import helpers used by the
URL-first ingest pipeline.

- `index.ts` exposes `refreshSave(saveId)` — refresh in the URL-first
  world is "reset the task rows back to `pending` and bump the
  reconciler". The `harvest_metadata` worker re-runs and rebuilds the
  `Capture` from scratch.
- `scrape-window.ts` is a small pool of hidden `BrowserWindow`s. The
  pipeline's `fetch-in-window` helper calls `harvestUrl({ url, source,
  sourceId })` against it for any auth-walled site that doesn't ship
  usable SSR HTML.
- `harvest/<source>/item.ts` are the in-page DOM scrapers. They serialise
  themselves to a JS expression, run inside the hidden window, and the
  main-side `adapt()` validates the JSON they return into a
  `ScrapedHarvest`. Each extractor in
  `core/pipeline/extractors/sources/` builds its `Capture` from that.
- `harvest/<source>/list.ts` + `harvest/<source>/api.ts` cover the
  "import everything I've ever saved on X" flow. List harvesters emit
  `ListEntry { sourceId, url, ... }`; the sync layer just enqueues each
  `url` into the URL-first pipeline.
- `yt-dlp.ts` covers video downloads only, gated by user prefs.

> **Adding a new source?** Read
> [`harvest/CAPTURE-STANDARD.md`](harvest/CAPTURE-STANDARD.md) first.
> Everything the page exposes ends up on the universal
> [`Capture`](../../../../../../packages/schema/src/raw.ts) shape — there
> is no per-source persistence DTO any more. The current per-source
> coverage matrix lives in [`harvest/COVERAGE.md`](harvest/COVERAGE.md).
