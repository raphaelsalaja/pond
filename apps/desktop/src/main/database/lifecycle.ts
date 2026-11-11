import { existsSync } from "node:fs";
import type Database from "better-sqlite3";
import log from "electron-log/main.js";
import { recoverBatchJournal } from "../core/batch-journal";
import { backfillFontActivationIndex } from "../core/font-activation";
import { hydrateOrganizationBundle } from "../core/organization-bundle";
import { backfillVecBatch } from "../core/vec-index";
import { readOrCreateLibraryId } from "../lib/library-id";
import { pinOpenLibrary } from "../lib/library-placement";
import { resolvePaths } from "../paths";
import { type Db, GLOBAL_CACHE_KIB, openSqlite, wrapSqlite } from "./client";
import { migrateGlobal } from "./migrations";
import { initializePondSchema } from "./pond-schema";

let cachedPond: Db | null = null;
let cachedGlobal: Db | null = null;
let pondDbInflight: Promise<Db> | null = null;

export async function getGlobalDb(): Promise<Db> {
  if (cachedGlobal) return cachedGlobal;
  const paths = resolvePaths();
  log.info("[pond db] opening global", paths.globalDb);
  const sqlite = openSqlite(paths.globalDb, GLOBAL_CACHE_KIB);
  migrateGlobal(sqlite);
  cachedGlobal = wrapSqlite(sqlite);
  return cachedGlobal;
}

export async function getDb(): Promise<Db> {
  if (cachedPond) return cachedPond;
  if (pondDbInflight) return pondDbInflight;

  pondDbInflight = openPondDb().finally(() => {
    pondDbInflight = null;
  });
  return pondDbInflight;
}

async function openPondDb(): Promise<Db> {
  await new Promise<void>((resolve) => setImmediate(resolve));

  const paths = resolvePaths();
  log.info("[pond db] opening pond index", paths.indexDb);

  readOrCreateLibraryId(paths.libraryRoot);
  const sqlite = openSqlite(paths.indexDb);
  let vectorEnabled: boolean;
  let opened: Db;
  try {
    vectorEnabled = initializePondSchema(sqlite);
    opened = wrapSqlite(sqlite);
    await recoverBatchJournal(
      paths.libraryRoot,
      (batchId) =>
        sqlite
          .prepare("SELECT 1 FROM mutation_commits WHERE batch_id = ?")
          .get(batchId) != null,
    );
    sqlite.exec("DELETE FROM mutation_commits");
    hydrateOrganizationBundle(opened, paths.libraryRoot);
  } catch (error) {
    sqlite.close();
    throw error;
  }
  cachedPond = opened;

  ensureLibraryMetadata();
  pinOpenLibrary(paths.libraryRoot, paths.libraryId);

  scheduleDataMigrations(sqlite, vectorEnabled);

  return cachedPond;
}

function scheduleDataMigrations(
  sqlite: Database.Database,
  vectorEnabled: boolean,
): void {
  setImmediate(() => {
    if (!sqlite.open || cachedPond?.$raw !== sqlite) return;
    try {
      const updated = backfillFontActivationIndex(sqlite);
      if (updated > 0)
        log.info("[pond db] font activation backfill", { updated });
    } catch (err) {
      log.warn("[pond db] font activation backfill failed", err);
    }
  });

  const runVecBatch = (): void => {
    if (!sqlite.open || cachedPond?.$raw !== sqlite) return;
    try {
      const result = backfillVecBatch(sqlite);
      if (result.processed > 0) {
        log.info("[pond db] vec backfill batch", result);
      }
      if (result.hasMore) setImmediate(runVecBatch);
    } catch (err) {
      log.warn("[pond db] vec backfill failed", err);
    }
  };
  if (vectorEnabled) setImmediate(runVecBatch);
}

export function closeDb(): void {
  if (cachedPond) {
    try {
      cachedPond.$raw.close();
    } catch (err) {
      log.warn("[pond db] close failed", err);
    }
    cachedPond = null;
  }
}

function ensureLibraryMetadata(): void {
  const paths = resolvePaths();
  if (!existsSync(paths.libraryRoot)) return;
  if (existsSync(paths.libraryMetadata)) return;
  readOrCreateLibraryId(paths.libraryRoot);
}
