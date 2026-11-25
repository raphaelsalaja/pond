import type { ExternalSource } from "@pond/schema/sources";
import type {
  DuplicateDismissal,
  DuplicateIndexStatus,
  DuplicateScan,
} from "./duplicate-contracts";
import type {
  BatchRenameInput,
  CancellableResult,
  EmptyInput,
  OkResult,
  OkSuccess,
  UndoableChange,
} from "./query-contracts-shared";
import type { SavesDerivedPatch, SavesIdInput } from "./saves-contracts-shared";

export interface SplitAllProgress {
  running: boolean;
  total: number;
  processed: number;
  split: number;
  created: number;
  failed: number;
}

export interface SavesMutationQueryInputs {
  "saves.emptyTrash": EmptyInput;
  "saves.restoreAll": EmptyInput;
  "saves.retryFailed": { ids?: Array<string> };
  "saves.skipIngest": { ids: Array<string> };
  "saves.setPhash": { id: string; phash: string | null };
  "saves.setEmbedding": {
    id: string;
    embedding: Array<number> | null;
    embeddingModel: string | null;
  };
  "saves.patchDerived": { id: string; patch: SavesDerivedPatch };
  "saves.ensureTextCover": { id: string; force?: boolean };
  "saves.mergeDuplicates": { keepId: string; ids: Array<string> };
  "saves.split": { ids: Array<string> };
  "saves.group": { ids: Array<string> };
  "saves.splittableCount": EmptyInput;
  "saves.splitAll": EmptyInput;
  "saves.splitAllStatus": EmptyInput;
  "saves.batchRename": BatchRenameInput;
  "saves.batchEditExtension": { ids: Array<string>; extension: string };
  "saves.activateFont": SavesIdInput;
  "saves.deactivateFont": SavesIdInput;
  "saves.setAudioAnalysis": { id: string; bpm: number };
  "saves.setCustomThumbnail": SavesIdInput;
  "saves.setThumbnailFromClipboard": SavesIdInput;
  "saves.setGifThumbnail": {
    id: string;
    src: string;
    frameIndex: number;
  };
  "saves.setImageThumbnail": {
    id: string;
    src: string;
  };
  "saves.loadSubtitles": SavesIdInput;
  "saves.replaceFile": SavesIdInput;
  "saves.removeCustomThumbnail": SavesIdInput;
  "saves.backfillColors": EmptyInput;
  "saves.backfillMetadata": EmptyInput;
  "saves.reanalyzeColors": SavesIdInput;
  "saves.setPrimaryColor": { id: string; color: string | null };
  "saves.convertTextEncoding": SavesIdInput & { fileIndex: number };
  "saves.exportDotLottie": SavesIdInput & { fileIndex: number };
  "saves.regeneratePoster": SavesIdInput;
  "saves.downloadVideo": { ids: Array<string> };
  "saves.removeVideo": { ids: Array<string> };
  "saves.missingVideoCount": { source?: ExternalSource };
  "saves.downloadMissingVideos": { source?: ExternalSource };
  "saves.findDuplicates": { ids?: Array<string> };
  "saves.duplicateIndexStatus": EmptyInput;
  "saves.rebuildDuplicateIndex": EmptyInput;
  "saves.dismissDuplicates": { pairs: Array<DuplicateDismissal> };
}

export interface SavesMutationQueryResults {
  "saves.emptyTrash": OkResult<{ count: number }>;
  "saves.restoreAll": OkResult<{ count: number }>;
  "saves.retryFailed": OkResult<{ requeued: number }>;
  "saves.skipIngest": OkResult<{ skipped: number }>;
  "saves.setPhash": OkResult;
  "saves.setEmbedding": OkResult;
  "saves.patchDerived": OkResult;
  "saves.ensureTextCover": OkResult<{ captured: number }>;
  "saves.mergeDuplicates": OkResult<{ trashed: number }>;
  "saves.split": OkResult<{ split: number; created: number }>;
  "saves.group": OkResult<{ id: string; grouped: number } & UndoableChange>;
  "saves.splittableCount": { count: number };
  "saves.splitAll": SplitAllProgress;
  "saves.splitAllStatus": SplitAllProgress;
  "saves.batchRename": OkResult<{ renamed: number }>;
  "saves.batchEditExtension": OkSuccess<{
    changed: number;
    changedFiles: number;
    skipped: number;
  }>;
  "saves.activateFont": OkResult<{ path: string; requiresSignIn?: boolean }>;
  "saves.deactivateFont": OkResult;
  "saves.setAudioAnalysis": OkResult;
  "saves.setCustomThumbnail": CancellableResult;
  "saves.setThumbnailFromClipboard": OkResult;
  "saves.setGifThumbnail": OkResult;
  "saves.setImageThumbnail": OkResult;
  "saves.loadSubtitles": CancellableResult;
  "saves.replaceFile": CancellableResult;
  "saves.removeCustomThumbnail": OkResult;
  "saves.backfillColors": OkResult<{ updated: number }>;
  "saves.backfillMetadata": OkResult<{ updated: number }>;
  "saves.reanalyzeColors": OkResult<{ updated: boolean }>;
  "saves.setPrimaryColor": OkResult;
  "saves.convertTextEncoding": OkResult<{ updated: boolean }>;
  "saves.exportDotLottie": CancellableResult;
  "saves.regeneratePoster": OkResult;
  "saves.downloadVideo": OkResult<{ queued: number }>;
  "saves.removeVideo": OkResult<{ removed: number }>;
  "saves.missingVideoCount": { count: number };
  "saves.downloadMissingVideos": OkResult<{ queued: number }>;
  "saves.findDuplicates": DuplicateScan;
  "saves.duplicateIndexStatus": DuplicateIndexStatus;
  "saves.rebuildDuplicateIndex": OkResult<{ assets: number }>;
  "saves.dismissDuplicates": OkResult<{ dismissed: number }>;
}
