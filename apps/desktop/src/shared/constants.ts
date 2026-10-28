import type { ExternalSource } from "@pond/schema/sources";
import type { BlankDocumentKind } from "./blank-documents";

export const DEFAULT_INGEST_PORT = 41610;

export const DEFAULT_LIBRARY_NAME = "My Pond";

export const LIBRARY_SCHEMA_VERSION = 1;

export const KEYCHAIN_SERVICE = "so.pond.desktop";

export const KEYCHAIN_INGEST_TOKEN = "ingest-token";
export const KEYCHAIN_API_TOKENS = "api-tokens";

export const KEYCHAIN_AGENT_PREFIX = "agent";

export const POND_PROTOCOL = "pond";

export const IPC = {
  tx: "pond:tx",
  txBatch: "pond:tx-batch",
  undo: "pond:undo",
  redo: "pond:redo",
  query: "pond:query",
  syncAction: "pond:sync-action",
  appInfo: "pond:app-info",
  rendererReady: "pond:renderer-ready",
  nav: "pond:nav",
  windowFullScreen: "pond:window-full-screen",
  prefsChanged: "pond:prefs-changed",
  openExternal: "pond:open-external",
  revealSave: "pond:reveal-save",
  openSaveFile: "pond:open-save-file",
  refreshSave: "pond:refresh-save",
  refreshBackfillStart: "pond:refresh-backfill-start",
  refreshBackfillCancel: "pond:refresh-backfill-cancel",
  pipelinePause: "pond:pipeline-pause",
  pipelineCancelSaves: "pond:pipeline-cancel-saves",
  pipelineCancelAll: "pond:pipeline-cancel-all",
  sourceConnect: "pond:source-connect",
  sourceConnectHandle: "pond:source-connect-handle",
  sourceStatus: "pond:source-status",
  sessionPendingClear: "pond:session-pending-clear",
  sessionImported: "pond:session-imported",
  sessionImportFailed: "pond:session-import-failed",
  eagleImportProgress: "pond:eagle-import-progress",
  syncRunNow: "pond:sync-run-now",
  syncStatus: "pond:sync-status",
  machinePace: "pond:machine-pace",
  machinePaceChanged: "pond:machine-pace-changed",
  syncRunAll: "pond:sync-run-all",
  syncCancel: "pond:sync-cancel",
  governorSetPaused: "pond:governor-set-paused",
  governorResumeSource: "pond:governor-resume-source",
  storageStatus: "pond:storage-status",
  updateNotice: "pond:update-notice",
  editUndoRequested: "pond:edit-undo-requested",
  editRedoRequested: "pond:edit-redo-requested",
  shortcutAction: "pond:shortcut-action",
  menuAction: "pond:menu-action",
  libraryId: "pond:library-id",
  menuRecents: "pond:menu-recents",
  menuOpenSave: "pond:menu-open-save",
  openFiles: "pond:open-files",
  archiveNavigate: "pond:archive-navigate",
  archiveBackfillStart: "pond:archive-backfill-start",
  archiveSite: "pond:archive-site",
  agentChunk: "pond:agent-chunk",
  fish: "pond:fish",
  fishOpen: "pond:fish-open",
  agentStream: "pond:agent-stream",
  agentFilter: "pond:agent-filter",
  agentCite: "pond:agent-cite",
  agentOverlay: "pond:agent-overlay",
  previewOpen: "pond:preview-open",
  previewConfigure: "pond:preview-configure",
  previewNavigate: "pond:preview-navigate",
  previewNeighborRequest: "pond:preview-neighbor-request",
  previewFileAction: "pond:preview-file-action",
  previewClose: "pond:preview-close",
  previewState: "pond:preview-state",
} as const;

export interface RecentMenuEntry {
  id: string;
  title: string;
}

export type BlankDocumentMenuActionId =
  `library.new-blank-${BlankDocumentKind}`;

export type ConnectSourceMenuActionId = `library.connect-${ExternalSource}`;
export type WatchSourceMenuActionId = `library.watch-${ExternalSource}`;

export type FindFilterMenuActionId = `find.filter.${string}`;

export type FindReverseImageMenuActionId =
  `find.reverse-image.${"google-lens" | "yandex" | "bing" | "tineye" | "saucenao" | "baidu" | "sogou"}`;

export type MenuActionId =
  | "history.back"
  | "history.forward"
  | "history.clear"
  | "selection.select-all"
  | "selection.clear"
  | "selection.invert"
  | "view.inspector.toggle"
  | "view.layout.cycle"
  | "view.zoom-in"
  | "view.zoom-out"
  | "view.zoom-reset"
  | "library.search"
  | "nav.library"
  | "nav.sources"
  | "nav.downloads"
  | "nav.tags"
  | "nav.agent"
  | "nav.trash"
  | "nav.uncategorized"
  | "nav.untagged"
  | "nav.settings"
  | "view.layout.waterfall"
  | "view.layout.grid"
  | "view.layout.justified"
  | "view.layout.list"
  | "theme.light"
  | "theme.dark"
  | "theme.system"
  | "refresh.all"
  | "refresh.cancel"
  | "save.reveal"
  | "save.open-with-default"
  | "save.open-original"
  | "save.copy-url"
  | "save.copy-media"
  | "save.copy-id"
  | "save.copy-name"
  | "save.copy-file-path"
  | "save.copy-pond-link"
  | "save.copy-tags"
  | "save.paste-tags"
  | "save.rename"
  | "save.add-tag"
  | "save.refresh"
  | "save.trash"
  | "save.untrash"
  | "save.delete-forever"
  | "save.bulk-trash"
  | "save.bulk-refresh"
  | "save.export-files"
  | "save.export-converted"
  | "save.export-eagle-package"
  | "save.export-pond-package"
  | "save.export-csv"
  | "save.remove-current-folder"
  | "trash.empty"
  | "trash.restore-all"
  | "library.move"
  | "library.new"
  | "library.open"
  | "library.backup"
  | "library.restore"
  | "library.merge"
  | "library.connect"
  | "library.new-folder"
  | "library.new-smart-folder"
  | "library.new-smart-folder-group"
  | "library.new-note"
  | "library.new-tag"
  | "library.new-tag-group"
  | "library.import-files"
  | "library.import-folders"
  | "library.import-links"
  | "library.import-clipboard"
  | "library.import-bookmarks"
  | "library.import-mymind"
  | "library.import-data-export"
  | "library.import-page-assets"
  | "library.import-eagle"
  | "library.import-package"
  | "library.watch"
  | ConnectSourceMenuActionId
  | WatchSourceMenuActionId
  | "library.connect-pinterest"
  | BlankDocumentMenuActionId
  | "library.auto-import-folder"
  | "library.find-duplicates-all"
  | "library.find-duplicates-list"
  | "library.find-duplicates-selected"
  | "library.rescan"
  | "library.verify-integrity"
  | "find.search"
  | "find.search-all"
  | "find.go-to-folder"
  | "find.add-to-folders"
  | "find.add-to-last-folder"
  | "find.filters.toggle"
  | "find.filters.reset"
  | "find.visual-search"
  | FindFilterMenuActionId
  | FindReverseImageMenuActionId
  | "organize.rating.0"
  | "organize.rating.1"
  | "organize.rating.2"
  | "organize.rating.3"
  | "organize.rating.4"
  | "organize.rating.5"
  | "organize.add-to-folders"
  | "organize.add-to-last-folder"
  | "organize.add-tag"
  | "organize.clear-tags"
  | "organize.copy-tags"
  | "organize.paste-tags"
  | "view.sidebar.toggle"
  | "view.grayscale"
  | "view.random"
  | "view.subfolders.toggle"
  | "help.shortcuts"
  | "help.whats-new"
  | "help.export-debug-report";

export type MenuActionSource = "accelerator" | "menu" | "automation";

export interface MenuActionEvent {
  id: MenuActionId;
  source: MenuActionSource;
}
