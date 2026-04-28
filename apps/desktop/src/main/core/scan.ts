import { libraryScan, type SaveFile, saves } from "@pond/schema/db";
import { eq } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../db";
import { scanLibrary } from "../lib/library";

/**
 * Reconcile the SQLite index against the on-disk library. Cheap and
 * idempotent — only rows whose `metadata.json` mtime has changed since
 * we last saw them get rehydrated. Runs once on startup and is safe to
 * trigger from the renderer via an IPC call.
 *
 * Never writes to disk; it's read-only against the library.
 */
export async function reconcileLibrary(): Promise<{
  updated: number;
  total: number;
}> {
  const db = await getDb();
  let updated = 0;
  let total = 0;

  for await (const { id, mtimeMs, metadata } of scanLibrary()) {
    total++;
    const existing = await db
      .select()
      .from(libraryScan)
      .where(eq(libraryScan.itemId, id));

    if (existing[0] && existing[0].mtimeMs === mtimeMs) continue;
    if (!metadata) continue;

    const files: SaveFile[] = metadata.files.map((f) => ({
      kind: f.kind,
      path: f.path,
      sha256: f.sha256,
      size: f.size,
    }));

    // Reconstruct a saves row from metadata. The mapping mirrors
    // `buildItemMetadata` in `lib/library.ts` — keep the two in sync.
    await db
      .insert(saves)
      .values({
        id,
        source:
          metadata.source as unknown as (typeof saves.$inferInsert)["source"],
        sourceId: metadata.sourceId,
        url: metadata.url,
        title: metadata.name,
        description: metadata.pond.description ?? null,
        author: metadata.pond.author ?? null,
        notes: metadata.annotation || null,
        mediaUrl: null,
        blobUrl: metadata.files[0]
          ? `pond://${id}/${metadata.files[0].path}`
          : null,
        mediaType:
          (metadata.pond.mediaType as
            | (typeof saves.$inferInsert)["mediaType"]
            | null
            | undefined) ?? null,
        rawJson: metadata.pond.rawSource ?? null,
        tags: metadata.tags,
        aiTags: metadata.aiTags,
        aiCaption: metadata.aiCaption,
        aiSuggestions: null,
        ocrText: metadata.pond.ocrText ?? null,
        dominantColors: metadata.palettes,
        files,
        coverIndex: metadata.pond.coverIndex ?? 0,
        width: metadata.width,
        height: metadata.height,
        fileSize: metadata.size,
        archivedAt: null,
        deletedAt: metadata.isDeleted ? new Date(metadata.mtime) : null,
        savedAt: new Date(metadata.importedAt),
        createdAt: new Date(metadata.btime),
      })
      .onConflictDoUpdate({
        target: saves.id,
        set: {
          title: metadata.name,
          description: metadata.pond.description ?? null,
          author: metadata.pond.author ?? null,
          notes: metadata.annotation || null,
          tags: metadata.tags,
          aiTags: metadata.aiTags,
          aiCaption: metadata.aiCaption,
          dominantColors: metadata.palettes,
          files,
          width: metadata.width,
          height: metadata.height,
          fileSize: metadata.size,
        },
      })
      .run();

    await db
      .insert(libraryScan)
      .values({
        itemId: id,
        mtimeMs,
      })
      .onConflictDoUpdate({
        target: libraryScan.itemId,
        set: { mtimeMs, scannedAt: new Date() },
      })
      .run();

    updated++;
  }

  log.info(`[pond scan] updated=${updated} total=${total}`);
  return { updated, total };
}
