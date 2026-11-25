import { extname } from "node:path";
import type { SaveFile } from "@pond/schema/db";
import { saves } from "@pond/schema/db";
import type { Transaction } from "@pond/schema/tx";
import { isAuxiliaryKind } from "@shared/save-file-names";
import { inArray } from "drizzle-orm";
import mime from "mime-types";
import { getDb } from "../db";
import { executeBatch } from "./executor";
import { recordBatchForUndo } from "./undo";

const EXTENSION = /^[a-z0-9][a-z0-9+_-]{0,15}$/i;

export interface BatchExtensionRuntime {
  read(ids: ReadonlyArray<string>): Promise<Array<ExtensionRow>>;
  commit(transactions: Array<Transaction>): Promise<void>;
  recordUndo(transactions: Array<Transaction>): void;
}

const runtime: BatchExtensionRuntime = {
  async read(ids) {
    const db = await getDb();
    return db
      .select()
      .from(saves)
      .where(inArray(saves.id, [...ids]));
  },
  async commit(transactions) {
    await executeBatch(transactions);
  },
  recordUndo: recordBatchForUndo,
};

function withExtension(path: string, extension: string): string {
  const current = extname(path);
  return `${current ? path.slice(0, -current.length) : path}.${extension}`;
}

export function planBatchExtensionEdits(
  rows: ReadonlyArray<ExtensionRow>,
  rawExtension: string,
) {
  const extension = rawExtension.trim().replace(/^\./, "").toLowerCase();
  if (!EXTENSION.test(extension)) {
    throw new Error("Enter a valid file extension.");
  }
  const transactions: Array<Transaction> = [];
  let changedFiles = 0;
  let skipped = 0;
  for (const row of rows) {
    const occupied = new Set(row.files.map((file) => file.path.toLowerCase()));
    const renames: Array<{ from: string; to: string }> = [];
    const files: Array<SaveFile> = [];
    for (const file of row.files) {
      if (isAuxiliaryKind(file.kind)) {
        files.push(file);
        continue;
      }
      const target = withExtension(file.path, extension);
      if (target.toLowerCase() === file.path.toLowerCase()) {
        files.push(file);
        continue;
      }
      if (
        occupied.has(target.toLowerCase()) &&
        target.toLowerCase() !== file.path.toLowerCase()
      ) {
        throw new Error(
          `${row.title || row.id} already contains a file named ${target}.`,
        );
      }
      occupied.delete(file.path.toLowerCase());
      occupied.add(target.toLowerCase());
      renames.push({ from: file.path, to: target });
      files.push({
        ...file,
        path: target,
        mimeType: mime.lookup(target) || file.mimeType || null,
      });
    }
    if (renames.length === 0) {
      skipped += 1;
      continue;
    }
    changedFiles += renames.length;
    transactions.push({
      kind: "update",
      model: "save",
      id: row.id,
      patch: { files },
      before: { files: row.files },
      fileRenames: renames,
      meta: { actor: "user", actorReason: "batch-extension" },
    });
  }
  return { transactions, changedFiles, skipped };
}

export interface ExtensionRow {
  id: string;
  title: string | null;
  files: Array<SaveFile>;
}

export async function batchEditExtensions(
  input: { ids: Array<string>; extension: string },
  adapter: BatchExtensionRuntime = runtime,
): Promise<{
  ok: true;
  changed: number;
  changedFiles: number;
  skipped: number;
}> {
  const ids = [...new Set(input.ids.filter(Boolean))];
  const rows = await adapter.read(ids);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered = ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
  const planned = planBatchExtensionEdits(ordered, input.extension);
  await adapter.commit(planned.transactions);
  adapter.recordUndo(planned.transactions);
  return {
    ok: true,
    changed: planned.transactions.length,
    changedFiles: planned.changedFiles,
    skipped: planned.skipped + ids.length - ordered.length,
  };
}
