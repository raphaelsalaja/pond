import { createReadStream, createWriteStream, existsSync } from "node:fs";
import {
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { saves, settings as settingsTable } from "@pond/schema/db";
import type { Transaction } from "@pond/schema/tx";
import archiver from "archiver";
import { eq, isNotNull } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../db";
import { readItemMetadata } from "../lib/library";
import { libraryRoot, resolvePaths, trashRoot } from "../paths";
import { executeBatch } from "./executor";
import { recordForUndo } from "./undo";

export interface IntegrityReport {
  orphans: string[];
  missing: string[];
  errors: Record<string, string>;
  totalIndexed: number;
  totalOnDisk: number;
}

export async function verifyLibraryIntegrity(): Promise<IntegrityReport> {
  const db = await getDb();
  const indexed = (await db.select({ id: saves.id }).from(saves)).map(
    (r) => r.id,
  );
  const indexedSet = new Set(indexed);

  const paths = resolvePaths();
  let entries: string[] = [];
  try {
    entries = await readdir(paths.itemsDir);
  } catch {
    /* libraryRoot/items missing — leave entries empty */
  }
  const onDiskIds = entries
    .filter((e) => e.endsWith(".info"))
    .map((e) => e.slice(0, -".info".length));
  const onDiskSet = new Set(onDiskIds);

  const orphans: string[] = [];
  const errors: Record<string, string> = {};
  for (const id of onDiskIds) {
    if (!indexedSet.has(id)) {
      const meta = await readItemMetadata(id);
      if (!meta) {
        errors[id] = "metadata.json missing or unreadable";
        continue;
      }
      orphans.push(id);
    }
  }

  const missing = indexed.filter((id) => !onDiskSet.has(id));

  return {
    orphans,
    missing,
    errors,
    totalIndexed: indexed.length,
    totalOnDisk: onDiskIds.length,
  };
}

export async function moveLibrary(dest: string): Promise<string> {
  const src = libraryRoot();
  if (!existsSync(dest)) await mkdir(dest, { recursive: true });

  const srcResolved = src.replace(/\/$/, "");
  const destResolved = dest.replace(/\/$/, "");
  if (srcResolved === destResolved) return src;

  for (const entry of await readdir(src)) {
    const from = join(src, entry);
    const to = join(dest, entry);
    if (existsSync(to)) {
      log.warn("[pond library-ops] destination already has", entry);
      continue;
    }
    await cp(from, to, { recursive: true });
  }

  const db = await getDb();
  await db
    .update(settingsTable)
    .set({ libraryRoot: dest, updatedAt: new Date() })
    .where(eq(settingsTable.id, "singleton"))
    .run();

  log.info("[pond library-ops] library copied to", dest);
  return dest;
}

export async function exportLibraryZip(outPath: string): Promise<string> {
  const root = libraryRoot();
  await mkdir(dirname(outPath), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(outPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    out.on("close", () => resolve());
    out.on("error", reject);
    archive.on("warning", (err) => log.warn("[pond export] archiver", err));
    archive.on("error", reject);
    archive.pipe(out);
    archive.directory(root, basename(root));
    void archive.finalize();
  });

  log.info("[pond library-ops] exported zip to", outPath);
  return outPath;
}

export async function exportLibraryJson(destDir: string): Promise<string> {
  const root = join(
    destDir,
    `pond-export-${new Date().toISOString().slice(0, 10)}`,
  );
  await mkdir(join(root, "items"), { recursive: true });

  const db = await getDb();
  const rows = await db.select().from(saves);

  const manifest = {
    exportedAt: new Date().toISOString(),
    libraryRoot: libraryRoot(),
    count: rows.length,
    items: rows.map((r) => ({ id: r.id, source: r.source, url: r.url })),
  };
  await writeFile(
    join(root, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  for (const row of rows) {
    await writeFile(
      join(root, "items", `${row.id}.json`),
      JSON.stringify(row, null, 2),
    );
  }

  log.info("[pond library-ops] exported JSON to", root);
  return root;
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

export async function purgeLibrarySubdir(
  subdir: string,
  predicate?: (filename: string) => boolean,
): Promise<number> {
  const target = join(libraryRoot(), subdir);
  if (!existsSync(target)) return 0;
  let removed = 0;
  for (const entry of await readdir(target)) {
    if (predicate && !predicate(entry)) continue;
    await rm(join(target, entry), { recursive: true, force: true });
    removed += 1;
  }
  return removed;
}

void readFile;
void rename;
void stat;
void createReadStream;
void trashRoot;
void relative;
