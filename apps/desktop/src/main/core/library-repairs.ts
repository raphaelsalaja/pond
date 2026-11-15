import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { saves } from "@pond/schema/db";
import type { Transaction } from "@pond/schema/tx";
import { eq } from "drizzle-orm";
import log from "electron-log/main.js";
import type {
  LibraryRepairConfirmation,
  LibraryRepairKind,
  LibraryRepairPreview,
  LibraryRepairResult,
} from "../../shared/library-repair-contracts";
import { getDb } from "../db";
import { writeSaveInfo } from "../lib/library";
import { libraryRoot } from "../paths";
import { runRecoverableBatch } from "./batch-journal";
import { executeBatch, withMutationScope } from "./executor";
import {
  type InternalLibraryRepairIssue,
  inspectCurrentSaveIntegrity,
  type LibraryIntegrityRuntime,
  libraryIntegrityRuntime,
  type RepairSave,
  scanLibraryIntegrity,
} from "./library-integrity";
import { currentLibraryId } from "./prefs-scope";
import { renderThumbnail } from "./save-thumbnail-file";
import { readLibraryMedia } from "./storage/library-media-storage";
import { recordBatchForUndo } from "./undo";

const PREVIEW_TTL_MS = 10 * 60_000;

interface PreviewRecord {
  token: string;
  kind: LibraryRepairKind;
  libraryId: string;
  root: string;
  expiresAt: number;
  issues: InternalLibraryRepairIssue[];
  consumed: boolean;
}

export interface LibraryRepairServiceDependencies {
  now(): number;
  libraryId(): string;
  root(): string;
  integrityRuntime: LibraryIntegrityRuntime;
  commit(transactions: Transaction[]): Promise<void>;
  recordUndo(transactions: Transaction[]): void;
  repairMetadata(row: RepairSave): Promise<void>;
}

export function createLibraryRepairService(
  dependencies: LibraryRepairServiceDependencies,
) {
  const previews = new Map<string, PreviewRecord>();

  function prune(): void {
    const now = dependencies.now();
    for (const [token, preview] of previews) {
      if (preview.expiresAt <= now || preview.consumed) previews.delete(token);
    }
  }

  async function preview(input: {
    kind: LibraryRepairKind;
    saveIds?: readonly string[];
    signal?: AbortSignal;
    onProgress?: (processed: number, total: number) => void;
  }): Promise<LibraryRepairPreview> {
    prune();
    const libraryId = dependencies.libraryId();
    const root = dependencies.root();
    const issues = await scanLibraryIntegrity({
      ...input,
      runtime: dependencies.integrityRuntime,
    });
    if (libraryId !== dependencies.libraryId() || root !== dependencies.root())
      throw new Error(
        "The active Library changed. Start a new repair preview.",
      );
    const token = randomUUID();
    const expiresAt = dependencies.now() + PREVIEW_TTL_MS;
    previews.set(token, {
      token,
      kind: input.kind,
      libraryId,
      root,
      expiresAt,
      issues,
      consumed: false,
    });
    return {
      token,
      expiresAt,
      issues: issues.map(publicIssue),
      confirmation: confirmationFor(input.kind, issues.length),
    };
  }

  async function apply(input: {
    token: string;
    signal?: AbortSignal;
    onProgress?: (processed: number, total: number) => void;
  }): Promise<{ kind: LibraryRepairKind; result: LibraryRepairResult }> {
    prune();
    const preview = previews.get(input.token);
    if (!preview)
      throw new Error("This repair preview expired. Preview again.");
    if (
      preview.expiresAt <= dependencies.now() ||
      preview.libraryId !== dependencies.libraryId() ||
      preview.root !== dependencies.root()
    ) {
      previews.delete(input.token);
      throw new Error("The active Library changed. Preview the repair again.");
    }
    if (preview.consumed)
      throw new Error("This repair preview has already been applied.");
    preview.consumed = true;

    const undoable: Transaction[] = [];
    const currentIssues: InternalLibraryRepairIssue[] = [];
    for (const expected of preview.issues) {
      throwIfAborted(input.signal);
      const current = await inspectCurrentSaveIntegrity({
        kind: preview.kind,
        saveId: expected.saveId,
        runtime: dependencies.integrityRuntime,
      });
      if (!current || current.fingerprint !== expected.fingerprint)
        throw new Error(
          `Save ${expected.saveId} changed. Preview the repair again.`,
        );
      currentIssues.push(current);
    }

    let repaired = 0;
    const skipped = 0;
    try {
      for (const [index, current] of currentIssues.entries()) {
        throwIfAborted(input.signal);
        const transactions = await applyIssue(
          current,
          dependencies,
          input.signal,
        );
        if (transactions.length > 0) undoable.push(...transactions);
        repaired += 1;
        input.onProgress?.(index + 1, preview.issues.length);
      }
    } catch (error) {
      if (undoable.length > 0) dependencies.recordUndo(undoable);
      previews.delete(input.token);
      throw error;
    }
    if (undoable.length > 0) dependencies.recordUndo(undoable);
    previews.delete(input.token);
    return {
      kind: preview.kind,
      result: {
        repaired,
        skipped,
        undoRecorded: undoable.length > 0,
      },
    };
  }

  function discard(token: string): void {
    previews.delete(token);
  }

  function kindForToken(token: string): LibraryRepairKind | null {
    prune();
    const value = previews.get(token);
    if (
      !value ||
      value.libraryId !== dependencies.libraryId() ||
      value.root !== dependencies.root()
    )
      return null;
    return value.kind;
  }

  return { preview, apply, discard, kindForToken };
}

async function applyIssue(
  issue: InternalLibraryRepairIssue,
  dependencies: LibraryRepairServiceDependencies,
  signal: AbortSignal | undefined,
): Promise<Transaction[]> {
  throwIfAborted(signal);
  const row = await dependencies.integrityRuntime.getSave(issue.saveId);
  if (!row) throw new Error("The Save no longer exists.");
  switch (issue.action.kind) {
    case "thumbnail": {
      const action = issue.action;
      const source = join(
        dependencies.root(),
        "items",
        `${row.id}.info`,
        action.source,
      );
      const bytes = await renderThumbnail(source);
      if (!bytes)
        throw new Error(`Could not generate a thumbnail for Save ${row.id}.`);
      const nextFile = {
        kind: "thumbnail",
        path: action.destination,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        size: bytes.byteLength,
        mimeType: "image/webp",
      };
      const nextFiles = [
        ...row.files.filter((file) => !isRepairThumbnail(file.kind)),
        nextFile,
      ];
      const transaction: Transaction = {
        kind: "update",
        model: "save",
        id: row.id,
        before: { files: row.files },
        patch: { files: nextFiles },
        files: [{ filename: action.destination, bytes }],
        meta: { actor: "user", actorReason: "library-repair:thumbnail" },
      };
      const previous = row.files.find((file) => isRepairThumbnail(file.kind));
      if (previous) {
        const oldBytes = await readLibraryMedia(
          join(dependencies.root(), "items", `${row.id}.info`, previous.path),
        ).catch(() => null);
        if (oldBytes) {
          transaction.beforeFiles = [
            { filename: previous.path, bytes: oldBytes },
          ];
          if (previous.path !== action.destination) {
            transaction.fileRenames = [
              { from: previous.path, to: action.destination },
            ];
          }
        }
      }
      await dependencies.commit([transaction]);
      return [transaction];
    }
    case "physical-file-names": {
      const action = issue.action;
      const nextFiles = row.files.map((file) => {
        const rename = action.renames.find(
          (candidate) => candidate.from === file.path,
        );
        return rename ? { ...file, path: rename.to } : file;
      });
      const transaction: Transaction = {
        kind: "update",
        model: "save",
        id: row.id,
        before: { files: row.files },
        patch: { files: nextFiles },
        fileRenames: action.renames,
        meta: {
          actor: "user",
          actorReason: "library-repair:physical-file-names",
        },
      };
      await dependencies.commit([transaction]);
      return [transaction];
    }
    case "invalid-content": {
      if (row.deletedAt) return [];
      const transaction: Transaction = {
        kind: "trash",
        model: "save",
        id: row.id,
        meta: { actor: "user", actorReason: "library-repair:invalid-content" },
      };
      await dependencies.commit([transaction]);
      return [transaction];
    }
    case "save-metadata":
      await dependencies.repairMetadata(row);
      return [];
  }
}

async function repairMetadataWithJournal(row: RepairSave): Promise<void> {
  await withMutationScope(async () => {
    const root = libraryRoot();
    const batchId = randomUUID();
    const db = await getDb();
    const transaction: Transaction = {
      kind: "update",
      model: "save",
      id: row.id,
      patch: {},
      before: {},
      meta: {
        actor: "user",
        actorReason: "library-repair:save-metadata",
        batchId,
      },
    };
    await runRecoverableBatch({
      root,
      batchId,
      transactions: [transaction],
      async applyDisk() {
        if (libraryRoot() !== root)
          throw new Error("The active Library changed during repair.");
        const current = db
          .select()
          .from(saves)
          .where(eq(saves.id, row.id))
          .get();
        if (
          !current ||
          current.title !== row.title ||
          current.source !== row.source ||
          current.sourceId !== row.sourceId ||
          current.url !== row.url ||
          JSON.stringify(current.files) !== JSON.stringify(row.files)
        )
          throw new Error("The Save changed. Preview the repair again.");
        await writeSaveInfo(current);
      },
      commitIndex: () => {
        db.$raw
          .prepare("INSERT INTO mutation_commits (batch_id) VALUES (?)")
          .run(batchId);
      },
      afterCleanup: () => {
        db.$raw
          .prepare("DELETE FROM mutation_commits WHERE batch_id = ?")
          .run(batchId);
      },
      onCleanupError(error) {
        log.warn("[pond library repair] journal cleanup deferred", error);
      },
    });
  });
}

function confirmationFor(
  kind: LibraryRepairKind,
  affectedSaves: number,
): LibraryRepairConfirmation {
  return {
    affectedSaves,
    createsBackups: affectedSaves > 0,
    canUndo: kind !== "save-metadata" && affectedSaves > 0,
    movesToTrash: kind === "invalid-content" && affectedSaves > 0,
    rewritesMetadata: kind === "save-metadata" && affectedSaves > 0,
    renamesFiles: kind === "physical-file-names" && affectedSaves > 0,
    regeneratesThumbnails: kind === "thumbnails" && affectedSaves > 0,
  };
}

function publicIssue(issue: InternalLibraryRepairIssue) {
  return {
    id: issue.id,
    kind: issue.kind,
    saveId: issue.saveId,
    title: issue.title,
    summary: issue.summary,
    detail: issue.detail,
  };
}

function isRepairThumbnail(kind: string): boolean {
  return [
    "thumbnail",
    "thumbnail_dark",
    "custom_thumbnail",
    "text_cover_light",
    "text_cover_dark",
  ].includes(kind);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("Repair canceled.", "AbortError");
}

const defaultDependencies: LibraryRepairServiceDependencies = {
  now: Date.now,
  libraryId: currentLibraryId,
  root: libraryRoot,
  integrityRuntime: libraryIntegrityRuntime,
  async commit(transactions) {
    await executeBatch(transactions);
  },
  recordUndo: recordBatchForUndo,
  repairMetadata: repairMetadataWithJournal,
};

export const libraryRepairService =
  createLibraryRepairService(defaultDependencies);
