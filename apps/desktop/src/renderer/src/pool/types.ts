import type { RawSaveMetadata } from "@pond/schema/raw";

export interface SaveFile {
  kind: string;
  path: string;
  sha256: string;
  size: number;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface DominantColor {
  hex: string;
  weight: number;
}

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

export interface TextHighlight {
  id: string;
  quote: string;
  note?: string;
  color?: string;
  createdAt: string;
}

export interface SaveAnnotations {
  highlights?: TextHighlight[];
}

export type NsfwLabel = "drawing" | "hentai" | "neutral" | "porn" | "sexy";

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
  dominantColors?: DominantColor[] | null;
  blurDataUrl?: string | null;
  nsfwScore: number | null;
  nsfwLabel: NsfwLabel | null;
  tags: string[];
  aiTags: string[];
  aiCaption: string | null;
  aiSummary?: string | null;
  classification?: string | null;
  aiSuggestions?: AiSuggestionsForSave | null;
  articleHtml?: string | null;
  articleText?: string | null;
  articleReadingMinutes?: number | null;
  ocrText?: string | null;
  annotations?: SaveAnnotations | null;
  rawJson?: RawSaveMetadata | null;
  savedAt: number;
  createdAt: number;
  embeddingUpdatedAt?: number | null;
  archivedAt: number | null;
  deletedAt: number | null;
}
