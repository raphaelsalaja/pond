import { createReadStream, existsSync } from "node:fs";
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { join, relative } from "node:path";
import { saves, settings as settingsTable } from "@pond/schema/db";
import type { Transaction } from "@pond/schema/tx";
import { eq, isNotNull, isNull } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb, getGlobalDb } from "../db";
import { readSaveMetadata } from "../lib/library";
import { readOrCreateLibraryId } from "../lib/library-id";
import { checkPointerSafety, readLibraryPointer } from "../lib/library-pointer";
import { isSamePath, normalizeLibraryPath } from "../lib/path-identity";
import { libraryRoot, resolvePaths, trashRoot } from "../paths";
import { executeBatch } from "./executor";
import { verifyLibraryBackup } from "./library-backup";
import { commitLibraryPointer } from "./recent-libraries";
import { recordForUndo } from "./undo";

interface IntegrityReport {
  orphans: string[];
  missing: string[];
  errors: Record<string, string>;
  totalIndexed: number;
  totalOnDisk: number;
}

export async function verifyLibraryIntegrity(): Promise<IntegrityReport> {
  const db = await getDb();
  const indexed = (
    await db.select({ id: saves.id }).from(saves).where(isNull(saves.deletedAt))
  ).map((r) => r.id);
  const indexedSet = new Set(indexed);

  const paths = resolvePaths();
  const entries = await readdir(paths.savesDir);
  const onDiskIds = entries
    .filter((e) => e.endsWith(".info"))
    .map((e) => e.slice(0, -".info".length));
  const onDiskSet = new Set(onDiskIds);

  const orphans: string[] = [];
  const errors: Record<string, string> = {};
  for (const id of onDiskIds) {
    if (!indexedSet.has(id)) {
      const meta = await readSaveMetadata(id);
      if (meta.status === "missing") {
        errors[id] = "info.json missing";
        continue;
      }
      if (meta.status === "corrupt") {
        errors[id] = `info.json unreadable: ${meta.error}`;
        continue;
      }
      orphans.push(id);
    }
  }

  const missing = indexed.filter((id) => !onDiskSet.has(id));

  try {
    await verifyLibraryBackup(libraryRoot());
  } catch (error) {
    errors.library =
      error instanceof Error
        ? error.message
        : "Library files could not be verified.";
  }

  return {
    orphans,
    missing,
    errors,
    totalIndexed: indexed.length,
    totalOnDisk: onDiskIds.length,
  };
}

export type RelocateMode = "copy" | "adopt";

interface RelocateResult {
  path: string;
  mode: RelocateMode;
  copied: number;
  skipped: number;
}

export async function relocateLibrary(
  dest: string,
  mode: RelocateMode,
): Promise<RelocateResult> {
  const src = libraryRoot();
  const srcResolved = normalizeLibraryPath(src);
  const destResolved = normalizeLibraryPath(dest);
  if (isSamePath(srcResolved, destResolved)) {
    return { path: src, mode, copied: 0, skipped: 0 };
  }

  const safety = checkPointerSafety(destResolved);
  if (!safety.ok) {
    throw new Error(`destination rejected: ${safety.reason ?? "unknown"}`);
  }
  if (!existsSync(destResolved)) {
    await mkdir(destResolved, { recursive: true });
  }

  let copied = 0;
  let skipped = 0;

  if (mode === "copy") {
    for (const entry of await readdir(srcResolved)) {
      const from = join(srcResolved, entry);
      const to = join(destResolved, entry);
      if (existsSync(to)) {
        log.warn("[pond library-ops] destination already has", entry);
        skipped += 1;
        continue;
      }
      await cp(from, to, { recursive: true });
      copied += 1;
    }
  }

  readOrCreateLibraryId(destResolved);

  const globalDb = await getGlobalDb();
  await globalDb
    .insert(settingsTable)
    .values({ id: "singleton", libraryRoot: destResolved })
    .onConflictDoUpdate({
      target: settingsTable.id,
      set: { libraryRoot: destResolved, updatedAt: new Date() },
    })
    .run();

  commitLibraryPointer(destResolved);

  log.info(
    `[pond library-ops] library ${mode === "copy" ? "copied" : "adopted"} → ${destResolved} (copied ${copied}, skipped ${skipped})`,
  );
  return { path: destResolved, mode, copied, skipped };
}

export async function syncLibraryRootMetadata(): Promise<void> {
  const pointerPath = readLibraryPointer();
  const pointer = pointerPath ? normalizeLibraryPath(pointerPath) : "";
  if (!pointer) return;

  const globalDb = await getGlobalDb();
  const rows = await globalDb
    .select({ libraryRoot: settingsTable.libraryRoot })
    .from(settingsTable)
    .where(eq(settingsTable.id, "singleton"));
  const stored = rows[0]?.libraryRoot ?? "";
  if (isSamePath(stored, pointer)) return;

  await globalDb
    .insert(settingsTable)
    .values({ id: "singleton", libraryRoot: pointer })
    .onConflictDoUpdate({
      target: settingsTable.id,
      set: { libraryRoot: pointer, updatedAt: new Date() },
    })
    .run();
  log.info("[pond library-ops] repaired library_root metadata drift", {
    pointer,
    stored: stored || null,
  });
}

export async function emptyTrashOlderThan(days: number): Promise<number> {
  const db = await getDb();
  const cutoff = days > 0 ? Date.now() - days * 86_400_000 : null;
  const all = await db.select().from(saves).where(isNotNull(saves.deletedAt));
  const targets = cutoff
    ? all.filter((r) => r.deletedAt && r.deletedAt.getTime() <= cutoff)
    : all;
  if (targets.length === 0) return 0;
  const txs: Transaction[] = targets.map((r) => ({
    kind: "purge",
    model: "save",
    id: r.id,
    before: r,
    meta: { actor: "system", actorReason: "trash-auto-empty" },
  }));
  await executeBatch(txs);
  for (const tx of txs) recordForUndo(tx);
  return txs.length;
}

export async function purgeDirectory(target: string): Promise<number> {
  if (!existsSync(target)) return 0;
  const entries = await readdir(target);
  for (const entry of entries) {
    await rm(join(target, entry), { recursive: true, force: true });
  }
  return entries.length;
}
void createReadStream;
void trashRoot;
void relative;
