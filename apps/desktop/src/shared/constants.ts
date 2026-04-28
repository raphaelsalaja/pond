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

/** Keychain service identifier used by `keytar`. */
export const KEYCHAIN_SERVICE = "so.pond.desktop";

/** Keychain account names. */
export const KEYCHAIN_INGEST_TOKEN = "ingest-token";
export const KEYCHAIN_AI_GATEWAY_KEY = "ai-gateway-api-key";

/** Custom protocol we register for `pond://<itemId>/<file>` URLs. */
export const POND_PROTOCOL = "pond";

/** IPC channel names. */
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
} as const;
