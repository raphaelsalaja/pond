import type {
  BatchRenameInput,
  CancellableResult,
  EmptyInput,
  OkResult,
  OkSuccess,
} from "./query-contracts-shared";
import type { SavesDerivedPatch, SavesIdInput } from "./saves-contracts-shared";

export interface SavesMutationQueryInputs {
  "saves.emptyTrash": EmptyInput;
  "saves.restoreAll": EmptyInput;
  "saves.retryFailed": { ids?: string[] };
  "saves.skipIngest": { ids: string[] };
  "saves.setPhash": { id: string; phash: string | null };
  "saves.setEmbedding": {
    id: string;
    embedding: number[] | null;
    embeddingModel: string | null;
  };
  "saves.patchDerived": { id: string; patch: SavesDerivedPatch };
  "saves.ensureTextCover": { id: string; force?: boolean };
  "saves.mergeDuplicates": { keepId: string; ids: string[] };
  "saves.batchRename": BatchRenameInput;
  "saves.batchEditExtension": { ids: string[]; extension: string };
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
  "saves.findDuplicates": { visualDistance?: number };
}

export type DuplicateGroupResult =
  | {
      kind: "exact";
      ids: string[];
      evidence: { sha256Equal: true };
    }
  | {
      kind: "visual-near";
      ids: string[];
      evidence: { distance: number };
    }
  | {
      kind: "semantic-near";
      ids: string[];
      evidence: { model: string; distance: number };
    };

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
  "saves.findDuplicates": {
    groups: DuplicateGroupResult[];
    visualIndexed: number;
    visualDistance: number;
    total: number;
  };
}
