/**
 * Renderer-safe subset of the `Save` shape. We can't pull `@pond/schema/db`
 * directly into the renderer because Drizzle's pg-core (Phase 1) / sqlite-core
 * (Phase 2) imports resolve Node APIs, but the JSON-shape is identical.
 *
 * Keep in sync with `packages/schema/src/db.ts`.
 */
export interface SaveFile {
  kind: string;
  path: string;
  sha256: string;
  size: number;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
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
  blobUrl: string | null;
  mediaType: string | null;
  /** Ordered list of media files. First entry is the cover. */
  files: SaveFile[];
  tags: string[];
  aiTags: string[];
  aiCaption: string | null;
  /**
   * Source-specific metadata passthrough. Shape varies by `source` —
   * e.g. for `"twitter"` we stash `{ twitter: { authorName, authorAvatar,
   * publishedAt, verified } }`. Renderers are expected to feature-detect
   * before reading because scraper versions drift.
   */
  rawJson?: unknown;
  savedAt: string;
  createdAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
}
