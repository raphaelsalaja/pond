import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { saves } from "@pond/schema/db";
import { isAuxiliaryKind } from "@shared/save-file-names";
import { getDb } from "../db";

export interface DuplicateImportCandidate {
  path: string;
  filename: string;
  existingId: string;
  existingTitle: string | null;
  inTrash: boolean;
}

export async function hashImportFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolveHash, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolveHash);
  });
  return hash.digest("hex");
}

async function importableFiles(paths: readonly string[]): Promise<string[]> {
  const files: string[] = [];
  const visited = new Set<string>();
  async function visit(path: string): Promise<void> {
    const absolute = resolve(path);
    if (visited.has(absolute) || basename(path).startsWith(".")) return;
    visited.add(absolute);
    const details = await stat(absolute).catch(() => null);
    if (!details) return;
    if (details.isFile() && details.size > 0) {
      files.push(absolute);
      return;
    }
    if (!details.isDirectory()) return;
    for (const entry of await readdir(absolute, { withFileTypes: true }))
      if (entry.isFile() || entry.isDirectory())
        await visit(join(absolute, entry.name));
  }
  for (const path of paths) await visit(path);
  return files;
}

export async function reviewImportDuplicates(
  paths: readonly string[],
): Promise<DuplicateImportCandidate[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: saves.id,
      title: saves.title,
      files: saves.files,
      deletedAt: saves.deletedAt,
    })
    .from(saves);
  /** A Save in Trash still matches, so importing the file again offers it back instead of piling up copies; a match outside Trash wins. */
  const byHash = new Map<
    string,
    { id: string; title: string | null; inTrash: boolean }
  >();
  for (const row of rows)
    for (const file of row.files) {
      if (isAuxiliaryKind(file.kind) || !file.sha256) continue;
      const hash = file.sha256.toLowerCase();
      const inTrash = row.deletedAt != null;
      const current = byHash.get(hash);
      if (!current || (current.inTrash && !inTrash))
        byHash.set(hash, { id: row.id, title: row.title, inTrash });
    }
  const candidates: DuplicateImportCandidate[] = [];
  for (const path of await importableFiles(paths)) {
    const existing = byHash.get((await hashImportFile(path)).toLowerCase());
    if (existing)
      candidates.push({
        path,
        filename: basename(path),
        existingId: existing.id,
        existingTitle: existing.title,
        inTrash: existing.inTrash,
      });
  }
  return candidates;
}
