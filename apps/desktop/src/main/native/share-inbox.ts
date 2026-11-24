import { realpath, rm } from "node:fs/promises";
import { dirname, relative, sep } from "node:path";
import type { SavesImportFilesResult } from "@shared/saves-import-contracts";
import { importFiles as importFilesDefault } from "../core/import-files";
import { shareInboxPath } from "./paths";

interface InboxEntry {
  file: string;
  drop: string;
}

/** Only `<inbox>/<drop>/<file>` is accepted, so a local process on the socket can't import arbitrary paths. */
export async function inboxEntries(
  paths: ReadonlyArray<string>,
  root: string,
): Promise<Array<InboxEntry>> {
  const base = await realpath(root).catch(() => null);
  if (!base) {
    return [];
  }
  const entries: Array<InboxEntry> = [];
  for (const path of paths) {
    const file = await realpath(path).catch(() => null);
    if (!file) {
      continue;
    }
    const parts = relative(base, file).split(sep);
    if (parts.length !== 2 || parts.some((p) => p === ".." || p === "")) {
      continue;
    }
    entries.push({ file, drop: dirname(file) });
  }
  return entries;
}

interface ShareInboxDeps {
  root?: string;
  importFiles?: (input: {
    paths: ReadonlyArray<string>;
  }) => Promise<SavesImportFilesResult>;
}

export async function importSharedFiles(
  paths: ReadonlyArray<string>,
  deps: ShareInboxDeps = {},
): Promise<{ ids: Array<string> }> {
  const root = deps.root ?? shareInboxPath();
  const entries = await inboxEntries(paths, root);
  if (entries.length === 0) {
    throw new Error("no_files");
  }
  const run = deps.importFiles ?? importFilesDefault;
  try {
    const result = await run({ paths: entries.map((e) => e.file) });
    if (!result.ok) {
      throw new Error(result.error);
    }
    return { ids: result.ids };
  } finally {
    const drops = new Set(entries.map((e) => e.drop));
    await Promise.all(
      [...drops].map((drop) => rm(drop, { recursive: true, force: true })),
    );
  }
}
