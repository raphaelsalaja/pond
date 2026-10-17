# `core/sync`

Top-level sync orchestration: turn "import everything I've saved through an
Account or Watch" into idempotent enqueues into the URL-first ingest pipeline,
safely and incrementally.

`syncAccount(accountId, opts)` is the Account unit of work.
`syncSource(source, opts)` coordinates every Account and Watch for one Source,
and `syncAllSources(opts)` fans out across connected Sources. They accept
`{ trigger: "manual" | "cron", maxItems?, forceFull? }`.

## How a run flows

```
syncAccount(accountId)
  → loadSyncBaseline(account, forceFull)  # full set OR bounded recent window
  → harvestSourceList / harvestTwitterBookmarks  # paced by the governor, early-stops on known ids
  → dedupe vs knownIds → fresh / recovery
  → enqueue(fresh)                        # one chunked, transactional insert path
  → persistWatermark(accountId)           # only AFTER a successful enqueue
```

### Incremental cursor (watermark)

Per-Account state lives under `prefs.sync.accounts[accountId].sync`
(`SourceSyncPrefs`).

- `highWaterMark` — most recent source id we've enqueued (lists are newest-first).
- `lastFullSyncAt` — gates the expensive full-list walk vs the cheap incremental
  walk. A run is **full** on the very first sync (none recorded) or when
  `forceFull` is set; otherwise it's **incremental**.
- `knownCount` — library size at last sync (UI + sanity).
- `runningSince` — set while a run is in flight, cleared when it finishes. A value
  still present at startup means the previous run was interrupted (crash /
  force-quit); `recoverInterruptedSyncs()` clears it and records an honest
  `lastError: "interrupted"` so the UI never shows a stuck spinner. Re-running is
  safe because watermarks are only advanced after a successful enqueue.

Incremental runs load only a bounded **recent window** of known ids
(`RECENT_KNOWN_WINDOW`) instead of the whole library, and the harvesters
**early-stop** once they hit a streak of already-known ids — so a no-op sync is
cheap and a sync with N new items walks roughly N items, not the entire backlog.

**Full re-sync escape hatch:** pass `forceFull: true` (exposed over IPC via
`syncRunNow` / `syncRunAll`) to ignore the watermark and walk the whole remote
list — for drift recovery.

### Import scope

`SourceSyncPrefs.importScope` says which lists an Account imports. Omitted
means everything, so Accounts connected before scopes existed keep their
behavior. `listHarvestPlan` (`import-scope.ts`) turns the scope into the walks
a run makes: excluded lists are never requested, rather than harvested and
filtered afterward.

- Instagram, X, and YouTube: Saved and Liked, each on its own walk. X Likes
  used to be the `syncLikes` switch; `accountImportScope` (`shared/import-scope.ts`)
  reads an old `syncLikes: false` as Bookmarks only.
- Reddit and TikTok: Saved and Liked come from one walk, which reads
  `ListHarvestArgs.listKinds` and skips the listing or tab you left out.
- Collections narrow the saved list: Pinterest boards, Instagram collections,
  X bookmark folders, and YouTube playlists (Watch Later stays the default).
  `listSourceCollections` and `harvestSourceCollections`
  (`harvest-window/harvest-list.ts`) load and walk them.
- Cosmos, Are.na, and Threads import every list.

A save harvested from chosen collections is filed into Folders named
`<Source>/<collection>` (`collection-folders.ts`). Harvesters tag each entry
with `collectionIds` as they merge collections (`addCollectionEntry`), and the
run files every harvested entry, not just new ones, so a full walk after a
scope change files saves Pond already had. Filing adds to a save's Folders and
never removes one. `SourceSyncPrefs.collectionFolders` remembers each
collection's Folder id, so renaming the Folder keeps it in use; a deleted one
is created again. `importScope.addToFolders: false` turns filing off.

Media kinds and a `since` date are filters, not walks: list data is too patchy
to judge a post before capture, and filtering early would break early stop.
`applyImportFilter` (`pipeline/import-filter.ts`) runs in `harvest_metadata`,
marks a filtered save `skipped` with `rawJson.importFilter`, and cancels its
remaining tasks. Skipped saves stay in the sync baseline, so they aren't
fetched again. A post with no publish date is kept.

A newly connected Account is created with `importPending: true`, and
`syncAccount` returns idle without harvesting until you pick a scope through
`accounts.setImportScope`. Changing the scope clears `lastFullSyncAt` and
`resumeCursor`, so the next run is a full walk and early stop can't skip older
items in a newly added list. It also purges saves the old filters skipped
(`releaseFilteredSaves`), so that walk judges them again under the new scope.

## Account safety (it defers entirely to the governor)

Every platform request is gated by the rate governor (see
[`core/refresh/README.md`](../refresh/README.md) and
[`core/pipeline/rate-governor.ts`](../pipeline/rate-governor.ts)). Harvesters
back off (never escalate) on 429, persist cooldowns across restart, and hard-stop
on challenge/checkpoint. `syncAllSources` runs sources **concurrently**, but real
concurrency is bounded by the shared hidden-window pool and the per-account
governor; sources hit different domains, so parallelism across sources doesn't
raise per-account risk.

### Background cron

`registerSyncCron()` in [`main/index.ts`](../../index.ts) polls every 30m and runs
`syncAllSources({ trigger: "cron" })` when due. It is the highest account-risk
path (unattended), so it is the most conservative: pref-gated
(`prefs.sync.cron`, default every 6h), connected-only, skipped while offline /
storage-guarded / a run is in flight, with jittered start times so many installs
don't hit a platform in lockstep.

## Ingest write path (batched + non-blocking-ish)

Fresh URLs go through `enqueue` (`core/pipeline/enqueue.ts`): rows are
built then committed in **bounded chunks, one transaction per chunk**, yielding to
the event loop between chunks. SQLite is synchronous (`better-sqlite3`) and runs
on the main thread, so a single giant transaction would freeze the UI on a 50k
first sync; bounded chunks keep each blocking burst short while still being
10–100× faster than per-URL writes. (A full out-of-process `utilityProcess` DB is
a future step; the chunked/yielding path is the safe interim.)

The renderer stays in sync via the incremental `syncAction` broadcast model —
each created/updated save emits a `sync_actions` row that the renderer store
applies, so the UI never re-queries the whole library.
