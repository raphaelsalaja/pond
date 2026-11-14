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

export type ManualSaveResult = OkResult<{ id: string; skipped?: boolean }> & {
  failedFiles?: ImportFileFailure[];
};

export type SavesImportFilesResult = OkResult<{ ids: string[] }> & {
  failedPaths?: string[];
};

export interface DuplicateImportCandidate {
  path: string;
  filename: string;
  existingId: string;
  existingTitle: string | null;
}

export type DuplicateImportChoice = "use-existing" | "keep-both";

export interface DataExportImportCounts extends SavesImportCounts {
  platforms: string[];
  /** Sources in the export with no connected Account; their Saves capture once you connect one. */
  connect: Source[];
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
    paths: string[];
    tags?: string[];
    folderIds?: string[];
    duplicatePolicy?: DuplicateImportChoice;
    duplicateDecisions?: Record<string, DuplicateImportChoice>;
  };
  "saves.reviewImportDuplicates": { paths: string[] };
  "saves.createManual": {
    title?: string | null;
    url?: string | null;
    note?: string | null;
    tags?: string[];
    filePaths?: string[];
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
    ids: string[];
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
  "saves.importBookmarks": EmptyInput;
  "saves.importMymind": EmptyInput;
  "saves.importDataExport": EmptyInput;
  "saves.extractPageAssets": { url: string };
  "saves.quickAdd": {
    url?: string;
    note?: string | null;
    tags?: string[];
    folderId?: string | null;
  };
  "saves.startDrag": {
    id?: string;
    path?: string;
    ids?: string[];
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
  "saves.pickImportPaths": { paths: string[] };
  "saves.classifyUrl": { source: Source | null };
  "saves.importFiles": SavesImportFilesResult;
  "saves.reviewImportDuplicates": {
    candidates: DuplicateImportCandidate[];
  };
  "saves.createManual": ManualSaveResult;
  "saves.listBlankDocuments": {
    kinds: BlankDocumentKind[];
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
    lockedFolders: {
      id: string;
      name: string;
      reason: "password" | "parent_locked";
    }[];
    droppedFields: string[];
    approximatedRules: string[];
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
