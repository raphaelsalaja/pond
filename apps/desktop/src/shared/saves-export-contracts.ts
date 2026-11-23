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
}
