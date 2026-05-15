export const DEFAULT_INGEST_PORT = 41610;

export const DEFAULT_LIBRARY_NAME = "My Pond";

export const LIBRARY_SCHEMA_VERSION = 1;

export const KEYCHAIN_SERVICE = "so.pond.desktop";

export const KEYCHAIN_INGEST_TOKEN = "ingest-token";
export const KEYCHAIN_AI_GATEWAY_KEY = "ai-gateway-api-key";

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
  revealSave: "pond:reveal-save",
  openSaveFile: "pond:open-save-file",
  saveContextMenu: "pond:save-context-menu",
  refreshSave: "pond:refresh-save",
  refreshBackfillStart: "pond:refresh-backfill-start",
  refreshBackfillCancel: "pond:refresh-backfill-cancel",
  refreshBackfillStatus: "pond:refresh-backfill-status",
  sourceConnect: "pond:source-connect",
  sourceDisconnect: "pond:source-disconnect",
  sourceStatus: "pond:source-status",
  videoToolsStatus: "pond:video-tools-status",
  videoToolsReinstall: "pond:video-tools-reinstall",
  videoRegeneratePosters: "pond:video-regenerate-posters",
  videoRedownload: "pond:video-redownload",
  autoVideoStatus: "pond:auto-video-status",
  syncRunNow: "pond:sync-run-now",
  syncCancel: "pond:sync-cancel",
  syncStatus: "pond:sync-status",
  syncRunAll: "pond:sync-run-all",
  syncSchedulePeek: "pond:sync-schedule-peek",
  syncSchedulePush: "pond:sync-schedule-push",
  storageStatus: "pond:storage-status",
  editUndoRequested: "pond:edit-undo-requested",
  editRedoRequested: "pond:edit-redo-requested",
  safetyScanStart: "pond:safety-scan-start",
  safetyScanCancel: "pond:safety-scan-cancel",
  safetyScanStatus: "pond:safety-scan-status",
  suggestionShow: "pond:suggestion-show",
  suggestionDismiss: "pond:suggestion-dismiss",
  suggestionAct: "pond:suggestion-act",
  suggestionReady: "pond:suggestion-ready",
  suggestionNotify: "pond:suggestion-notify",
  notificationShow: "pond:notification-show",
} as const;
