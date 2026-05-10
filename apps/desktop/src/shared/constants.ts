/**
 * Runtime constants shared across main, preload and renderer.
 * Must stay free of any Node / Electron / DOM imports so every
 * process can `import` it safely.
 */

/** Default loopback port we advertise on. Offset from Eagle's 41595 so both can coexist. */
export const DEFAULT_INGEST_PORT = 41610;

/** Default library folder name created on first launch. */
export const DEFAULT_LIBRARY_NAME = "My Pond";

/** Schema version baked into every `metadata.json` we write. Bump on breaking changes. */
export const LIBRARY_SCHEMA_VERSION = 1;

/** Keychain service identifier used by `@napi-rs/keyring`. */
export const KEYCHAIN_SERVICE = "so.pond.desktop";

/** Keychain account names. */
export const KEYCHAIN_INGEST_TOKEN = "ingest-token";
export const KEYCHAIN_AI_GATEWAY_KEY = "ai-gateway-api-key";

/** Custom protocol we register for `pond://<itemId>/<file>` URLs. */
export const POND_PROTOCOL = "pond";

export const IPC = {
  tx: "pond:tx",
  txBatch: "pond:tx-batch",
  undo: "pond:undo",
  redo: "pond:redo",
  query: "pond:query",
  syncAction: "pond:sync-action",
  appInfo: "pond:app-info",
  nav: "pond:nav",
  openExternal: "pond:open-external",
  // Filesystem affordances. The renderer never sees absolute paths on
  // disk — it passes the save id (plus optional file index) and main
  // resolves the on-disk path from the DB. This keeps a compromised
  // renderer from handing `shell` an arbitrary file.
  revealSave: "pond:reveal-save",
  openSaveFile: "pond:open-save-file",
  saveContextMenu: "pond:save-context-menu",
  // In-app refresh: server-side OG → hidden BrowserWindow harvester →
  // merge into the existing save. Replaces the old "open the URL in a
  // browser and rely on the extension" flow for the common case.
  refreshSave: "pond:refresh-save",
  // Bulk metadata refresh. Walks every existing save (optionally
  // filtered by source / "missing fields only") and re-runs the
  // `refreshSave` pipeline against each row. The renderer reads a
  // one-shot snapshot via `invoke(refreshBackfillStatus)` and
  // subscribes to push events on the same channel.
  refreshBackfillStart: "pond:refresh-backfill-start",
  refreshBackfillCancel: "pond:refresh-backfill-cancel",
  refreshBackfillStatus: "pond:refresh-backfill-status",
  // Connected-sources UX. The desktop keeps a persistent session
  // partition so the user can sign in once per source from settings.
  sourceConnect: "pond:source-connect",
  sourceDisconnect: "pond:source-disconnect",
  sourceStatus: "pond:source-status",
  // Bundled CLI binaries (yt-dlp, ffmpeg) used by the in-app video
  // download path. The settings page surfaces both so the user can
  // tell whether refreshing a video card will produce playable bytes.
  videoToolsStatus: "pond:video-tools-status",
  videoToolsReinstall: "pond:video-tools-reinstall",
  // Renderer → main heal channel. Fired when a `<video>` element errors
  // (typically because a previous yt-dlp run landed an AV1/HEVC stream
  // Electron's bundled ffmpeg can't decode). Main re-runs yt-dlp with
  // the corrected H.264-only selector and overwrites the bad bytes.
  videoRedownload: "pond:video-redownload",
  // Main → renderer broadcast: snapshot of the auto-video queue (saves
  // currently being downloaded by yt-dlp in the background). Drives the
  // grid + preview "downloading…" indicator so the user knows their
  // freshly-saved video is still landing on disk.
  autoVideoStatus: "pond:auto-video-status",
  // Background sync controls. The orchestrator opens the user's logged-in
  // bookmarks page in the hidden scrape window, dedupes against the local
  // saves table, and ingests new items through the regular harvester →
  // ingest pipeline. The renderer surfaces controls per source under
  // Settings → Connected accounts → <source> and via the Cmd+K palette.
  syncRunNow: "pond:sync-run-now",
  syncCancel: "pond:sync-cancel",
  syncStatus: "pond:sync-status",
  // Main → renderer broadcast: storage guard state. The watcher in
  // `core/storage-watcher.ts` ticks on a configurable cadence; each
  // tick (as well as every renderer-driven `applyStorageWatcherPrefs`
  // call) emits a `StorageGuardStatus` so the Settings → Storage
  // page can render an "All clear / approaching limit / exceeded"
  // indicator without polling.
  storageStatus: "pond:storage-status",
  // Main → renderer pump for the Edit menu's Undo / Redo items. We
  // intentionally do NOT use `globalShortcut.register` for Cmd+Z —
  // that hijacks the shortcut OS-wide and breaks undo in every other
  // app while pond is running. Instead the menu accelerator fires the
  // click handler in main; main calls `webContents.undo/redo()` so
  // native input undo still works in focused text fields, and emits
  // these events so the renderer can run pond's transactional undo
  // when focus is *outside* an editable element.
  editUndoRequested: "pond:edit-undo-requested",
  editRedoRequested: "pond:edit-redo-requested",
} as const;
