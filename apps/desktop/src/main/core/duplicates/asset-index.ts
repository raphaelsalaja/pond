import type Database from "better-sqlite3";
import { z } from "zod";
import type { AssetRef } from "../../../shared/duplicate-contracts";
import { classifyLibraryFile } from "../../../shared/file-format";
import { AUXILIARY_KINDS } from "../../../shared/save-file-names";
import type { AssetMedia } from "./types";

const AUXILIARY_LIST = [...AUXILIARY_KINDS]
  .map((kind) => `'${kind.replaceAll("'", "''")}'`)
  .join(", ");

/** `saves.files` stays the source of truth; this table is derived from it by triggers so it cannot drift. */
function assetRowsFrom(owner: string, files: string, table = ""): string {
  return `
    SELECT
      ${owner},
      json_extract(file.value, '$.path'),
      COALESCE(json_extract(file.value, '$.kind'), ''),
      lower(COALESCE(json_extract(file.value, '$.sha256'), '')),
      CAST(COALESCE(json_extract(file.value, '$.size'), 0) AS INTEGER),
      json_extract(file.value, '$.mimeType'),
      NULL
    FROM ${table ? `${table}, ` : ""}json_each(
      CASE WHEN json_valid(${files}) AND json_type(${files}) = 'array' THEN ${files} ELSE '[]' END
    ) AS file
    WHERE file.type = 'object'
      AND typeof(json_extract(file.value, '$.path')) = 'text'
      AND COALESCE(json_extract(file.value, '$.kind'), '') NOT IN (${AUXILIARY_LIST})`;
}

const INSERT_COLUMNS =
  "INSERT OR REPLACE INTO save_assets (save_id, path, kind, sha256, size, mime_type, media)";

export function ensureAssetIndex(sqlite: Database.Database): void {
  const populated = sqlite
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name = 'save_assets_ai'",
    )
    .get();
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS save_assets (
      save_id TEXT NOT NULL,
      path TEXT NOT NULL,
      kind TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      size INTEGER NOT NULL,
      mime_type TEXT,
      media TEXT,
      PRIMARY KEY (save_id, path)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS save_assets_sha256_idx ON save_assets(sha256);
    CREATE INDEX IF NOT EXISTS save_assets_media_idx ON save_assets(media);

    CREATE TABLE IF NOT EXISTS asset_fingerprints (
      sha256 TEXT NOT NULL,
      algorithm TEXT NOT NULL,
      version INTEGER NOT NULL,
      status TEXT NOT NULL,
      value BLOB,
      attempts INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (sha256, algorithm)
    ) WITHOUT ROWID;

    CREATE TRIGGER IF NOT EXISTS save_assets_ai AFTER INSERT ON saves BEGIN
      DELETE FROM save_assets WHERE save_id = new.id;
      ${INSERT_COLUMNS} ${assetRowsFrom("new.id", "new.files")};
    END;

    CREATE TRIGGER IF NOT EXISTS save_assets_au
    AFTER UPDATE OF files ON saves WHEN old.files IS NOT new.files BEGIN
      DELETE FROM save_assets WHERE save_id = old.id;
      ${INSERT_COLUMNS} ${assetRowsFrom("new.id", "new.files")};
    END;

    CREATE TRIGGER IF NOT EXISTS save_assets_ad AFTER DELETE ON saves BEGIN
      DELETE FROM save_assets WHERE save_id = old.id;
    END;
  `);
  if (!populated) {
    rebuildAssetIndex(sqlite);
  }
}

export function rebuildAssetIndex(sqlite: Database.Database): number {
  return sqlite.transaction(() => {
    sqlite.exec("DELETE FROM save_assets");
    sqlite.exec(
      `${INSERT_COLUMNS} ${assetRowsFrom("saves.id", "saves.files", "saves")}`,
    );
    return z
      .object({ count: z.number() })
      .parse(sqlite.prepare("SELECT COUNT(*) AS count FROM save_assets").get())
      .count;
  })();
}

const PendingMediaRowSchema = z.object({
  save_id: z.string(),
  path: z.string(),
  mime_type: z.string().nullable(),
});

export function mediaForFile(
  path: string,
  mimeType: string | null | undefined,
): AssetMedia | null {
  const { mediaType } = classifyLibraryFile(path, mimeType);
  return mediaType === "image" || mediaType === "video" || mediaType === "audio"
    ? mediaType
    : null;
}

/** Media type comes from the same classifier the rest of the app uses, which SQL cannot call, so new rows are tagged in batches. */
export function classifyPendingAssets(
  sqlite: Database.Database,
  limit = 500,
): number {
  const rows = z
    .array(PendingMediaRowSchema)
    .parse(
      sqlite
        .prepare(
          "SELECT save_id, path, mime_type FROM save_assets WHERE media IS NULL LIMIT ?",
        )
        .all(limit),
    );
  if (rows.length === 0) {
    return 0;
  }
  const update = sqlite.prepare(
    "UPDATE save_assets SET media = ? WHERE save_id = ? AND path = ?",
  );
  sqlite.transaction(() => {
    for (const row of rows) {
      update.run(
        mediaForFile(row.path, row.mime_type) ?? "other",
        row.save_id,
        row.path,
      );
    }
  })();
  return rows.length;
}

const AssetMatchRowSchema = z.object({
  save_id: z.string(),
  path: z.string(),
  kind: z.string(),
  size: z.number(),
  sha256: z.string(),
  title: z.string().nullable(),
  in_trash: z.number(),
});

export interface IndexedAsset extends AssetRef {
  title: string | null;
  inTrash: boolean;
}

/** Saves holding any of these original files, live ones first, so importing a file again offers back a Save in Trash instead of a new copy. */
export function findAssetsBySha256(
  sqlite: Database.Database,
  hashes: ReadonlyArray<string>,
): Map<string, Array<IndexedAsset>> {
  const wanted = [...new Set(hashes.map((hash) => hash.toLowerCase()))];
  const found = new Map<string, Array<IndexedAsset>>();
  const select = sqlite.prepare(`
    SELECT a.save_id, a.path, a.kind, a.size, a.sha256, s.title,
      s.deleted_at IS NOT NULL AS in_trash
    FROM json_each(?) AS wanted
    JOIN save_assets a ON a.sha256 = wanted.value
    JOIN saves s ON s.id = a.save_id
    ORDER BY in_trash, s.saved_at DESC, a.save_id, a.path
  `);
  for (let start = 0; start < wanted.length; start += 500) {
    const rows = z
      .array(AssetMatchRowSchema)
      .parse(select.all(JSON.stringify(wanted.slice(start, start + 500))));
    for (const row of rows) {
      const list = found.get(row.sha256) ?? [];
      list.push({
        saveId: row.save_id,
        path: row.path,
        kind: row.kind,
        size: row.size,
        sha256: row.sha256,
        title: row.title,
        inTrash: row.in_trash === 1,
      });
      found.set(row.sha256, list);
    }
  }
  return found;
}
