import { constants } from "node:fs";
import {
  copyFile,
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Transaction } from "@pond/schema/tx";
import { z } from "zod";
import { renameWithRetry } from "../lib/rename-retry";
import { saveDirIn, trashSaveDirIn } from "../paths";

const SnapshotSchema = z.object({
  path: z.string(),
  kind: z.enum(["file", "directory"]),
  existed: z.boolean(),
});
const JournalSchema = z.object({
  batchId: z.string(),
  snapshots: z.array(SnapshotSchema),
});
type Journal = z.infer<typeof JournalSchema>;
interface SnapshotTarget {
  path: string;
  kind: "file" | "directory";
}

function inside(root: string, path: string): string {
  const rel = relative(resolve(root), resolve(path));
  if (!rel || isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`))
    throw new Error("A transaction path is outside the library.");
  return rel;
}
async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return false;
    throw error;
  }
}
async function rejectSymlinks(root: string, path: string): Promise<void> {
  const rel = inside(root, path);
  let current = resolve(root);
  for (const part of rel.split(sep)) {
    current = join(current, part);
    if (!(await exists(current))) return;
    if ((await lstat(current)).isSymbolicLink())
      throw new Error("Transaction paths cannot contain symbolic links.");
  }
}
function targetsFor(
  root: string,
  transactions: readonly Transaction[],
): SnapshotTarget[] {
  const targets = new Map<string, SnapshotTarget>();
  const add = (path: string, kind: SnapshotTarget["kind"]) => {
    inside(root, path);
    targets.set(path, { path, kind });
  };
  for (const tx of transactions) {
    if (tx.model === "folder" || tx.model === "saved_view")
      add(join(root, "organization.json"), "file");
    if (tx.model !== "save" && tx.model !== "save_folder") continue;
    if (
      !tx.id ||
      tx.id.includes("/") ||
      tx.id.includes("\\") ||
      tx.id === "." ||
      tx.id === ".."
    )
      throw new Error("Invalid Save ID.");
    const directory = saveDirIn(root, tx.id);
    if (tx.kind === "delete" || tx.kind === "purge") {
      add(directory, "directory");
      add(trashSaveDirIn(root, tx.id), "directory");
    } else {
      add(join(directory, "info.json"), "file");
      add(join(directory, "source.json"), "file");
      if ("titleLock" in tx && tx.titleLock)
        add(join(directory, "user-title.json"), "file");
      if ("files" in tx)
        for (const file of tx.files ?? []) {
          const path = join(directory, file.filename);
          inside(directory, path);
          add(path, "file");
        }
      if ("fileRenames" in tx)
        for (const file of tx.fileRenames ?? []) {
          const source = join(directory, file.from);
          const destination = join(directory, file.to);
          inside(directory, source);
          inside(directory, destination);
          add(source, "file");
          add(destination, "file");
        }
    }
  }
  return [...targets.values()].filter(
    (target) =>
      ![...targets.values()].some(
        (parent) =>
          parent.kind === "directory" &&
          target.path !== parent.path &&
          target.path.startsWith(`${parent.path}${sep}`),
      ),
  );
}
async function restoreJournal(
  root: string,
  directory: string,
  journal: Journal,
): Promise<void> {
  for (const [index, snapshot] of journal.snapshots.entries()) {
    const destination = join(root, snapshot.path);
    inside(root, destination);
    await rejectSymlinks(root, destination);
    if (!snapshot.existed) {
      await rm(destination, { recursive: true, force: true });
      continue;
    }
    const backup = join(directory, "before", String(index));
    if (snapshot.kind === "directory") {
      await rm(destination, { recursive: true, force: true });
      await cp(backup, destination, {
        recursive: true,
        mode: constants.COPYFILE_FICLONE,
      });
    } else {
      await mkdir(dirname(destination), { recursive: true });
      const temporary = `${destination}.pond-restore`;
      await copyFile(backup, temporary);
      await renameWithRetry(temporary, destination);
    }
  }
}

export async function prepareBatchJournal(
  root: string,
  batchId: string,
  transactions: readonly Transaction[],
) {
  const directory = join(root, ".transactions", batchId);
  inside(join(root, ".transactions"), directory);
  let targets = targetsFor(root, transactions);
  for (const id of new Set(
    transactions
      .filter((tx) => tx.model === "save" || tx.model === "save_folder")
      .map((tx) => tx.id),
  )) {
    const itemDirectory = saveDirIn(root, id);
    if (!(await exists(itemDirectory))) {
      targets = targets.filter(
        (target) =>
          target.path !== itemDirectory &&
          !target.path.startsWith(`${itemDirectory}${sep}`),
      );
      targets.push({ path: itemDirectory, kind: "directory" });
    }
  }
  await rejectSymlinks(root, directory);
  const snapshots: Journal["snapshots"] = [];
  await mkdir(join(directory, "before"), { recursive: true });
  try {
    for (const target of targets) {
      await rejectSymlinks(root, target.path);
      const existed = await exists(target.path);
      const snapshot = {
        path: inside(root, target.path),
        kind: target.kind,
        existed,
      };
      const backup = join(directory, "before", String(snapshots.length));
      if (existed)
        await cp(target.path, backup, {
          recursive: target.kind === "directory",
          mode: constants.COPYFILE_FICLONE,
        });
      snapshots.push(snapshot);
    }
    const journal: Journal = { batchId, snapshots };
    const manifest = join(directory, "journal.json");
    await writeFile(`${manifest}.tmp`, JSON.stringify(journal), {
      flush: true,
    });
    await renameWithRetry(`${manifest}.tmp`, manifest);
    return {
      async discard(): Promise<void> {
        await rm(directory, { recursive: true, force: true });
      },
      async rollback(): Promise<void> {
        await restoreJournal(root, directory, journal);
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function recoverBatchJournal(
  root: string,
  committed: (batchId: string) => boolean,
): Promise<void> {
  const parent = join(root, ".transactions");
  if (!(await exists(parent))) return;
  await rejectSymlinks(root, parent);
  for (const entry of await readdir(parent, { withFileTypes: true })) {
    if (!entry.isDirectory())
      throw new Error("Invalid transaction journal entry.");
    const directory = join(parent, entry.name);
    const manifest = join(directory, "journal.json");
    if (await exists(manifest)) {
      const journal = JournalSchema.parse(
        JSON.parse(await readFile(manifest, "utf8")),
      );
      if (journal.batchId !== entry.name)
        throw new Error("Transaction journal ID does not match its directory.");
      if (!committed(journal.batchId))
        await restoreJournal(root, directory, journal);
    }
    await rm(directory, { recursive: true, force: true });
  }
}

export class BatchRecoveryError extends AggregateError {
  constructor(errors: readonly Error[]) {
    super(
      errors,
      "The operation failed and recovery could not finish. The recovery journal was retained; reopen the library to retry recovery.",
    );
  }
}

export async function runRecoverableBatch<T>(input: {
  root: string;
  batchId: string;
  transactions: readonly Transaction[];
  applyDisk(transaction: Transaction): Promise<void>;
  commitIndex(): T;
  onCleanupError(error: Error): void;
  afterCleanup?(): void;
}): Promise<T> {
  const journal = await prepareBatchJournal(
    input.root,
    input.batchId,
    input.transactions,
  );
  let result: T;
  try {
    for (const transaction of input.transactions)
      await input.applyDisk(transaction);
    result = input.commitIndex();
  } catch (error) {
    try {
      await journal.rollback();
    } catch (rollbackError) {
      throw new BatchRecoveryError([
        error instanceof Error ? error : new Error("Transaction failed."),
        rollbackError instanceof Error
          ? rollbackError
          : new Error("Recovery failed."),
      ]);
    }
    throw error;
  }
  try {
    await journal.discard();
    input.afterCleanup?.();
  } catch (error) {
    input.onCleanupError(
      error instanceof Error
        ? error
        : new Error("Could not clean up the committed transaction journal."),
    );
  }
  return result;
}
