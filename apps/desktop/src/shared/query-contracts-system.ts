import type { ApiTokenInfo } from "@pond/schema/api";
import type {
  AgentChat,
  AgentMessage,
  ImageDownloadSettings,
  MediaType,
  Prefs,
  Source,
  SourceOverrides,
  VideoDownloadSettings,
  WatchedAccount,
} from "@pond/schema/db";
import type { SyncRunEvent } from "@pond/schema/events";
import { z } from "zod";
import type {
  AssistantChange,
  AssistantFileAttachment,
  AssistantProvider,
  AssistantSendResult,
} from "./assistant";
import type { LibraryMarkSource } from "./library-mark";
import type { McpClientStatus } from "./mcp-hosts";
import type { ProviderModelsResult } from "./provider-models";
import type {
  CancellableResult,
  OkFailure,
  OkResult,
  ReasonFailure,
  ReasonResult,
} from "./query-contracts-shared";
import type { UpdateNotice } from "./update-notice";

export const MediaUnderstandInputSchema = z.strictObject({
  saveId: z.string().min(1),
  task: z.enum(["caption", "ocr"]),
});

export type MediaUnderstandInput = z.infer<typeof MediaUnderstandInputSchema>;

export type MediaUnderstandFailureReason =
  | "not_found"
  | "no_files"
  | "out_of_range"
  | "missing"
  | "auxiliary_file"
  | "unsafe_path"
  | "unsupported_media"
  | "too_large"
  | "read_failed"
  | "model_unavailable"
  | "model_not_vision"
  | "invalid_input"
  | "aborted"
  | "timeout"
  | "generation_failed"
  | "empty_output"
  | "model_chatter"
  | "output_too_long"
  | "internal_error";

export type MediaUnderstandOperationalMetric = {
  modelId: string;
  task: MediaUnderstandInput["task"];
  temperature: "cold" | "warm";
  durationMs: number;
  imageBytes: number;
  outcome: "ok" | MediaUnderstandFailureReason;
  fallbackUsed: boolean;
};

export type MediaUnderstandResult =
  | { ok: true; text: string; model: string }
  | {
      ok: false;
      reason: MediaUnderstandFailureReason;
      operation?: MediaUnderstandOperationalMetric;
    };

export type LibraryLocationFailure =
  | "cancelled"
  | "invalid_image"
  | "missing"
  | "no_path"
  | "no_library"
  | "same_path"
  | "nested_path"
  | "destination_exists"
  | "inside_user_data"
  | "not_writable"
  | "not_a_directory"
  | "unknown_error";

export type LibraryLocationResult<Data = Record<never, never>> =
  | ReasonResult<LibraryLocationFailure, Data>
  | OkFailure;

type PathResult<Data = Record<never, never>> = LibraryLocationResult<
  { path: string } & Data
>;

interface DownloadSettingsResult {
  videoDownload: VideoDownloadSettings;
  imageDownload: ImageDownloadSettings;
  videoDownloadSources: SourceOverrides<VideoDownloadSettings>;
  imageDownloadSources: SourceOverrides<ImageDownloadSettings>;
}

interface RetrievalSave {
  id: string;
  title: string | null;
  url: string;
  author: string | null;
  source: Source;
  notes: string | null;
  description: string | null;
}
interface RetrievalHit extends RetrievalSave {
  mediaType: MediaType | null;
  savedAt: Date;
  score: number;
  channels: ("fts" | "text" | "media" | "recent")[];
}
interface SyncRun {
  id: number;
  ts: number;
  source: Source;
  accountId: string | null;
  trigger: string;
  outcome: SyncRunEvent["outcome"];
  durationMs: number;
  harvest: SyncRunEvent["harvest"];
  enqueue: SyncRunEvent["enqueue"];
  error: SyncRunEvent["error"];
  watchdogTripped: boolean;
}
interface WatchTarget {
  kind: WatchedAccount["kind"];
  handle: string;
  display: string;
}
interface AttachmentIdentity {
  id: string;
  title: string | null;
  url: string;
  author: string | null;
  source: Source;
}
type Attachment = AttachmentIdentity &
  (
    | {
        field: "description" | "notes" | "caption" | "ocr" | "transcript";
        text: string;
        offset: number;
        length: number;
        total: number;
      }
    | {
        description: string;
        descriptionTokens: number;
        notes: string;
        notesTokens: number;
        caption: string;
        captionTokens: number;
        ocr: string;
        ocrTokens: number;
        transcript: string;
        transcriptTokens: number;
        rating: number | null;
        tags: string[];
        folderIds: string[];
        mediaType: MediaType | null;
        width: number | null;
        height: number | null;
      }
  );

export interface SystemQueryResults {
  "watches.list": { watches: (WatchedAccount & { syncing: boolean })[] };
  "watches.resolve": { ok: false } | { ok: true; target: WatchTarget };
  "watches.add":
    | { ok: false; reason: string }
    | { ok: true; watch: WatchedAccount };
  "watches.setLabel": OkResult<{ watch: WatchedAccount }>;
  "watches.remove": OkResult;
  "agent.keys": {
    provider: AssistantProvider;
    hasKey: boolean;
    masked: string | null;
    enabled: boolean;
  }[];
  "agent.removeKey": OkResult;
  "agent.setKeyEnabled": OkResult;
  "agent.verifyKey": OkResult;
  "agent.listModels": ProviderModelsResult;
  "agent.listAvailableModels": {
    providers: (ProviderModelsResult & { provider: AssistantProvider })[];
  };
  "agent.chats": (Omit<AgentChat, "canonicalTranscript"> & {
    fishId: string;
  })[];
  "agent.messages": AgentMessage[];
  "agent.newChat": Omit<AgentChat, "canonicalTranscript"> & { fishId: string };
  "agent.deleteChat": OkResult;
  "agent.renameChat": OkResult;
  "agent.exportChat": CancellableResult;
  "agent.send": AssistantSendResult;
  "agent.stop": OkResult;
  "agent.searchSaves": { saves: RetrievalSave[] };
  "agent.attachments": Attachment[];
  "agent.pickAttachments":
    | { ok: true; files: AssistantFileAttachment[] }
    | { ok: false; files: []; error: string };
  "agent.review": { changes: AssistantChange[] };
  "agent.mcpSnippet": {
    command: string;
    args: string[];
    json: string;
    app: string;
  };
  "agent.mcpClients": { clients: McpClientStatus[] };
  "agent.openMcpInstall": OkResult;
  "saves.understandMedia": MediaUnderstandResult;
  "saves.retrieve": { hits: RetrievalHit[]; saves: RetrievalSave[] };
  "sync.history": { runs: SyncRun[] };
  "sync.recent": { runs: SyncRun[] };
  "sync.runs": { runs: SyncRun[] };
  "sync.stats": {
    itemsSynced: number;
    itemsSyncedPrev: number;
    newToday: number;
    runsToday: number;
    runs: number;
    successRate: number;
    successRatePrev: number;
    avgRunMs: number;
    avgRunMsPrev: number;
    failed: number;
    recovered: number;
    lastRunAt: number | null;
  };
  "settings.get": DownloadSettingsResult & {
    id: string;
    libraryRoot: string | null;
    updatedAt: Date;
  };
  "settings.setVideoDownload": OkResult<DownloadSettingsResult>;
  "settings.setImageDownload": OkResult<DownloadSettingsResult>;
  "settings.setSourceDownloadsCustom": OkResult<DownloadSettingsResult>;
  "settings.ingestToken": { token: string | null };
  "settings.rotateIngestToken": { token: string };
  "apiTokens.list": { tokens: ApiTokenInfo[] };
  "apiTokens.create": { token: string; info: ApiTokenInfo };
  "apiTokens.revoke": { ok: boolean };
  "settings.getOnboarded": { onboarded: boolean };
  "settings.setOnboarded": OkResult;
  "autoImport.status": Prefs["autoImport"] & {
    history: {
      at: number;
      name: string;
      mode: "copy" | "move";
      ok: boolean;
      id?: string;
    }[];
  };
  "autoImport.set": OkResult;
  "autoImport.pickFolder": ReasonResult<"cancelled", { path: string }>;
  "autoImport.reveal": ReasonResult<"missing">;
  "library.info": {
    path: string;
    name: string;
    icon: string | null;
    mark: LibraryMarkSource | null;
    accent: string | null;
  };
  "library.rescan": {
    updated: number;
    total: number;
    missingFiles: Array<{ id: string; title: string | null }>;
  };
  "library.openInFinder": OkResult;
  "library.exportDebugReport": CancellableResult<{ path: string }>;
  "library.verifyIntegrity": OkResult<{
    orphans?: string[];
    missing?: string[];
    errors?: Record<string, string>;
    totalIndexed?: number;
    totalOnDisk?: number;
  }>;
  "library.createAt": PathResult;
  "library.pickExisting": PathResult;
  "library.pickFolder": PathResult;
  "library.switchTo": PathResult<{ mode?: "adopt" | "copy" }>;
  "library.move": PathResult<{
    sourceRemoved?: boolean;
    cleanupPath?: string;
  }>;
  "library.backupTo": PathResult<{ copied?: number }>;
  "reset.preferences": OkResult;
  "reset.clearVideoCache": OkResult<{ removed: number }>;
  "reset.clearThumbnails": OkResult<{ removed: number }>;
  "reset.factory": OkResult;
  "storage.snapshot": {
    pondBytes: number;
    breakdown: {
      items: number;
      videoCache: number;
      thumbs: number;
      meta: number;
      db: number;
      other: number;
    };
    deviceTotalBytes: number;
    deviceFreeBytes: number;
    deviceUsedByOthersBytes: number;
    libraryRoot: string;
    computedAt: string;
  };
  "storage.applyGuardPrefs": OkResult;
  "storage.guardState": {
    state: "ok" | "warn" | "exceeded";
    pondBytes: number;
    capBytes: number | null;
    warnBytes: number | null;
    action: "warn" | "pauseSync" | "pauseVideo";
    appliedAt: string;
  };
  "api.restart": OkResult<{ port?: number }>;
  "updates.applyPrefs": OkResult;
  "updates.currentNotice": UpdateNotice | null;
  "updates.checkNow":
    | OkResult<{ version?: string }>
    | ReasonFailure<"dev_build">;
  "updates.download": OkResult | ReasonFailure<"dev_build">;
  "updates.install": OkResult | ReasonFailure<"dev_build">;
  "quickCapture.applyPrefs": OkResult;
  "window.applyPrefs": OkResult;
  "system.applyPrefs": OkResult<{ restartRequired?: boolean }>;
}
