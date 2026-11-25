import type { MediaType, Source } from "@pond/schema/db";
import type { BlankDocumentIcons, BlankDocumentKind } from "./blank-documents";
import type { CombineImagesOptions } from "./combine-images-contracts";
import type {
  CancellableResult,
  EmptyInput,
  OkResult,
  ReasonResult,
} from "./query-contracts-shared";
import type {
  SavesIdsInput,
  SavesImportCounts,
  SavesImportResult,
} from "./saves-contracts-shared";

export interface ImportFileFailure {
  path: string;
  error: string;
}

export type ManualSaveResult = OkResult<{
  id: string;
  skipped?: boolean;
  /** The skipped match is in Trash. */
  trashed?: boolean;
}> & {
  failedFiles?: Array<ImportFileFailure>;
};

export type SavesImportFilesResult = OkResult<{ ids: Array<string> }> & {
  failedPaths?: Array<string>;
};

export interface DuplicateImportCandidate {
  path: string;
  filename: string;
  existingId: string;
  existingTitle: string | null;
  /** The match is in Trash; only an explicit `restore` decision brings it back. */
  inTrash: boolean;
}

export type DuplicateImportChoice = "use-existing" | "keep-both";

/** A per-file review decision; `use-existing` never pulls a Save out of Trash, so restoring has its own choice. */
export type DuplicateImportDecision = DuplicateImportChoice | "restore";

export interface DataExportImportCounts extends SavesImportCounts {
  platforms: Array<string>;
  /** Sources in the export with no connected Account; their Saves capture once you connect one. */
  connect: Array<Source>;
}

export interface EagleImportProgress {
  id: string;
  processed: number;
  total: number;
  imported: number;
  skipped: number;
  failed: number;
}

export interface SavesImportQueryInputs {
  "saves.importEaglePackage": EmptyInput;
  "saves.importPackage": EmptyInput;
  "saves.pickImportPaths": { kind: "files" | "folders" };
  "saves.classifyUrl": { url: string };
  "saves.importFiles": {
    paths: Array<string>;
    tags?: Array<string>;
    folderIds?: Array<string>;
    duplicatePolicy?: DuplicateImportChoice;
    duplicateDecisions?: Record<string, DuplicateImportDecision>;
    origin?: "files" | "clipboard";
  };
  "saves.reviewImportDuplicates": { paths: Array<string> };
  "saves.createManual": {
    title?: string | null;
    url?: string | null;
    note?: string | null;
    tags?: Array<string>;
    filePaths?: Array<string>;
    sourceId?: string | null;
    mediaType?: MediaType | null;
    width?: number;
    height?: number;
  };
  "saves.listBlankDocuments": EmptyInput;
  "saves.createBlankDocument": {
    kind: BlankDocumentKind;
    folderId?: string | null;
  };
  "saves.combineImages": {
    ids: Array<string>;
    folderId?: string | null;
    options?: Partial<CombineImagesOptions>;
  };
  "saves.importEagleLibrary": {
    path: string;
    dryRun?: boolean;
    importShortcuts?: boolean;
    progressId?: string;
  };
  "saves.pickEagleLibrary": EmptyInput;
  "saves.importClipboard": { folderId?: string | null };
  "saves.stageClipboard": EmptyInput;
  "saves.discardStagedClipboard": { paths: Array<string> };
  "saves.importBookmarks": EmptyInput;
  "saves.importMymind": EmptyInput;
  "saves.importDataExport": EmptyInput;
  "saves.extractPageAssets": { url: string };
  "saves.quickAdd": {
    url?: string;
    note?: string | null;
    tags?: Array<string>;
    folderId?: string | null;
  };
  "saves.startDrag": {
    id?: string;
    path?: string;
    ids?: Array<string>;
    fileIndex?: number | null;
    /** Per-save file index; a save missing here uses `fileIndex`. */
    fileIndexes?: Record<string, number>;
  };
  "saves.copyToLibrary": SavesIdsInput;
}

export interface SavesImportQueryResults {
  "saves.importEaglePackage": CancellableResult<{
    imported?: number;
    skipped?: number;
  }>;
  "saves.importPackage": CancellableResult<{
    imported?: number;
    skipped?: number;
  }>;
  "saves.pickImportPaths": { paths: Array<string> };
  "saves.classifyUrl": { source: Source | null };
  "saves.importFiles": SavesImportFilesResult;
  "saves.reviewImportDuplicates": {
    candidates: Array<DuplicateImportCandidate>;
  };
  "saves.createManual": ManualSaveResult;
  "saves.listBlankDocuments": {
    kinds: Array<BlankDocumentKind>;
    icons: BlankDocumentIcons;
  };
  "saves.createBlankDocument": OkResult<{ id: string }>;
  "saves.combineImages": CancellableResult<{
    id?: string;
    path?: string;
    skipped: number;
  }>;
  "saves.importEagleLibrary": SavesImportResult & {
    failed: number;
    deletedSkipped: number;
    lockedFolders: Array<{
      id: string;
      name: string;
      reason: "password" | "parent_locked";
    }>;
    droppedFields: Array<string>;
    approximatedRules: Array<string>;
    shortcuts: {
      status:
        | "available"
        | "missing"
        | "invalid"
        | "unreadable"
        | "apply_failed";
      importable: number;
      imported: number;
    };
  };
  "saves.pickEagleLibrary": ReasonResult<"cancelled", { path: string }>;
  "saves.importClipboard": SavesImportFilesResult;
  "saves.stageClipboard":
    | { ok: true; paths: Array<string> }
    | { ok: false; error: string };
  "saves.discardStagedClipboard": { ok: true };
  "saves.importBookmarks": CancellableResult<SavesImportCounts>;
  "saves.importMymind": CancellableResult<SavesImportCounts>;
  "saves.importDataExport": CancellableResult<DataExportImportCounts>;
  "saves.extractPageAssets": SavesImportResult;
  "saves.quickAdd": OkResult<{ id: string; created?: boolean }>;
  "saves.startDrag": OkResult;
  "saves.copyToLibrary": CancellableResult<{
    path?: string;
    imported?: number;
    skipped?: number;
  }>;
}
