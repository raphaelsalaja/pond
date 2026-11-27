import type {
  CancellableResult,
  OkResult,
  ReasonResult,
} from "./query-contracts-shared";
import type {
  SaveFileFailure,
  SavesFileInput,
  SavesIdsInput,
} from "./saves-contracts-shared";

export interface SavesExportQueryInputs {
  "saves.exportEaglePackage": SavesIdsInput;
  "saves.exportPackage": SavesIdsInput;
  "saves.exportFile": SavesFileInput;
  "saves.share": { id: string; fileIndex?: number };
  "saves.exportFiles": SavesIdsInput & {
    zip?: boolean;
    /** Name the export after the shared folder even when it holds one Save. */
    fromFolders?: boolean;
  };
  "saves.exportWebp": SavesIdsInput;
  "saves.exportCsv": SavesIdsInput;
  "saves.exportSharePage": SavesIdsInput & {
    /** The page is this Folder: it takes the Folder's name. `ids` are its Saves in order. */
    folderId?: string;
  };
}

export interface SavesExportQueryResults {
  "saves.exportEaglePackage": CancellableResult<{
    path?: string;
    exported?: number;
  }>;
  "saves.exportPackage": CancellableResult<{
    path?: string;
    exported?: number;
  }>;
  "saves.exportFile": ReasonResult<
    SaveFileFailure | "cancelled" | "internal_error",
    { path: string }
  >;
  "saves.share": OkResult;
  "saves.exportFiles": CancellableResult<{
    exported: number;
    dir: string;
    path: string;
  }>;
  "saves.exportWebp": CancellableResult<{ exported: number; dir: string }>;
  "saves.exportCsv": CancellableResult<{ count: number; path: string }>;
  "saves.exportSharePage": CancellableResult<{
    exported: number;
    path: string;
  }>;
}
