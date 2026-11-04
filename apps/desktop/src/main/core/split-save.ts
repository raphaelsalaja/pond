import { rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { type NewSave, type Save, type SaveFile, saves } from "@pond/schema/db";
import type { ActorKind, Transaction } from "@pond/schema/tx";
import { and, eq } from "drizzle-orm";
import log from "electron-log/main.js";
import { ulid } from "ulid";
import { getDb } from "../db";
import { writeSaveInfo } from "../lib/library";
import { saveDir } from "../paths";
import { executeBatch, withMutationScope } from "./executor";
import { folderIdsForSave } from "./folder-memberships";
import { assignSaveFolders } from "./folders";
import { runLibraryTransfer } from "./library-transfers";
import { persistSave } from "./persist-save";
import { readSave } from "./pipeline/workers/apply";
import { analyzeSaveColors } from "./save-colors";
import { ensureSaveThumbnail } from "./save-thumbnail";
import {
  buildOriginalPatch,
  buildSlideRows,
  type OriginalSplitPatch,
  planSaveSplit,
} from "./split-save-plan";
import { prepareTagRegistryUpdates } from "./tags";
import { hasUserTitle, setUserTitleLock } from "./user-metadata";

export interface SplitSaveRuntime {
  read(id: string): Promise<Save | null>;
  findSlide(row: NewSave): Promise<string | null>;
  create(row: NewSave, actor: ActorKind, reason: string): Promise<void>;
  /** Copies the files into the slide save and marks it complete, returning how many landed. */
  copyFiles(
    from: string,
    to: string,
    files: readonly SaveFile[],
    reason: string,
  ): Promise<number>;
  copyMemberships(from: string, to: string): Promise<void>;
  discard(ids: readonly string[]): Promise<void>;
  updateOriginal(
    id: string,
    split: OriginalSplitPatch,
    reason: string,
  ): Promise<void>;
  refresh(id: string): Promise<void>;
  newId(): string;
}

export type SplitSaveResult =
  | { ok: true; created: string[] }
  | { ok: false; reason: "missing" | "single" };

const runtime: SplitSaveRuntime = {
  read: readSave,
  async findSlide(row) {
    const db = await getDb();
    const existing = db
      .select({ id: saves.id })
      .from(saves)
      .where(
        and(eq(saves.source, row.source), eq(saves.sourceId, row.sourceId)),
      )
      .get();
    return existing?.id ?? null;
  },
  async create(row, actor, reason) {
    const id = row.id ?? ulid();
    const tx: Transaction = {
      kind: "create",
      model: "save",
      id,
      data: { ...row, id },
      meta: { actor, actorReason: reason },
    };
    await executeBatch([
      ...(await prepareTagRegistryUpdates(row.tags ?? [])),
      tx,
    ]);
  },
  async copyFiles(from, to, files, reason) {
    const updated = await persistSave(
      to,
      { status: "complete", ingestCompletedAt: new Date() },
      {
        actorReason: reason,
        newFiles: files.map((file) => ({
          kind: file.kind,
          filename: file.path,
          sourcePath: join(saveDir(from), file.path),
          mimeType: file.mimeType ?? undefined,
          width: file.width ?? undefined,
          height: file.height ?? undefined,
          sourceUrl: file.sourceUrl ?? undefined,
        })),
        replaceFilesWithKind: [...new Set(files.map((file) => file.kind))],
      },
    );
    const kinds = new Set(files.map((file) => file.kind));
    return (updated?.files ?? []).filter((file) => kinds.has(file.kind)).length;
  },
  async copyMemberships(from, to) {
    const folderIds = await folderIdsForSave(from);
    if (folderIds.length > 0)
      await assignSaveFolders([{ saveId: to, folderIds }], false);
    if (hasUserTitle(from)) setUserTitleLock(to, true);
    const updated = await readSave(to);
    if (updated) await writeSaveInfo(updated);
  },
  async discard(ids) {
    const rows = (await Promise.all(ids.map(readSave))).filter(
      (row): row is Save => row != null,
    );
    if (rows.length === 0) return;
    await executeBatch(
      rows.map((row) => ({
        kind: "purge",
        model: "save",
        id: row.id,
        before: row,
        meta: { actor: "system", actorReason: "split-save:rollback" },
      })),
    );
  },
  async updateOriginal(id, { patch, removed }, reason) {
    await persistSave(id, patch, { actorReason: reason, writeInfo: true });
    const dir = resolve(saveDir(id));
    for (const file of removed) {
      const path = resolve(dir, file.path);
      if (!path.startsWith(`${dir}${sep}`)) continue;
      await rm(path, { force: true }).catch((err) => {
        log.warn("[pond split] failed to remove moved file", path, err);
      });
    }
  },
  async refresh(id) {
    const save = await readSave(id);
    if (!save) return;
    await ensureSaveThumbnail(id, save);
    const updated = await readSave(id);
    if (updated) await analyzeSaveColors(updated, false, "split-save:colors");
  },
  newId: ulid,
};

/** The pipeline splits a new post during finalize, while it's still ingesting. */
function splittableStatus(save: Save, actor: ActorKind): boolean {
  if (save.status === "complete") return true;
  return actor === "system" && save.status === "ingesting";
}

/** Copies every slide out before the original changes, so a failure leaves the original whole. */
export async function runSplitSave(
  id: string,
  actor: ActorKind,
  dependencies: SplitSaveRuntime,
): Promise<SplitSaveResult> {
  const reason = actor === "system" ? "split-save:import" : "split-save";
  const save = await dependencies.read(id);
  if (!save || save.deletedAt != null || !splittableStatus(save, actor))
    return { ok: false, reason: "missing" };
  const plan = planSaveSplit(save);
  if (!plan) return { ok: false, reason: "single" };
  const rows = buildSlideRows(save, plan, dependencies.newId);
  const created: string[] = [];
  const fresh: string[] = [];
  try {
    for (const [index, row] of rows.entries()) {
      const slide = plan.slides[index];
      if (!slide || !row.id) continue;
      const existing = await dependencies.findSlide(row);
      const slideId = existing ?? row.id;
      if (!existing) {
        await dependencies.create(row, actor, reason);
        fresh.push(slideId);
      }
      const copied = await dependencies.copyFiles(
        save.id,
        slideId,
        slide.files,
        reason,
      );
      if (copied < slide.files.length)
        throw new Error(`Couldn't copy every file into ${slideId}.`);
      await dependencies.copyMemberships(save.id, slideId);
      created.push(slideId);
    }
  } catch (error) {
    await dependencies.discard(fresh).catch((err) => {
      log.warn("[pond split] failed to discard partial slides", err);
    });
    throw error;
  }
  await dependencies.updateOriginal(
    save.id,
    buildOriginalPatch(save, plan),
    reason,
  );
  return { ok: true, created };
}

export async function splitSave(
  id: string,
  actor: ActorKind,
  dependencies: SplitSaveRuntime = runtime,
): Promise<SplitSaveResult> {
  const result = await runLibraryTransfer(() =>
    withMutationScope(() => runSplitSave(id, actor, dependencies)),
  );
  if (result.ok) void refreshAll([id, ...result.created], dependencies);
  return result;
}

/** Thumbnails and colors trail the split so finalize stays inside its watchdog. */
async function refreshAll(
  ids: readonly string[],
  dependencies: SplitSaveRuntime,
): Promise<void> {
  for (const saveId of ids)
    await dependencies.refresh(saveId).catch((err) => {
      log.warn("[pond split] failed to refresh split save", saveId, err);
    });
}
