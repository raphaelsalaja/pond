import { join } from "node:path";
import {
  folders,
  libraryScan,
  type SyncAction,
  saveFolders,
  saves,
  syncActions,
} from "@pond/schema/db";
import { isAuxiliaryKind } from "@shared/save-file-names";
import { eq } from "drizzle-orm";
import log from "electron-log/main.js";
import { type Db, getDb } from "../db";
import { readSaveMetadata, scanLibrary } from "../lib/library";
import { withRawSlim } from "../lib/raw-slim";
import { libraryRoot } from "../paths";
import { readEnrichmentSidecar } from "./enrichment-sidecar";
import { broadcastSyncAction, withMutationScope } from "./executor";
import { runLibraryTransfer } from "./library-transfers";
import { libraryMediaMetadata } from "./storage/library-media-storage";

export async function reconcileLibrary(): Promise<{
  updated: number;
  total: number;
}> {
  return runLibraryTransfer(async () =>
    reconcileLibraryIndex({
      db: await getDb(),
      root: libraryRoot(),
      mutate: withMutationScope,
      changed: broadcastSyncAction,
    }),
  );
}

interface LibraryScanRuntime {
  db: Db;
  root: string;
  mutate<T>(operation: () => Promise<T>): Promise<T>;
  changed(action: SyncAction): void;
}

export async function reconcileLibraryIndex(
  runtime: LibraryScanRuntime,
): Promise<{
  updated: number;
  total: number;
}> {
  const { db, root } = runtime;
  let updated = 0;
  let total = 0;

  for await (const { id, mtimeMs } of scanLibrary(root)) {
    total++;
    await runtime.mutate(async () => {
      const existing = await db
        .select()
        .from(libraryScan)
        .where(eq(libraryScan.itemId, id));

      if (existing[0] && existing[0].mtimeMs === mtimeMs) return;
      const read = await readSaveMetadata(id, root);
      if (read.status !== "ok") {
        await stampScan(db, id, mtimeMs);
        return;
      }
      const { metadata } = read;

      if (!metadata.source || !metadata.sourceId || !metadata.url) {
        log.warn("[pond scan] skipping item with incomplete metadata", {
          id,
          hasSource: Boolean(metadata.source),
          hasSourceId: Boolean(metadata.sourceId),
          hasUrl: Boolean(metadata.url),
        });
        await stampScan(db, id, mtimeMs);
        return;
      }

      const files = metadata.files;
      const tags = metadata.tags ?? [];

      try {
        const enrichment = readEnrichmentSidecar(id, root) ?? {};
        const insertValues: typeof saves.$inferInsert = {
          ...enrichment,
          ...metadata.pond.userData,
          id,
          status: (await originalsPresent(root, id, files))
            ? "complete"
            : "failed",
          source: metadata.source,
          sourceId: metadata.sourceId,
          importedFrom: metadata.importedFrom,
          url: metadata.url,
          title: metadata.name,
          description: metadata.pond.description ?? null,
          author: metadata.pond.author ?? null,
          notes: metadata.annotation || null,
          mediaUrl: null,
          mediaType: metadata.pond.mediaType ?? null,
          rawJson: metadata.pond.rawSource ?? null,
          tags,
          files,
          coverIndex: metadata.pond.coverIndex ?? 0,
          width: metadata.width,
          height: metadata.height,
          fileSize: metadata.size,
          deletedAt:
            metadata.deletedAt != null ? new Date(metadata.deletedAt) : null,
          savedAt: new Date(metadata.importedAt),
          createdAt: new Date(metadata.btime),
          publishedAt:
            metadata.pond.publishedAt != null
              ? new Date(metadata.pond.publishedAt)
              : null,
        };
        const updateSet = {
          ...enrichment,
          ...metadata.pond.userData,
          importedFrom: metadata.importedFrom,
          title: metadata.name,
          description: metadata.pond.description ?? null,
          author: metadata.pond.author ?? null,
          notes: metadata.annotation || null,
          tags,
          files,
          width: metadata.width,
          height: metadata.height,
          fileSize: metadata.size,
          deletedAt:
            metadata.deletedAt != null ? new Date(metadata.deletedAt) : null,
        };

        const prior = await db
          .select({ id: saves.id })
          .from(saves)
          .where(eq(saves.id, id));
        const wasInsert = prior.length === 0;

        const action = db.transaction((tx) => {
          tx.insert(saves)
            .values(withRawSlim(insertValues))
            .onConflictDoUpdate({ target: saves.id, set: updateSet })
            .run();

          tx.delete(saveFolders).where(eq(saveFolders.saveId, id)).run();
          for (const folderId of metadata.folders) {
            if (
              tx
                .select({ id: folders.id })
                .from(folders)
                .where(eq(folders.id, folderId))
                .get()
            ) {
              tx.insert(saveFolders)
                .values({ saveId: id, folderId })
                .onConflictDoNothing()
                .run();
            }
          }
          const inserted = tx
            .insert(syncActions)
            .values({
              modelName: "save",
              modelId: id,
              action: wasInsert ? "I" : "U",
              data: wasInsert ? insertValues : updateSet,
              actor: "system",
              actorReason: "library-scan",
            })
            .returning()
            .all()[0];
          stampScan(tx, id, mtimeMs);
          return inserted;
        });
        if (action) runtime.changed(action);
        updated++;
      } catch (err) {
        log.warn("[pond scan] upsert failed", { id, err });
      }
    });
  }

  log.info(`[pond scan] updated=${updated} total=${total}`);
  return { updated, total };
}

function stampScan(
  db: Pick<Awaited<ReturnType<typeof getDb>>, "insert">,
  itemId: string,
  mtimeMs: number,
): void {
  db.insert(libraryScan)
    .values({ itemId, mtimeMs })
    .onConflictDoUpdate({
      target: libraryScan.itemId,
      set: { mtimeMs, scannedAt: new Date() },
    })
    .run();
}

async function originalsPresent(
  root: string,
  id: string,
  files: Array<{ path: string; size: number; kind: string }>,
): Promise<boolean> {
  const originals = files.filter((file) => !isAuxiliaryKind(file.kind));
  for (const file of originals) {
    try {
      const actual = await libraryMediaMetadata(
        join(root, "items", `${id}.info`, file.path),
      );
      if (actual.originalSize !== file.size) return false;
    } catch {
      return false;
    }
  }
  return true;
}
