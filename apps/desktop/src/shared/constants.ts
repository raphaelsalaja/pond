export const DEFAULT_INGEST_PORT = 41610;

export const DEFAULT_LIBRARY_NAME = "My Pond";

export const LIBRARY_SCHEMA_VERSION = 1;

export const KEYCHAIN_SERVICE = "so.pond.desktop";

export const KEYCHAIN_INGEST_TOKEN = "ingest-token";

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
  refreshSave: "pond:refresh-save",
  refreshBackfillStart: "pond:refresh-backfill-start",
  refreshBackfillCancel: "pond:refresh-backfill-cancel",
  refreshBackfillStatus: "pond:refresh-backfill-status",
  sourceConnect: "pond:source-connect",
  sourceDisconnect: "pond:source-disconnect",
  sourceStatus: "pond:source-status",
  videoToolsStatus: "pond:video-tools-status",
  videoToolsReinstall: "pond:video-tools-reinstall",
  videoRedownload: "pond:video-redownload",
  syncRunNow: "pond:sync-run-now",
  syncCancel: "pond:sync-cancel",
  syncStatus: "pond:sync-status",
  syncRunAll: "pond:sync-run-all",
  syncSchedulePeek: "pond:sync-schedule-peek",
  syncSchedulePush: "pond:sync-schedule-push",
  storageStatus: "pond:storage-status",
  editUndoRequested: "pond:edit-undo-requested",
  editRedoRequested: "pond:edit-redo-requested",
  suggestionShow: "pond:suggestion-show",
  suggestionDismiss: "pond:suggestion-dismiss",
  suggestionAct: "pond:suggestion-act",
  suggestionReady: "pond:suggestion-ready",
  suggestionNotify: "pond:suggestion-notify",
  notificationShow: "pond:notification-show",
  processingProgress: "pond:processing-progress",
  tabNew: "pond:tab-new",
  tabClose: "pond:tab-close",
  tabNext: "pond:tab-next",
  tabPrev: "pond:tab-prev",
  tabReopen: "pond:tab-reopen",
} as const;
