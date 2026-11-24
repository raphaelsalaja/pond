import { join } from "node:path";
import { saves } from "@pond/schema/db";
import type { NewSave, Save } from "@pond/schema/db";
import type { Transaction, TxMeta } from "@pond/schema/tx";
import { inArray } from "drizzle-orm";
import log from "electron-log/main.js";
import { ulid } from "ulid";
import type {
  OkResult,
  UndoableChange,
} from "../../shared/query-contracts-shared";
import { getDb } from "../db";
import { writeSaveInfo } from "../lib/library";
import { needsPosterRepair } from "../lib/poster-policy";
import { saveDir } from "../paths";
import { executeBatch, withMutationScope } from "./executor";
import { folderIdsForSave } from "./folder-memberships";
import { assignSaveFolders } from "./folders";
import { canGroupMember, planGroup } from "./group-saves-plan";
import type { GroupFile, GroupRefusal } from "./group-saves-plan";
import { runLibraryTransfer } from "./library-transfers";
import { persistSave } from "./persist-save";
import { readSave } from "./pipeline/workers/apply";
import { runEnsurePoster } from "./pipeline/workers/ensure-poster";
import { analyzeSaveColors } from "./save-colors";
import { ensureSaveThumbnail } from "./save-thumbnail";
import { prepareTagRegistryUpdates } from "./tags";
import { recordBatchForUndo } from "./undo";

export interface GroupSavesRuntime {
  read(ids: ReadonlyArray<string>): Promise<Array<Save>>;
  folders(id: string): Promise<Array<string>>;
  create(row: NewSave): Promise<void>;
  /** Copies the files into the gallery and marks it complete, returning how many landed. */
  copyFiles(id: string, files: ReadonlyArray<GroupFile>): Promise<number>;
  assignFolders(id: string, folderIds: ReadonlyArray<string>): Promise<void>;
  discard(id: string): Promise<void>;
  /** Trashes the members and records one Undo step that also covers the gallery. */
  trash(groupId: string, ids: ReadonlyArray<string>): Promise<string | null>;
  refresh(id: string): Promise<void>;
  newId: () => string;
}

export type GroupSavesResult = OkResult<
  { id: string; grouped: number } & UndoableChange
>;

const META: TxMeta = { actor: "user", actorReason: "group-saves" };

const runtime: GroupSavesRuntime = {
  async read(ids) {
    return (await getDb())
      .select()
      .from(saves)
      .where(inArray(saves.id, [...ids]));
  },
  folders: folderIdsForSave,
  async create(row) {
    const id = row.id ?? ulid();
    await executeBatch([
      ...(await prepareTagRegistryUpdates(row.tags ?? [])),
      {
        kind: "create",
        model: "save",
        id,
        data: { ...row, id },
        meta: META,
      },
    ]);
  },
  async copyFiles(id, files) {
    const updated = await persistSave(
      id,
      { status: "complete", ingestCompletedAt: new Date() },
      {
        actorReason: "group-saves",
        newFiles: files.map(({ from, file, filename }) => ({
          kind: file.kind,
          filename,
          sourcePath: join(saveDir(from), file.path),
          mimeType: file.mimeType ?? undefined,
          width: file.width ?? undefined,
          height: file.height ?? undefined,
          sourceUrl: file.sourceUrl ?? undefined,
        })),
      },
    );
    return updated?.files.length ?? 0;
  },
  async assignFolders(id, folderIds) {
    if (folderIds.length > 0) {
      await assignSaveFolders(
        [{ saveId: id, folderIds: [...folderIds] }],
        false,
      );
    }
    const updated = await readSave(id);
    if (updated) {
      await writeSaveInfo(updated);
    }
  },
  async discard(id) {
    const row = await readSave(id);
    if (!row) {
      return;
    }
    await executeBatch([
      {
        kind: "purge",
        model: "save",
        id,
        before: row,
        meta: { actor: "system", actorReason: "group-saves:rollback" },
      },
    ]);
  },
  async trash(groupId, ids) {
    const trashed: Array<Transaction> = ids.map((id) => ({
      kind: "trash",
      model: "save",
      id,
      meta: META,
    }));
    await executeBatch(trashed);
    return recordBatchForUndo([
      { kind: "untrash", model: "save", id: groupId, meta: META },
      ...trashed,
    ]);
  },
  async refresh(id) {
    const save = await readSave(id);
    if (!save) {
      return;
    }
    await ensureSaveThumbnail(id, save);
    if (needsPosterRepair(save.files)) {
      await runEnsurePoster(id);
    }
    const updated = await readSave(id);
    if (updated) {
      await analyzeSaveColors(updated, false, "group-saves:colors");
    }
  },
  newId: ulid,
};

const REFUSALS = {
  count: "Select at least two Saves to group.",
  missing: "Some of these Saves are gone or in Trash. Select them again.",
  busy: "Some of these Saves are still downloading. Try again when they finish.",
  media: "Only Saves with images or videos can be grouped.",
} satisfies Record<GroupRefusal, string>;

/** Copies every file into the gallery before any member moves to Trash, so a failure leaves the Saves as they were. */
export async function runGroupSaves(
  ids: ReadonlyArray<string>,
  dependencies: GroupSavesRuntime,
): Promise<GroupSavesResult> {
  const order = [...new Set(ids)];
  if (order.length < 2) {
    return { ok: false, error: REFUSALS.count };
  }
  const byId = new Map(
    (await dependencies.read(order)).map((save) => [save.id, save]),
  );
  const members: Array<Save> = [];
  for (const id of order) {
    const save = byId.get(id);
    const refusal = save ? canGroupMember(save) : "missing";
    if (refusal) {
      return { ok: false, error: REFUSALS[refusal] };
    }
    if (save) {
      members.push(save);
    }
  }
  const plan = planGroup(members, dependencies.newId);
  const { id } = plan;
  const memberships = await Promise.all(
    members.map((save) => dependencies.folders(save.id)),
  );
  await dependencies.create(plan.row);
  try {
    const copied = await dependencies.copyFiles(id, plan.files);
    if (copied < plan.files.length) {
      throw new Error(`Couldn't copy every file into ${id}.`);
    }
    await dependencies.assignFolders(id, [...new Set(memberships.flat())]);
  } catch (error) {
    log.warn("[pond group] failed to build the gallery", error);
    await dependencies.discard(id).catch((cause: unknown) => {
      log.warn("[pond group] failed to discard the partial gallery", cause);
    });
    return {
      ok: false,
      error:
        "Couldn't copy every file into the group. Your Saves are unchanged, so try again.",
    };
  }
  const undoId = await dependencies.trash(id, order);
  return { ok: true, id, grouped: members.length, undoId };
}

export async function groupSaves(
  ids: ReadonlyArray<string>,
  dependencies: GroupSavesRuntime = runtime,
): Promise<GroupSavesResult> {
  const result = await runLibraryTransfer(() =>
    withMutationScope(() => runGroupSaves(ids, dependencies)),
  );
  if (result.ok) {
    void dependencies.refresh(result.id).catch((cause: unknown) => {
      log.warn("[pond group] failed to refresh the gallery", result.id, cause);
    });
  }
  return result;
}
