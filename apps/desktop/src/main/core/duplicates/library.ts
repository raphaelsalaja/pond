import { SOURCES } from "@pond/schema/db";
import type Database from "better-sqlite3";
import { z } from "zod";
import { normalizedEmbeddingVector } from "../../../shared/embeddings";
import { parseJsonVector } from "../vec-index";
import { mediaForFile } from "./asset-index";
import type { AssetMedia, LibraryAsset, LibrarySave } from "./types";

const SaveRowSchema = z.object({
  id: z.string(),
  /** An unknown source can still match by files; `local` keeps it out of source identity matching. */
  source: z.enum(SOURCES).catch("local"),
  source_id: z.string(),
  url: z.string(),
  status: z.string(),
  clip_model: z.string().nullable(),
  clip_embedding: z.string().nullable(),
  capture_url: z.string().min(1).nullable().catch(null),
  split_source_id: z.string().min(1).nullable().catch(null),
});

const AssetRowSchema = z.object({
  save_id: z.string(),
  path: z.string(),
  kind: z.string(),
  sha256: z.string(),
  size: z.number(),
  mime_type: z.string().nullable(),
  media: z.string().nullable(),
});

function clipVector(
  row: z.infer<typeof SaveRowSchema>,
  model: string | null,
): Array<number> | null {
  if (!model || row.status !== "complete" || row.clip_model !== model) {
    return null;
  }
  const vector = parseJsonVector(row.clip_embedding);
  if (!vector) {
    return null;
  }
  try {
    return normalizedEmbeddingVector(vector);
  } catch {
    /** A malformed derived vector is ignored until enrichment replaces it. */
    return null;
  }
}

function assetMedia(row: z.infer<typeof AssetRowSchema>): AssetMedia | null {
  if (row.media === "image" || row.media === "video" || row.media === "audio") {
    return row.media;
  }
  if (row.media === "other") {
    return null;
  }
  return mediaForFile(row.path, row.mime_type);
}

/** Every live Save with its original files, read in two passes so the scan never parses `files` JSON in TypeScript. */
export function loadLibrarySaves(
  sqlite: Database.Database,
  clipModel: string | null,
): Array<LibrarySave> {
  const saves = new Map<string, LibrarySave>();
  const rows = z.array(SaveRowSchema).parse(
    sqlite
      .prepare(
        `SELECT id, source, source_id, url, status, clip_model, clip_embedding,
          CASE WHEN json_valid(raw_json) THEN json_extract(raw_json, '$.capture.url') END AS capture_url,
          CASE WHEN json_valid(raw_json) THEN json_extract(raw_json, '$.split.sourceId') END AS split_source_id
        FROM saves WHERE deleted_at IS NULL`,
      )
      .all(),
  );
  for (const row of rows) {
    saves.set(row.id, {
      id: row.id,
      source: row.source,
      sourceId: row.source_id,
      url: row.url,
      captureUrl: row.capture_url,
      splitSourceId: row.split_source_id,
      assets: [],
      clip: clipVector(row, clipModel),
    });
  }

  const assets = z.array(AssetRowSchema).parse(
    sqlite
      .prepare(
        `SELECT a.save_id, a.path, a.kind, a.sha256, a.size, a.mime_type, a.media
        FROM save_assets a JOIN saves s ON s.id = a.save_id
        WHERE s.deleted_at IS NULL
        ORDER BY a.save_id, a.path`,
      )
      .all(),
  );
  for (const row of assets) {
    const asset: LibraryAsset = {
      saveId: row.save_id,
      path: row.path,
      kind: row.kind,
      size: row.size,
      sha256: row.sha256,
      media: assetMedia(row),
    };
    saves.get(row.save_id)?.assets.push(asset);
  }
  return [...saves.values()];
}
