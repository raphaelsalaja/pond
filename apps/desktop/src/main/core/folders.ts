import {
  type Folder,
  folders as foldersTable,
  type NewFolder,
  saveFolders as saveFoldersTable,
  saves,
} from "@pond/schema/db";
import { FolderColorSchema } from "@pond/schema/folder-presentation";
import type { Transaction } from "@pond/schema/tx";
import type {
  BatchRenameInput,
  OkResult,
  OkSuccess,
} from "@shared/query-contracts-shared";
import { applyRenameTemplate } from "@shared/rename-template";
import { asc, eq, inArray, isNull } from "drizzle-orm";
import { ulid } from "ulid";
import { getDb } from "../db";
import {
  executeBatch,
  executeTransaction,
  withMutationScope,
} from "./executor";
import { folderIdsForSave } from "./folder-memberships";
import { planFolderBatchMove, planFolderMove } from "./folder-move";
import { inheritedFolderTags, planFolderAssignment } from "./folder-tags";
import { getPrefs, setPrefs } from "./prefs";
import { normalizeTagList, prepareTagRegistryUpdates } from "./tags";
import { recordBatchForUndo } from "./undo";

export { folderIdsForSave } from "./folder-memberships";

export interface CreateFolderWithSavesRuntime {
  run<T>(operation: () => Promise<T>): Promise<T>;
  listFolders(): Promise<Folder[]>;
  folderIdsForSave(saveId: string): Promise<string[]>;
  planAssignments(
    assignments: Array<{ saveId: string; folderIds: string[] }>,
    rows: Folder[],
  ): Promise<Transaction[]>;
  execute: typeof executeBatch;
  recordUndo(transactions: Transaction[]): void;
  createId(): string;
  now(): Date;
}

const defaultCreateFolderWithSavesRuntime: CreateFolderWithSavesRuntime = {
  run: withMutationScope,
  listFolders,
  folderIdsForSave,
  planAssignments: folderAssignmentTransactions,
  execute: executeBatch,
  recordUndo: recordBatchForUndo,
  createId: ulid,
  now: () => new Date(),
};

export async function listFolders(): Promise<Folder[]> {
  const db = await getDb();
  return db
    .select()
    .from(foldersTable)
    .orderBy(asc(foldersTable.sortOrder), asc(foldersTable.name));
}

export async function createFolder(input: {
  name: string;
  parentId?: string | null;
  color?: string | null;
}): Promise<Folder> {
  const [created] = await createFoldersBatch({
    names: [input.name],
    parentId: input.parentId,
    color: input.color,
  });
  if (!created) throw new Error("Could not create folder.");
  return created;
}

export async function createFolderWithSaves(
  input: {
    name: string;
    parentId?: string | null;
    saveIds: string[];
  },
  runtime: CreateFolderWithSavesRuntime = defaultCreateFolderWithSavesRuntime,
): Promise<Folder> {
  return runtime.run(async () => {
    const name = input.name.trim();
    if (!name) throw new Error("Enter a folder name.");
    const saveIds = [...new Set(input.saveIds.filter(Boolean))];
    if (saveIds.length === 0) throw new Error("Select at least one Save.");
    const rows = await runtime.listFolders();
    const parentId = input.parentId ?? null;
    if (parentId && !rows.some((row) => row.id === parentId))
      throw new Error("Destination folder no longer exists.");
    const sortOrder =
      Math.max(
        -1,
        ...rows
          .filter((row) => row.parentId === parentId)
          .map((row) => row.sortOrder),
      ) + 1;
    const folder: Folder = {
      id: runtime.createId(),
      parentId,
      name,
      color: null,
      sortOrder,
      createdAt: runtime.now(),
    };
    const assignments = await Promise.all(
      saveIds.map(async (saveId) => ({
        saveId,
        folderIds: [
          ...new Set([...(await runtime.folderIdsForSave(saveId)), folder.id]),
        ],
      })),
    );
    const transactions: Transaction[] = [
      {
        kind: "create",
        model: "folder",
        id: folder.id,
        data: folder,
        meta: { actor: "user", actorReason: "folder-create-with-saves" },
      },
      ...(await runtime.planAssignments(assignments, [...rows, folder])),
    ];
    await runtime.execute(transactions);
    runtime.recordUndo(
      transactions.filter((transaction) => transaction.model !== "tag"),
    );
    return folder;
  });
}

export async function createFoldersBatch(input: {
  names: string[];
  parentId?: string | null;
  color?: string | null;
}): Promise<Folder[]> {
  return withMutationScope(async () => {
    const db = await getDb();
    const all = await listFolders();
    const parentId = input.parentId ?? null;
    if (parentId && !all.some((row) => row.id === parentId))
      throw new Error("Destination folder no longer exists.");
    const names = input.names.map((name) => name.trim()).filter(Boolean);
    if (!names.length || names.length > 500)
      throw new Error("Enter between 1 and 500 folder names.");
    const firstOrder =
      Math.max(
        -1,
        ...all
          .filter((row) => row.parentId === parentId)
          .map((row) => row.sortOrder),
      ) + 1;
    const rows = names.map(
      (name, index): NewFolder => ({
        id: ulid(),
        parentId,
        name,
        color: input.color ?? null,
        sortOrder: firstOrder + index,
      }),
    );
    const txs: Transaction[] = rows.map((data) => ({
      kind: "create",
      model: "folder",
      id: data.id,
      data,
      meta: { actor: "user", actorReason: "folder-create" },
    }));
    await executeBatch(txs);
    recordBatchForUndo(txs);
    return db
      .select()
      .from(foldersTable)
      .where(
        inArray(
          foldersTable.id,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(foldersTable.sortOrder));
  });
}

export async function renameFolder(
  id: string,
  name: string,
): Promise<OkResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Enter a folder name." };
  const db = await getDb();
  const row = (
    await db.select().from(foldersTable).where(eq(foldersTable.id, id))
  )[0];
  if (!row) return { ok: false, error: "Folder not found." };
  await executeTransaction({
    kind: "update",
    model: "folder",
    id,
    patch: { name: trimmed },
    before: { name: row.name },
    meta: { actor: "user", actorReason: "folder-rename" },
  });
  return { ok: true };
}

export async function renameFoldersBatch(
  input: BatchRenameInput,
): Promise<OkResult<{ renamed: number }>> {
  const ids = [...new Set(input.ids.filter(Boolean))];
  const pattern = input.pattern.trim();
  if (!pattern || ids.length === 0)
    return { ok: false, error: "Enter a name pattern and choose folders." };
  const db = await getDb();
  const rows = await db
    .select()
    .from(foldersTable)
    .where(inArray(foldersTable.id, ids));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const transactions: Transaction[] = [];
  for (const [index, id] of ids.entries()) {
    const row = byId.get(id);
    if (!row) continue;
    const name = applyRenameTemplate(pattern, {
      index,
      title: row.name,
      original: row.name,
      id: row.id,
      date: row.createdAt,
      start: input.start,
      replacement: input.replacement,
      textCase: input.textCase,
    });
    if (!name || name === row.name) continue;
    transactions.push({
      kind: "update",
      model: "folder",
      id,
      patch: { name },
      before: { name: row.name },
      meta: { actor: "user", actorReason: "folder-batch-rename" },
    });
  }
  await executeBatch(transactions);
  recordBatchForUndo(transactions);
  return { ok: true, renamed: transactions.length };
}

export async function setFolderColor(
  id: string,
  color: string | null,
): Promise<OkResult> {
  const requested = color?.trim() || null;
  const parsed = requested ? FolderColorSchema.safeParse(requested) : null;
  if (parsed && !parsed.success)
    return { ok: false, error: "Choose a palette color or a hex color." };
  const next = parsed?.data ?? null;
  const db = await getDb();
  const row = (
    await db.select().from(foldersTable).where(eq(foldersTable.id, id))
  )[0];
  if (!row) return { ok: false, error: "Folder not found." };
  if (row.color === next) return { ok: true };
  await executeTransaction({
    kind: "update",
    model: "folder",
    id,
    patch: { color: next },
    before: { color: row.color },
    meta: { actor: "user", actorReason: "folder-color" },
  });
  return { ok: true };
}

export async function deleteFolder(
  id: string,
  options: { trashContainedSaves?: boolean } = {},
): Promise<OkSuccess> {
  const all = await listFolders();
  const ids = collectDescendants(id, all);
  const db = await getDb();
  const affected = db
    .select({
      saveId: saveFoldersTable.saveId,
      folderId: saveFoldersTable.folderId,
      deletedAt: saves.deletedAt,
    })
    .from(saveFoldersTable)
    .innerJoin(saves, eq(saveFoldersTable.saveId, saves.id))
    .where(inArray(saveFoldersTable.folderId, ids))
    .all();
  const txs: Transaction[] = [];
  const affectedSaveIds = new Set(affected.map((row) => row.saveId));
  for (const saveId of affectedSaveIds) {
    const before = await folderIdsForSave(saveId);
    txs.push({
      kind: "update",
      model: "save_folder",
      id: saveId,
      patch: { folderIds: before.filter((id) => !ids.includes(id)) },
      before: { folderIds: before },
      meta: { actor: "user", actorReason: "folder-delete" },
    });
  }
  if (options.trashContainedSaves) {
    const liveSaveIds = new Set(
      affected.filter((row) => !row.deletedAt).map((row) => row.saveId),
    );
    for (const saveId of liveSaveIds)
      txs.push({
        kind: "trash",
        model: "save",
        id: saveId,
        meta: { actor: "user", actorReason: "folder-delete" },
      });
  }
  for (const folderId of ids.reverse()) {
    const row = all.find((folder) => folder.id === folderId);
    if (!row) continue;
    txs.push({
      kind: "delete",
      model: "folder",
      id: folderId,
      before: row,
      meta: { actor: "user", actorReason: "folder-delete" },
    });
  }
  if (txs.length > 0) {
    await executeBatch(txs);
    recordBatchForUndo(txs);
  }
  return { ok: true };
}

function collectDescendants(id: string, all: Folder[]): string[] {
  const ids = new Set<string>();
  function visit(current: string) {
    if (ids.has(current)) return;
    ids.add(current);
    for (const folder of all) if (folder.parentId === current) visit(folder.id);
  }
  visit(id);
  return [...ids];
}

export async function memberships(): Promise<
  Array<{ saveId: string; folderId: string }>
> {
  const db = await getDb();
  return db
    .select({
      saveId: saveFoldersTable.saveId,
      folderId: saveFoldersTable.folderId,
    })
    .from(saveFoldersTable);
}

export async function assignSaveFolders(
  assignments: Array<{ saveId: string; folderIds: string[] }>,
  undo = true,
): Promise<OkSuccess> {
  return withMutationScope(async () => {
    const txs = await folderAssignmentTransactions(assignments);
    if (txs.length) {
      await executeBatch(txs);
      if (undo) recordBatchForUndo(txs.filter((tx) => tx.model !== "tag"));
    }
    return { ok: true };
  });
}

async function folderAssignmentTransactions(
  assignments: Array<{ saveId: string; folderIds: string[] }>,
  rows?: Folder[],
): Promise<Transaction[]> {
  const db = await getDb();
  const all = rows ?? (await listFolders());
  const rules = (await getPrefs()).folderRules;
  const txs: Transaction[] = [];
  const appliedTags: string[] = [];
  const inherited = new Map<string, string[]>();
  for (let offset = 0; offset < assignments.length; offset += 500) {
    const batch = assignments.slice(offset, offset + 500);
    const ids = batch.map((assignment) => assignment.saveId);
    const [savedRows, memberRows] = await Promise.all([
      db
        .select({ id: saves.id, tags: saves.tags, deletedAt: saves.deletedAt })
        .from(saves)
        .where(inArray(saves.id, ids)),
      db
        .select()
        .from(saveFoldersTable)
        .where(inArray(saveFoldersTable.saveId, ids)),
    ]);
    const savedById = new Map(savedRows.map((save) => [save.id, save]));
    const membershipsBySave = new Map<string, string[]>();
    for (const member of memberRows)
      membershipsBySave.set(member.saveId, [
        ...(membershipsBySave.get(member.saveId) ?? []),
        member.folderId,
      ]);
    for (const { saveId, folderIds } of batch) {
      const key = [...folderIds].sort().join("\0");
      const automaticTags =
        inherited.get(key) ?? inheritedFolderTags(folderIds, all, rules);
      inherited.set(key, automaticTags);
      const save = savedById.get(saveId);
      if (!save || save.deletedAt) throw new Error("A Save no longer exists.");
      txs.push(
        ...planFolderAssignment(
          save,
          membershipsBySave.get(saveId) ?? [],
          folderIds,
          automaticTags,
        ),
      );
      appliedTags.push(...automaticTags);
    }
  }
  return [...(await prepareTagRegistryUpdates(appliedTags)), ...txs];
}

export async function getFolderRules(id: string) {
  const all = await listFolders();
  const folder = all.find((row) => row.id === id);
  if (!folder) throw new Error("Folder no longer exists.");
  const rules = (await getPrefs()).folderRules;
  return {
    tags: rules[id]?.automaticTags ?? [],
    inheritedTags: inheritedFolderTags(
      folder.parentId ? [folder.parentId] : [],
      all,
      rules,
    ),
  };
}

export async function setFolderRules(input: {
  id: string;
  tags: string[];
  applyExisting?: boolean;
}): Promise<OkSuccess<{ affected: number }>> {
  return withMutationScope(async () => {
    const all = await listFolders();
    if (!all.some((row) => row.id === input.id))
      throw new Error("Folder no longer exists.");
    await setPrefs({
      folderRules: {
        [input.id]: { automaticTags: normalizeTagList(input.tags) },
      },
    });
    if (!input.applyExisting) return { ok: true, affected: 0 };
    const descendants = collectDescendants(input.id, all);
    const members = (await memberships()).filter((member) =>
      descendants.includes(member.folderId),
    );
    const liveIds = new Set(
      (
        await (
          await getDb()
        )
          .select({ id: saves.id })
          .from(saves)
          .where(isNull(saves.deletedAt))
      ).map((save) => save.id),
    );
    const assignments = await Promise.all(
      [...new Set(members.map((member) => member.saveId))]
        .filter((id) => liveIds.has(id))
        .map(async (saveId) => ({
          saveId,
          folderIds: await folderIdsForSave(saveId),
        })),
    );
    await assignSaveFolders(assignments);
    return { ok: true, affected: assignments.length };
  });
}

export async function setSaveFolders(
  saveId: string,
  folderIds: string[],
): Promise<OkSuccess> {
  return assignSaveFolders([{ saveId, folderIds }]);
}

export async function addSavesToFolder(
  folderId: string,
  saveIds: string[],
): Promise<OkSuccess> {
  return withMutationScope(async () => {
    const assignments = await Promise.all(
      [...new Set(saveIds)].map(async (saveId) => ({
        saveId,
        folderIds: [...(await folderIdsForSave(saveId)), folderId],
      })),
    );
    return assignSaveFolders(assignments);
  });
}

export async function importFolderTree(
  nodes: Array<{
    id: string;
    name: string;
    parentId: string | null;
    color?: string | null;
    sortOrder?: number;
  }>,
  mergeExisting = false,
): Promise<Map<string, string>> {
  const mapped = new Map<string, string>();
  const existing: Array<Pick<Folder, "id" | "name" | "parentId">> =
    mergeExisting ? await listFolders() : [];
  const createdIds = new Set(existing.map((folder) => folder.id));
  const ordered: typeof nodes = [];
  const pending = [...nodes];
  const ids = new Set(nodes.map((node) => node.id));
  if (ids.size !== nodes.length)
    throw new Error("The folder import contains duplicate identities.");
  while (pending.length) {
    const index = pending.findIndex(
      (node) => !node.parentId || mapped.has(node.parentId),
    );
    if (index < 0)
      throw new Error("The folder import contains a cycle or missing parent.");
    const node = pending.splice(index, 1)[0];
    if (!node) throw new Error("A folder is missing.");
    const parentId = node.parentId ? (mapped.get(node.parentId) ?? null) : null;
    const match = mergeExisting
      ? existing.find(
          (folder) =>
            folder.parentId === parentId &&
            folder.name.toLowerCase() === node.name.toLowerCase(),
        )
      : undefined;
    const id = match?.id ?? ulid();
    mapped.set(node.id, id);
    if (!match) existing.push({ id, parentId, name: node.name });
    ordered.push(node);
  }
  const txs: Transaction[] = [];
  for (const node of ordered) {
    const id = mapped.get(node.id);
    if (!id) throw new Error("A folder is missing.");
    if (createdIds.has(id)) continue;
    createdIds.add(id);
    const data: NewFolder = {
      id,
      parentId: node.parentId ? (mapped.get(node.parentId) ?? null) : null,
      name: node.name,
      color: node.color ?? null,
      sortOrder: node.sortOrder ?? 0,
    };
    txs.push({
      kind: "create",
      model: "folder",
      id,
      data,
      meta: { actor: "user", actorReason: "folder-import" },
    });
  }
  if (txs.length > 0) await executeBatch(txs);
  return mapped;
}

export function moveFolder(input: {
  id: string;
  parentId: string | null;
  beforeId?: string;
}): Promise<OkSuccess> {
  return withMutationScope(async () => {
    const rows = await listFolders();
    return commitFolderMoves(
      rows,
      planFolderMove(rows, input.id, input.parentId, input.beforeId),
    );
  });
}

export async function moveFoldersBatch(input: {
  ids: string[];
  parentId: string | null;
  beforeId?: string;
}): Promise<OkSuccess> {
  return withMutationScope(async () => {
    const rows = await listFolders();
    const changes = planFolderBatchMove(
      rows,
      input.ids,
      input.parentId,
      input.beforeId,
    );
    return commitFolderMoves(rows, changes);
  });
}

async function commitFolderMoves(
  rows: Folder[],
  changes: Array<{ id: string; parentId: string | null; sortOrder: number }>,
): Promise<OkSuccess> {
  const byId = new Map(changes.map((row) => [row.id, row]));
  const txs: Transaction[] = changes.flatMap((patch) => {
    const before = rows.find((row) => row.id === patch.id);
    return before
      ? [
          {
            kind: "update",
            model: "folder",
            id: patch.id,
            patch: { parentId: patch.parentId, sortOrder: patch.sortOrder },
            before: { parentId: before.parentId, sortOrder: before.sortOrder },
            meta: { actor: "user", actorReason: "folder-move" },
          },
        ]
      : [];
  });
  if (!txs.length) return { ok: true };
  const affectedFolders = new Set(
    changes.flatMap((change) => collectDescendants(change.id, rows)),
  );
  const db = await getDb();
  const liveIds = new Set(
    (
      await db
        .select({ id: saves.id })
        .from(saves)
        .where(isNull(saves.deletedAt))
    ).map((save) => save.id),
  );
  const saveIds = [
    ...new Set(
      (await memberships())
        .filter(
          (member) =>
            affectedFolders.has(member.folderId) && liveIds.has(member.saveId),
        )
        .map((member) => member.saveId),
    ),
  ];
  const assignments = await Promise.all(
    saveIds.map(async (saveId) => ({
      saveId,
      folderIds: await folderIdsForSave(saveId),
    })),
  );
  txs.push(
    ...(await folderAssignmentTransactions(
      assignments,
      rows.map((row) => ({ ...row, ...byId.get(row.id) })),
    )),
  );
  await executeBatch(txs);
  recordBatchForUndo(txs.filter((tx) => tx.model !== "tag"));
  return { ok: true };
}
