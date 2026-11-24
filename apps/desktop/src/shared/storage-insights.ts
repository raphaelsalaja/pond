import type { MediaType } from "@pond/schema/db";

export type StorageOrder = "largest" | "smallest";

export interface LargestSave {
  id: string;
  title: string | null;
  url: string;
  source: string;
  mediaType: MediaType | null;
  fileCount: number;
  fileSize: number;
}

export interface LargestSavesResult {
  saves: Array<LargestSave>;
  sources: Array<string>;
  mediaTypes: Array<MediaType>;
}

export interface LargestFile {
  saveId: string;
  saveTitle: string | null;
  saveUrl: string;
  fileIndex: number;
  name: string;
  kind: string;
  extension: string | null;
  size: number;
}

export interface LargestFilesResult {
  files: Array<LargestFile>;
  kinds: Array<string>;
  extensions: Array<string>;
}

export interface StorageShare {
  key: string;
  bytes: number;
  saves: number;
}

export interface FolderStorage {
  id: string;
  name: string;
  bytes: number;
  saves: number;
}

export interface StorageAttributionResult {
  totalBytes: number;
  saves: number;
  unsizedFiles: number;
  types: Array<StorageShare>;
  sources: Array<StorageShare>;
  extensions: Array<StorageShare>;
  folders: Array<FolderStorage>;
}

export interface DuplicateStorageResult {
  groups: number;
  saves: number;
  extraBytes: number;
  ids: Array<string>;
}
