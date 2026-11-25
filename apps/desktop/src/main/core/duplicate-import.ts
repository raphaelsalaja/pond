import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type {
  DuplicateImportCandidate,
  DuplicateImportChoice,
  DuplicateImportDecision,
} from "@shared/saves-import-contracts";
import { getDb } from "../db";
import { findAssetsBySha256 } from "./duplicates/asset-index";

export type { DuplicateImportCandidate };

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

async function importableFiles(
  paths: ReadonlyArray<string>,
): Promise<Array<string>> {
  const files: Array<string> = [];
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
    if (!details.isDirectory()) {
      return;
    }
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      if (entry.isFile() || entry.isDirectory()) {
        await visit(join(absolute, entry.name));
      }
    }
  }
  for (const path of paths) await visit(path);
  return files;
}

export async function reviewImportDuplicates(
  paths: ReadonlyArray<string>,
): Promise<Array<DuplicateImportCandidate>> {
  const files = await importableFiles(paths);
  const hashed: Array<{ path: string; sha256: string }> = [];
  for (const path of files) {
    hashed.push({ path, sha256: (await hashImportFile(path)).toLowerCase() });
  }
  const db = await getDb();
  const assets = findAssetsBySha256(
    db.$raw,
    hashed.map((file) => file.sha256),
  );
  return hashed.flatMap(({ path, sha256 }) => {
    const existing = assets.get(sha256)?.[0];
    return existing
      ? [
          {
            path,
            filename: basename(path),
            existingId: existing.saveId,
            existingTitle: existing.title,
            inTrash: existing.inTrash,
          },
        ]
      : [];
  });
}

interface ResolvedDuplicates {
  useExisting: Record<string, string>;
  restore: Set<string>;
}

/** Only the review dialog sends `restore`, so callers that ask for `use-existing` import a file whose match is in Trash as new. */
export function resolveDuplicateDecisions(
  candidates: ReadonlyArray<DuplicateImportCandidate>,
  decisions: Readonly<Record<string, DuplicateImportDecision>>,
  policy: DuplicateImportChoice,
): ResolvedDuplicates {
  const useExisting: Record<string, string> = {};
  const restore = new Set<string>();
  for (const candidate of candidates) {
    const choice = decisions[candidate.path] ?? policy;
    if (choice === "keep-both") continue;
    if (candidate.inTrash && choice !== "restore") continue;
    useExisting[candidate.path] = candidate.existingId;
    if (candidate.inTrash) restore.add(candidate.path);
  }
  return { useExisting, restore };
}
