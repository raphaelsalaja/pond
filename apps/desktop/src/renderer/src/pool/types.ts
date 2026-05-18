import type { Op, SaveStatus, TaskStatus } from "@pond/schema/db";
import type { RawJson } from "@pond/schema/raw";

export interface SaveFile {
  kind: string;
  path: string;
  sha256: string;
  size: number;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface SaveTask {
  op: Op;
  status: TaskStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  nextRunAt: number;
  updatedAt: number;
}

export interface Save {
  id: string;
  source: string;
  sourceId: string;
  url: string;
  title: string | null;
  description: string | null;
  author: string | null;
  notes: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  files: SaveFile[];
  coverIndex?: number;
  width?: number | null;
  height?: number | null;
  fileSize?: number | null;
  tags: string[];
  rawJson?: RawJson | null;
  status?: SaveStatus;
  ingestStartedAt?: number | null;
  ingestCompletedAt?: number | null;
  tasks?: SaveTask[];
  savedAt: number;
  createdAt: number;
  deletedAt: number | null;
}
