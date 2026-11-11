# `core/refresh`

Hidden-Chromium page harvesting + list-import helpers used by the
URL-first ingest pipeline.

- `index.ts` exposes `refreshSave(saveId)`. Refresh in the URL-first
  world is "reset the task rows back to `pending` and bump the
  reconciler". The `harvest_metadata` worker re-runs and rebuilds the
  `Capture` from scratch.
- `harvest-window/` is a small pool of hidden `BrowserWindow`s.
  `captureFromSource` returns a Capture: Source APIs where they exist,
  otherwise `harvestUrl` against the window pool.
- `harvest/<source>/item.ts` are the in-page DOM scrapers. They serialise
  themselves to a JS expression, run inside the hidden window, and
  `adapt()` validates the JSON into a `Capture`.
- `harvest/<source>/list.ts` + `harvest/<source>/api.ts` cover the
  "import everything I've ever saved on X" flow. List harvesters emit
  `ListEntry { sourceId, url, ... }`; the sync layer just enqueues each
  `url` into the URL-first pipeline.
- `yt-dlp.ts` covers video downloads only, gated by user prefs.

> **Adding a new source?** Read
> [`harvest/CAPTURE-STANDARD.md`](harvest/CAPTURE-STANDARD.md) first.
> Everything the page exposes ends up on the universal
> [`Capture`](../../../../../../packages/schema/src/raw.ts) shape. There
> is no per-source persistence DTO any more. The current per-source
> coverage matrix lives in [`harvest/COVERAGE.md`](harvest/COVERAGE.md).

## Account safety: the rate governor

Pond scrapes through each user's **own logged-in session**, so the highest-risk
outcome is tripping a platform's anti-abuse systems against a real account. Every
network request that touches a platform — list harvest, item harvest, and
screenshot navigation — is gated by one shared governor in
[`core/pipeline/rate-governor.ts`](../pipeline/rate-governor.ts):

- **`await acquire(source)` before, `report(source, …)` after.** `acquire` blocks
  until it's safe (per-source spacing + human jitter, rolling per-window budget,
  cooldowns, circuit breaker, manual/at-risk pauses). The hidden-window pool
  (`harvest-window/pool.ts`) calls `acquire` inside `leaseWindow`, so anything that
  leases a window is automatically paced.
- **Respect platform signals.** `report` reads `retry-after` /
  `x-rate-limit-remaining` / `x-rate-limit-reset` and adjusts pacing (AIMD) and
  cooldowns. Harvesters return `rate_limited` on HTTP 429 and **never** escalate
  to the noisier scroll path.
- **Persisted.** Cooldowns and at-risk state live in `userData/rate-governor.json`
  so a crash/relaunch loop can't re-hammer a penalised account.
- **Danger detection.** A login/challenge/checkpoint/captcha redirect mid-harvest
  marks the source "at risk" and hard-stops it with honest UX copy.
- **Sign-in stop.** The first queued task that fails with `AuthRequiredError`
  opens the source gate with reason `auth_required` for 24 hours, parks the
  source's other queued requests, and marks its Account as needing sign-in.
  Successes, backoffs, and global pauses never lift it; reconnecting with new
  credentials, retrying, a manual sync, or resuming the source does.

The per-source pacing profile + sync strategy are declared **once** in the source
descriptor (`packages/schema/src/sources/registry.ts`) with conservative safe
defaults, so a new source is protected without any tuning. See
[`core/sync/README.md`](../sync/README.md) for how harvest, the governor, the
watermark cursor, and the off-thread-ish ingest path fit together.
