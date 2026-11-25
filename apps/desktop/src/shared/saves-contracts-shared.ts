import type { MediaType, Source } from "@pond/schema/db";
import { z } from "zod";
import type { LibraryQueryRequest } from "./library-query";
import type { OkResult, ReasonResult } from "./query-contracts-shared";

export interface SavesIdInput {
  id: string;
}

export interface SavesIdsInput {
  ids: Array<string>;
}

export interface SavesFileInput extends SavesIdInput {
  fileIndex?: number | null;
}

export type SaveFileFailure =
  | "not_found"
  | "no_files"
  | "out_of_range"
  | "missing"
  | "auxiliary_file"
  | "unsafe_path";

export type SaveFileResult<Data = Record<never, never>> = ReasonResult<
  SaveFileFailure | "internal_error",
  Data
>;

export interface SavesRetrievalInput {
  libraryQuery?: LibraryQueryRequest;
  query?: string;
  source?: Source;
  folderId?: string;
  media?: Array<MediaType>;
  limit?: number;
  saveIds?: Array<string>;
  visual?:
    | { kind: "saveId"; id: string }
    | { kind: "vector"; model: string; values: Array<number> };
}

const DerivedText = z.string().nullable().optional();
const DerivedList = z.array(z.string()).nullable().optional();

export const SavesDerivedPatchSchema = z.object({
  caption: DerivedText,
  captionModel: DerivedText,
  ocrText: DerivedText,
  ocrModel: DerivedText,
  transcript: DerivedText,
  transcriptModel: DerivedText,
  clipEmbedding: z.array(z.number()).nullable().optional(),
  clipModel: DerivedText,
  aesthetic: DerivedList,
  aestheticModel: DerivedText,
  sensitiveScore: z.number().min(0).max(1).nullable().optional(),
  sensitiveModel: DerivedText,
  autoTitleModel: DerivedText,
  suggestedTags: DerivedList,
  suggestedTagsModel: DerivedText,
});

export type SavesDerivedPatch = z.infer<typeof SavesDerivedPatchSchema>;

export interface SavesImportCounts {
  imported: number;
  skipped: number;
  queued?: number;
}

export type SavesImportResult = SavesImportCounts & OkResult;
