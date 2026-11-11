import type { ApiTokenScope } from "@pond/schema/api";
import type {
  Folder,
  ImageDownloadSettings,
  Op,
  Prefs,
  SavedView,
  Source,
  Tag,
  VideoDownloadSettings,
} from "@pond/schema/db";
import type { Query } from "@pond/schema/filters/types";
import type { ExternalSource } from "@pond/schema/sources";
import type { z } from "zod";
import type {
  AccountQueryInputs,
  AccountQueryResults,
} from "./account-contracts";
import type {
  ArenaLinkQueryInputs,
  ArenaLinkQueryResults,
} from "./arena-link-contracts";
import type { assistantSend } from "./assistant";
import type { BulkQueryInputs, BulkQueryResults } from "./bulk-contracts";
import type { CanvasQueryInputs, CanvasQueryResults } from "./canvas-contracts";
import type {
  ConversionQueryInputs,
  ConversionQueryResults,
} from "./conversion-contracts";
import type { DownloadActivity } from "./download-activity";
import type {
  DownloaderQueryInputs,
  DownloaderQueryResults,
} from "./downloader-contracts";
import type { FeedbackEvent } from "./feedback";
import type { FishQueryInputs, FishQueryResults } from "./fish-contracts";
import type {
  FishMcpQueryInputs,
  FishMcpQueryResults,
} from "./fish-mcp-contracts";
import type { FolderQueryInputs, FolderQueryResults } from "./folder-contracts";
import type { GlobalShortcutStatus } from "./global-shortcuts";
import type {
  InspectQueryInputs,
  InspectQueryResults,
} from "./inspect-contracts";
import type { LibraryMarkSource } from "./library-mark";
import type {
  LibraryRepairQueryInputs,
  LibraryRepairQueryResults,
} from "./library-repair-contracts";
import type {
  MediaProcessingQueryInputs,
  MediaProcessingQueryResults,
} from "./media-processing-contracts";
import type {
  BatchRenameInput,
  CancellableResult,
  EmptyInput,
  OkResult,
  OkSuccess,
} from "./query-contracts-shared";
import type {
  LibraryLocationResult,
  MediaUnderstandInput,
  SystemQueryResults,
} from "./query-contracts-system";
import type { QueueQueryInputs, QueueQueryResults } from "./queue-contracts";
import type {
  SafariExtensionQueryInputs,
  SafariExtensionQueryResults,
} from "./safari-extension-contracts";
import type {
  SavesClipboardQueryInputs,
  SavesClipboardQueryResults,
} from "./saves-clipboard-contracts";
import type { SavesRetrievalInput } from "./saves-contracts-shared";
import type {
  SavesExportQueryInputs,
  SavesExportQueryResults,
} from "./saves-export-contracts";
import type {
  SavesImportQueryInputs,
  SavesImportQueryResults,
} from "./saves-import-contracts";
import type {
  SavesMutationQueryInputs,
  SavesMutationQueryResults,
} from "./saves-mutation-contracts";
import type {
  SavesOpenWithQueryInputs,
  SavesOpenWithQueryResults,
} from "./saves-open-with-contracts";
import type {
  SavesReadQueryInputs,
  SavesReadQueryResults,
} from "./saves-read-contracts";
import type {
  TagGroupQueryInputs,
  TagGroupQueryResults,
} from "./tag-group-contracts";
import type {
  TransferQueryInputs,
  TransferQueryResults,
} from "./transfer-contracts";
import type { WirePrefsPatch } from "./wire";

interface IdInput {
  id: string;
}
interface IdsInput {
  ids: string[];
}
interface NameInput {
  name: string;
}
interface RenameInput {
  from: string;
  to: string;
}
interface FrameInput {
  src: string;
  timeSec: number;
}
interface PathInput {
  path: string;
}
interface ProviderInput {
  provider: string;
}
interface SavedViewInput {
  name: string;
  kind?: SavedView["kind"];
  parentId?: string | null;
  question?: string | null;
  query?: Query | null;
  sortKey?: string;
  sortDir?: string;
  layout?: string | null;
}

export type { OkResult } from "./query-contracts-shared";

export interface QueryInputs
  extends AccountQueryInputs,
    SafariExtensionQueryInputs,
    TransferQueryInputs,
    BulkQueryInputs,
    FolderQueryInputs,
    InspectQueryInputs,
    CanvasQueryInputs,
    FishQueryInputs,
    FishMcpQueryInputs,
    ConversionQueryInputs,
    DownloaderQueryInputs,
    SavesReadQueryInputs,
    SavesMutationQueryInputs,
    SavesImportQueryInputs,
    SavesExportQueryInputs,
    SavesClipboardQueryInputs,
    SavesOpenWithQueryInputs,
    QueueQueryInputs,
    ArenaLinkQueryInputs,
    LibraryRepairQueryInputs,
    MediaProcessingQueryInputs,
    TagGroupQueryInputs {
  "saves.understandMedia": MediaUnderstandInput;
  "folders.rules.get": { id: string };
  "folders.rules.set": { id: string; tags: string[]; applyExisting?: boolean };
  "folders.createBatch": { names: string[]; parentId?: string | null };
  "folders.createWithSaves": {
    name: string;
    parentId?: string | null;
    saveIds: string[];
  };
  "folders.moveBatch": {
    ids: string[];
    parentId: string | null;
    beforeId?: string;
  };

  "library.restoreBackup": { source?: string; destination?: string };
  "folders.move": { id: string; parentId: string | null; beforeId?: string };
  "folders.assign": {
    saveIds: string[];
    addIds: string[];
    removeIds: string[];
  };
  "savedViews.create": SavedViewInput;
  "savedViews.rename": { id: string; name: string };
  "savedViews.renameBatch": BatchRenameInput;
  "savedViews.update": {
    id: string;
    patch: Partial<Omit<SavedViewInput, "kind">> & { sortOrder?: number };
  };
  "savedViews.delete": IdInput;
  "savedViews.reorder": IdsInput;
  "folders.create": {
    name: string;
    parentId?: string | null;
    color?: string | null;
  };
  "folders.rename": { id: string; name: string };
  "folders.renameBatch": BatchRenameInput;
  "folders.setColor": { id: string; color: string | null };
  "folders.delete": { id: string; trashContainedSaves?: boolean };
  "folders.setSaveFolders": { saveId: string; folderIds: string[] };
  "folders.addSaves": { folderId: string; saveIds: string[] };
  "tags.create": NameInput;
  "tags.rename": RenameInput;
  "tags.merge": RenameInput;
  "tags.update": {
    name: string;
    patch: { starred?: boolean; description?: string | null };
  };
  "tags.delete": NameInput;
  "tags.convertToGroup": NameInput;
  "tags.setForSave": { saveId: string; tags: string[] };
  "settings.setVideoDownload": Partial<VideoDownloadSettings> & {
    source?: ExternalSource;
  };
  "settings.setImageDownload": Partial<ImageDownloadSettings> & {
    source?: ExternalSource;
  };
  "settings.setSourceDownloadsCustom": {
    source: ExternalSource;
    custom: boolean;
  };
  "settings.setPrefs": WirePrefsPatch;
  "feedback.emit": { event: FeedbackEvent };
  "notifications.openSettings": EmptyInput;
  "watches.resolve": { source: Source; input: string };
  "watches.add": { source: Source; handle: string; label?: string | null };
  "watches.setLabel": { watchId: string; label: string | null };
  "watches.remove": { watchId: string };
  "video.sampleFrames": {
    src: string;
    maxFrames: number;
    strategy?: "spread" | "embedding";
  };
  "video.preparePreview": { src: string };
  "video.copyFrame": FrameInput;
  "video.saveFrame": FrameInput;
  "video.setThumbnail": FrameInput & { saveId: string };
  "video.copyFilePath": { saveId: string };
  "autoImport.set": {
    enabled?: boolean;
    path?: string;
    mode?: "copy" | "move";
  };
  "library.createAt": { path: string; name: string };
  "library.identity.update": {
    name?: string;
    icon?: string | null;
    mark?: LibraryMarkSource | null;
    accent?: string | null;
  };
  "library.identity.pickIcon": EmptyInput;
  "library.identity.pondLogo": { tint: string };
  "library.rename": {
    name: string;
    icon?: string | null;
    mark?: LibraryMarkSource | null;
    accent?: string | null;
  };
  "library.recent": Record<string, never>;
  "library.recent.pickIcon": PathInput;
  "library.recent.removeIcon": PathInput;
  "library.recent.reveal": PathInput;
  "library.recent.remove": PathInput;
  "library.mergeFrom": { source?: string };
  "library.switchTo": PathInput;
  "library.move": { path?: string };
  "library.backupTo": { path?: string };
  "downloads.history": {
    limit?: number;
    cursor?: { ts: number; id: number } | null;
    q?: string;
    sources?: Source[];
    ops?: Op[];
  };
  "downloads.ingestingOrFailed": EmptyInput;
  "downloads.clearUnfinished": EmptyInput;
  "downloads.activity": EmptyInput;
  "sync.history": { source: Source; accountId?: string; limit?: number };
  "sync.recent": { limit?: number };
  "sync.runs": { days?: number };
  "sync.stats": { days?: number };
  "agent.saveKey": ProviderInput & { key: string };
  "agent.removeKey": ProviderInput;
  "agent.setKeyEnabled": ProviderInput & { enabled: boolean };
  "agent.verifyKey": ProviderInput & { key: string };
  "agent.listModels": ProviderInput;
  "agent.messages": { chatId: string };
  "agent.deleteChat": { chatId: string };
  "agent.renameChat": { chatId: string; title: string };
  "agent.exportChat": { chatId: string };
  "agent.send": z.input<typeof assistantSend>;
  "agent.stop": { chatId: string; requestId: string };
  "agent.searchSaves": SavesRetrievalInput;
  "agent.attachments": IdsInput;
  "agent.pickAttachments": EmptyInput;
  "agent.review": {
    messageId: string;
    changeIds: string[];
    action: "apply" | "undo" | "dismiss";
  };
  "watches.list": EmptyInput;
  "folders.list": EmptyInput;
  "folders.memberships": EmptyInput;
  "settings.get": EmptyInput;
  "settings.ingestToken": EmptyInput;
  "settings.rotateIngestToken": EmptyInput;
  "apiTokens.list": EmptyInput;
  "apiTokens.create": { name: string; scopes: ApiTokenScope[] };
  "apiTokens.revoke": { id: string };
  "settings.getOnboarded": EmptyInput;
  "settings.setOnboarded": EmptyInput;
  "settings.getPrefs": EmptyInput;
  "settings.globalShortcutStatus": EmptyInput;
  "agent.keys": EmptyInput;
  "agent.listAvailableModels": EmptyInput;
  "agent.chats": { fishId?: string };
  "agent.newChat": { fishId?: string };
  "agent.mcpSnippet": EmptyInput;
  "agent.mcpClients": EmptyInput;
  "agent.openMcpInstall": { id: "cursor" | "vscode" };
  "library.info": EmptyInput;
  "library.rescan": EmptyInput;
  "library.openInFinder": EmptyInput;
  "library.exportDebugReport": EmptyInput;
  "library.verifyIntegrity": EmptyInput;
  "reset.preferences": EmptyInput;
  "reset.clearVideoCache": EmptyInput;
  "reset.clearThumbnails": EmptyInput;
  "reset.factory": EmptyInput;
  "storage.snapshot": EmptyInput;
  "storage.applyGuardPrefs": EmptyInput;
  "storage.guardState": EmptyInput;
  "api.restart": EmptyInput;
  "updates.applyPrefs": EmptyInput;
  "updates.currentNotice": EmptyInput;
  "updates.checkNow": EmptyInput;
  "updates.download": EmptyInput;
  "updates.install": EmptyInput;
  "quickCapture.applyPrefs": EmptyInput;
  "window.applyPrefs": EmptyInput;
  "system.applyPrefs": EmptyInput;
  "autoImport.status": EmptyInput;
  "autoImport.pickFolder": EmptyInput;
  "autoImport.reveal": EmptyInput;
  "pipeline.status": EmptyInput;
  "pipeline.inflight": EmptyInput;
  "savedViews.list": EmptyInput;
  "accounts.list": EmptyInput;
  "tagGroups.list": EmptyInput;
  "library.pickFolder": EmptyInput;
  "library.pickExisting": EmptyInput;
  "tags.list": EmptyInput;
}

export interface QueryResults
  extends AccountQueryResults,
    SafariExtensionQueryResults,
    TransferQueryResults,
    BulkQueryResults,
    SystemQueryResults,
    MediaProcessingQueryResults,
    FolderQueryResults,
    InspectQueryResults,
    CanvasQueryResults,
    FishQueryResults,
    FishMcpQueryResults,
    ConversionQueryResults,
    DownloaderQueryResults,
    SavesReadQueryResults,
    SavesMutationQueryResults,
    SavesImportQueryResults,
    SavesExportQueryResults,
    SavesClipboardQueryResults,
    SavesOpenWithQueryResults,
    QueueQueryResults,
    ArenaLinkQueryResults,
    LibraryRepairQueryResults,
    TagGroupQueryResults {
  "folders.rules.get": { tags: string[]; inheritedTags: string[] };
  "folders.rules.set": OkResult<{ affected: number }>;
  "folders.createBatch": Folder[];
  "folders.createWithSaves": Folder;
  "folders.moveBatch": OkResult;

  "library.recent": Array<{
    path: string;
    name: string;
    available: boolean;
    active: boolean;
    lastOpened: number;
    icon: string | null;
    accent: string | null;
  }>;
  "library.identity.update": OkResult<{
    name?: string;
    icon?: string | null;
    mark?: LibraryMarkSource | null;
    accent?: string | null;
  }>;
  "library.identity.pickIcon": LibraryLocationResult<{ icon: string }>;
  "library.identity.pondLogo": LibraryLocationResult<{ icon: string }>;
  "library.rename": OkResult<{ path: string }>;
  "library.recent.pickIcon": LibraryLocationResult<{ icon: string }>;
  "library.recent.removeIcon": OkResult;
  "library.recent.reveal": LibraryLocationResult;
  "library.recent.remove": OkResult;
  "library.mergeFrom": CancellableResult<{
    path?: string;
    imported?: number;
    skipped?: number;
  }>;

  "library.restoreBackup": LibraryLocationResult<{
    path: string;
    copied?: number;
  }>;
  "folders.move": OkResult;
  "folders.assign": OkResult;
  "tags.list": Tag[];
  "tags.rename": OkResult<{ affected: number }>;
  "tags.merge": OkResult<{ affected: number }>;
  "tags.update": OkResult;
  "tags.delete": OkResult<{ affected: number }>;
  "tags.convertToGroup": OkResult;
  "tags.setForSave": OkResult;
  "pipeline.status": { paused: boolean; inflight: number };
  "pipeline.inflight": string[];
  "downloads.ingestingOrFailed": string[];
  "downloads.clearUnfinished": { changed: number; ids: string[] };
  "downloads.activity": DownloadActivity[];
  "downloads.history": {
    rows: {
      id: number;
      saveId: string;
      title: string | null;
      url: string;
      source: Source;
      outcome: "complete" | "failed" | "cancelled";
      durationMs: number;
      attempts: number;
      failedOp: Op | null;
      error: { name: string; message: string } | null;
      ts: number;
    }[];
    nextCursor: { ts: number; id: number } | null;
  };
  "video.sampleFrames": OkResult<{
    duration: number;
    frames: Array<{ bytes: Uint8Array; mimeType: string; timestamp: number }>;
  }>;
  "video.preparePreview": OkResult<{ url: string }>;
  "video.copyFrame": OkResult;
  "video.saveFrame": CancellableResult<{ path: string }>;
  "video.setThumbnail": OkResult;
  "video.copyFilePath": OkResult;

  "savedViews.list": SavedView[];
  "savedViews.create": OkResult<{ id: string }>;
  "savedViews.rename": OkResult;
  "savedViews.renameBatch": OkResult<{ renamed: number }>;
  "savedViews.update": OkResult;
  "savedViews.delete": OkResult;
  "savedViews.reorder": OkResult;
  "folders.list": Folder[];
  "folders.create": Folder;
  "folders.rename": OkResult;
  "folders.renameBatch": OkResult<{ renamed: number }>;
  "folders.setColor": OkResult;
  "folders.delete": OkResult;
  "folders.memberships": { saveId: string; folderId: string }[];
  "folders.setSaveFolders": OkResult;
  "folders.addSaves": OkResult;
  "tags.create": OkResult;
  "agent.saveKey": OkResult;
  "settings.getPrefs": Prefs;
  "settings.globalShortcutStatus": GlobalShortcutStatus;
  "settings.setPrefs": OkSuccess<{ prefs: Prefs }>;
  "feedback.emit": OkResult;
  "notifications.openSettings": OkResult;
}

export type QueryName = keyof QueryInputs;
export type QueryInput<Name extends QueryName> = QueryInputs[Name];
export type QueryResult<Name extends QueryName> = QueryResults[Name];
export type QueryArguments<Name extends QueryName> =
  EmptyInput extends QueryInput<Name>
    ? [params?: QueryInput<Name>]
    : [params: QueryInput<Name>];
export type QueryClient = <Name extends QueryName>(
  name: Name,
  ...args: QueryArguments<Name>
) => Promise<QueryResult<Name>>;
