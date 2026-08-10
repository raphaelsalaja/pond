import type { Op, SaveStatus, TaskStatus, VideoNote } from "@pond/schema/db";
import type { RawJson } from "@pond/schema/raw";

export type ViewMode = "waterfall" | "justified" | "grid";

export interface SaveFile {
  kind: string;
  path: string;
  sha256: string;
  size: number;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
}

interface SaveTask {
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
  /** Connected account or watch that ingested the save; the `account` filter projects it, so dropping it would blind that filter. */
  accountId?: string | null;
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
  phash?: string | null;
  /** On-device enrichment outputs; lightweight fields ride along on saves.list while transcript and clipEmbedding are lazy-loaded. */
  caption?: string | null;
  captionModel?: string | null;
  ocrText?: string | null;
  ocrModel?: string | null;
  transcript?: string | null;
  transcriptModel?: string | null;
  clipEmbedding?: number[] | null;
  clipModel?: string | null;
  aesthetic?: string[] | null;
  aestheticModel?: string | null;
  autoTitleModel?: string | null;
  suggestedTags?: string[] | null;
  suggestedTagsModel?: string | null;
  videoNotes?: VideoNote[];
  dominantColors?: string[];
  tags: string[];
  rawJson?: RawJson | null;
  status?: SaveStatus;
  ingestStartedAt?: number | null;
  ingestCompletedAt?: number | null;
  tasks?: SaveTask[];
  savedAt: number;
  createdAt: number;
  publishedAt?: number | null;
  deletedAt: number | null;
}
