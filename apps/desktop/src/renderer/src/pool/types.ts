import type { RawSaveMetadata } from "@pond/schema/raw";

/**
 * Renderer-safe subset of the `Save` shape. We can't pull `@pond/schema/db`
 * directly into the renderer because Drizzle's pg-core (Phase 1) / sqlite-core
 * (Phase 2) imports resolve Node APIs, but the JSON-shape is identical.
 *
 * Keep in sync with `packages/schema/src/db.ts`.
 *
 * `@pond/schema/raw` is a pure types file (no Drizzle), so it's safe
 * to import here for `rawJson`.
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

/** AI-extracted dominant colour from the cover image. */
export interface DominantColor {
  hex: string;
  weight: number;
}

/** Per-field AI suggestion. Mirrors `AiSuggestion<T>` in schema. */
export interface AiSuggestion<T> {
  value: T;
  appliedAt: string | null;
  reasoning: string;
  promptHash?: string;
}

export interface AiSuggestionsForSave {
  tags?: AiSuggestion<string[]>;
  caption?: AiSuggestion<string>;
  ocr?: AiSuggestion<string>;
  classification?: AiSuggestion<string>;
  summary?: AiSuggestion<string>;
}

/** Free-form note attached to a video timestamp. */
export interface VideoTimestamp {
  /** Position in seconds. */
  at: number;
  /** Author note (optional). */
  text?: string;
  /** ISO timestamp the note was created. */
  createdAt: string;
}

/** Highlighted span inside the cached article text. */
export interface TextHighlight {
  /** Stable id so highlights survive a re-extraction. */
  id: string;
  /** Selected substring of `articleText` for context. */
  quote: string;
  /** Optional reader note. */
  note?: string;
  /** Highlight color (hex). */
  color?: string;
  createdAt: string;
}

export interface SaveAnnotations {
  highlights?: TextHighlight[];
  videoTimestamps?: VideoTimestamp[];
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
  /** Index into `files[]` for the visible cover. */
  coverIndex?: number;
  /** Pixel dimensions of the cover image (when known). */
  width?: number | null;
  height?: number | null;
  /** Cover file size in bytes (when known). */
  fileSize?: number | null;
  /** AI-extracted dominant cover colours (sorted by weight). */
  dominantColors?: DominantColor[] | null;
  /**
   * `data:image/jpeg;base64,...` of a tiny blurred preview of the
   * cover. Painted behind the lazy-loaded `<img>` so the slot already
   * shows a blurred version of its own content while bytes stream in.
   */
  blurDataUrl?: string | null;
  tags: string[];
  aiTags: string[];
  aiCaption: string | null;
  /** AI-generated 2-3 sentence summary (LLM-driven, optional). */
  aiSummary?: string | null;
  /** Save category (e.g. "article", "image"). */
  classification?: string | null;
  /** Per-field AI suggestions awaiting accept/reject. */
  aiSuggestions?: AiSuggestionsForSave | null;
  /** Cached, sanitized HTML for reader-mode (articles). */
  articleHtml?: string | null;
  /** Plaintext extraction for reader/embedding/search. */
  articleText?: string | null;
  /** Estimated reading time in minutes. */
  articleReadingMinutes?: number | null;
  /** Stored OCR string (when AI ran). */
  ocrText?: string | null;
  /** Per-item annotations (highlights, video timestamps). */
  annotations?: SaveAnnotations | null;
  /**
   * Source-specific metadata passthrough. Shape varies by `source` —
   * e.g. for `"twitter"` we stash `{ twitter: { authorName, authorAvatar,
   * publishedAt, verified } }`. Renderers are expected to feature-detect
   * before reading because scraper versions drift, but the typed
   * `RawSaveMetadata` shape lets call-sites read fields without
   * stringly indexing.
   */
  rawJson?: RawSaveMetadata | null;
  savedAt: string;
  createdAt: string;
  /** Timestamp of the most recent embedding rebuild — proxy for "modified". */
  embeddingUpdatedAt?: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
}
