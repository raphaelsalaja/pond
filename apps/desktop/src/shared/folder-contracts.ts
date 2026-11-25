import type { FolderMetadata } from "@pond/schema/db";
import type { OkResult } from "./query-contracts-shared";

export interface FolderSummary {
  id: string;
  directSaveCount: number;
  downloadingCount: number;
  childFolderCount: number;
  previewSaveIds: Array<string>;
}

export interface FolderQueryInputs {
  "folders.summaries": { parentId: string };
  "folders.previews": { folderIds: Array<string>; limit: number };
  "folders.downloading": { folderIds: Array<string> };
  "folders.metadata.get": { folderId: string };
  "folders.metadata.set": {
    folderId: string;
    description: string | null;
    externalLink: string | null;
  };
}

export interface FolderQueryResults {
  "folders.summaries": Array<FolderSummary>;
  "folders.previews": Record<string, Array<string>>;
  "folders.downloading": { count: number };
  "folders.metadata.get": FolderMetadata;
  "folders.metadata.set": OkResult;
}
