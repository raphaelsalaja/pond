import { saves as savesTable, tags as tagsTable } from "@pond/schema/db";
import type { NewTag, Tag } from "@pond/schema/db";
import { labelKey, normalizeLabelName } from "@pond/schema/label-name";
import type { Transaction } from "@pond/schema/tx";
import type { OkResult } from "@shared/query-contracts-shared";
import { eq, inArray, sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { Db } from "../db";
import { getDb } from "../db";
import { executeBatch, executeTransaction } from "./executor";

interface CreateTagInput {
  name: string;
}

/** SQLite's lower() only folds ASCII, so names compare in JS. */
async function tagByLowerName(db: Db, lowered: string) {
  const rows = await db.select().from(tagsTable);
  return rows.find((tag) => tag.name.toLowerCase() === lowered);
}

/** Saves can hold tags written before normalization, so they match by label key in JS. */
async function savesWithTag(
  db: Db,
  key: string,
): Promise<Array<{ id: string; tags: Array<string> | null }>> {
  const rows = await db
    .select({ id: savesTable.id, tags: savesTable.tags })
    .from(savesTable)
    .where(sql`${savesTable.tags} != '[]'`);
  return rows.filter((row) => row.tags?.some((tag) => labelKey(tag) === key));
}

export async function listTags() {
  const db = await getDb();
  return await db.select().from(tagsTable);
}

export async function createTag(input: CreateTagInput): Promise<OkResult> {
  const name = normalizeLabelName(input.name);
  if (!name) return { ok: false, error: "Enter a tag name." };
  const data: NewTag = {
    id: ulid(),
    name,
    usageCount: 0,
  };
  await executeTransaction({
    kind: "create",
    model: "tag",
    id: data.id,
    data,
    meta: { actor: "user", actorReason: "tag-create" },
  });
  return { ok: true };
}

export async function renameTag(
  from: string,
  to: string,
): Promise<OkResult<{ affected: number }>> {
  const fromKey = labelKey(from);
  const toStored = normalizeLabelName(to);
  const toKey = toStored.toLowerCase();
  if (!fromKey || !toStored) {
    return { ok: false, error: "Enter a tag name." };
  }
  const db = await getDb();
  const fromCanon = await tagByLowerName(db, fromKey);

  if (fromKey !== toKey) {
    const toCanon = await tagByLowerName(db, toKey);
    if (fromCanon && toCanon && fromCanon.id !== toCanon.id) {
      return mergeTags(from, to);
    }
  }

  const all = await savesWithTag(db, fromKey);
  const txs: Array<Transaction> = [];
  for (const row of all) {
    const current = (row.tags ?? []).slice();
    const idx = current.findIndex((t) => labelKey(t) === fromKey);
    if (idx === -1) continue;
    const collidesWithExistingTarget =
      fromKey !== toKey && current.some((t) => labelKey(t) === toKey);
    if (collidesWithExistingTarget) {
      current.splice(idx, 1);
    } else {
      if (current[idx] === toStored) continue;
      current[idx] = toStored;
    }
    txs.push({
      kind: "update",
      model: "save",
      id: row.id,
      patch: { tags: current },
      before: { tags: row.tags ?? undefined },
      meta: { actor: "user", actorReason: "tag-rename" },
    });
  }

  if (fromCanon && fromCanon.name !== toStored) {
    txs.push({
      kind: "update",
      model: "tag",
      id: fromCanon.id,
      patch: { name: toStored },
      before: fromCanon,
      meta: { actor: "user", actorReason: "tag-rename" },
    });
  }

  if (txs.length === 0) return { ok: true, affected: 0 };
  await executeBatch(txs);
  return { ok: true, affected: txs.length };
}

export async function mergeTags(
  from: string,
  to: string,
): Promise<OkResult<{ affected: number }>> {
  const fromKey = labelKey(from);
  const toStored = normalizeLabelName(to);
  const toKey = toStored.toLowerCase();
  if (!fromKey || !toStored || fromKey === toKey) {
    return { ok: false, error: "Choose a different tag to merge into." };
  }

  const db = await getDb();
  const fromRow = await tagByLowerName(db, fromKey);
  const toRow = await tagByLowerName(db, toKey);

  const all = await savesWithTag(db, fromKey);
  const txs: Array<Transaction> = [];
  for (const row of all) {
    const current = (row.tags ?? []).slice();
    const idx = current.findIndex((t) => labelKey(t) === fromKey);
    if (idx === -1) continue;
    if (current.some((t) => labelKey(t) === toKey)) {
      current.splice(idx, 1);
    } else {
      current[idx] = toStored;
    }
    txs.push({
      kind: "update",
      model: "save",
      id: row.id,
      patch: { tags: current },
      before: { tags: row.tags ?? undefined },
      meta: { actor: "user", actorReason: "tag-merge" },
    });
  }

  if (fromRow && toRow && fromRow.id !== toRow.id) {
    txs.push({
      kind: "delete",
      model: "tag",
      id: fromRow.id,
      before: fromRow,
      meta: { actor: "user", actorReason: "tag-merge" },
    });
  } else if (fromRow && !toRow) {
    txs.push({
      kind: "update",
      model: "tag",
      id: fromRow.id,
      patch: { name: toStored },
      before: fromRow,
      meta: { actor: "user", actorReason: "tag-merge" },
    });
  }

  if (txs.length === 0) return { ok: true, affected: 0 };
  await executeBatch(txs);
  return { ok: true, affected: txs.length };
}

interface TagPatch {
  starred?: boolean;
  description?: string | null;
}

export async function updateTag(
  name: string,
  patch: TagPatch,
): Promise<OkResult> {
  const key = labelKey(name) || name.trim().toLowerCase();
  const db = await getDb();
  const row = await tagByLowerName(db, key);
  if (!row) return { ok: false, error: "Tag not found." };

  const next: TagPatch = {};
  if ("starred" in patch) next.starred = Boolean(patch.starred);
  if ("description" in patch) {
    const description = patch.description?.trim() ?? "";
    next.description = description || null;
  }
  if (Object.keys(next).length === 0) return { ok: true };

  await executeTransaction({
    kind: "update",
    model: "tag",
    id: row.id,
    patch: next,
    before: row,
    meta: { actor: "user", actorReason: "tag-update" },
  });
  return { ok: true };
}

export async function deleteTag(
  name: string,
): Promise<OkResult<{ affected: number }>> {
  const key = labelKey(name) || name.trim().toLowerCase();
  const db = await getDb();
  const all = await savesWithTag(db, key);
  const txs: Array<Transaction> = [];
  for (const row of all) {
    const current = (row.tags ?? []).filter((t) => labelKey(t) !== key);
    if (current.length === (row.tags?.length ?? 0)) continue;
    txs.push({
      kind: "update",
      model: "save",
      id: row.id,
      patch: { tags: current },
      before: { tags: row.tags ?? undefined },
      meta: { actor: "user", actorReason: "tag-delete" },
    });
  }
  const tagRow = await tagByLowerName(db, key);
  if (tagRow) {
    txs.push({
      kind: "delete",
      model: "tag",
      id: tagRow.id,
      before: tagRow,
      meta: { actor: "user", actorReason: "tag-delete" },
    });
  }
  if (txs.length === 0) return { ok: true, affected: 0 };
  await executeBatch(txs);
  return { ok: true, affected: txs.length };
}

export function normalizeTagList(names: Array<string>): Array<string> {
  const seen = new Set<string>();
  const out: Array<string> = [];
  for (const raw of names) {
    const n = normalizeLabelName(raw);
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

export async function setSaveTags(
  saveId: string,
  next: Array<string>,
): Promise<OkResult> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(savesTable)
    .where(eq(savesTable.id, saveId));
  const row = rows[0];
  if (!row) return { ok: false, error: "Save not found." };
  const normalized = normalizeTagList(next);
  const registry = await prepareTagRegistryUpdates(normalized);
  await executeBatch([
    ...registry,
    {
      kind: "update",
      model: "save",
      id: saveId,
      patch: { tags: normalized },
      before: { tags: row.tags },
      meta: { actor: "user", actorReason: "save-tags-set" },
    },
  ]);
  return { ok: true };
}

/** Adds tags to each save, keeping the tags it already has. */
export async function addTagsToSaves(
  saveIds: ReadonlyArray<string>,
  names: Array<string>,
  actorReason: string,
): Promise<number> {
  const add = normalizeTagList(names);
  if (add.length === 0 || saveIds.length === 0) return 0;
  const db = await getDb();
  const txs: Array<Transaction> = [];
  for (let offset = 0; offset < saveIds.length; offset += 500) {
    const rows = await db
      .select({ id: savesTable.id, tags: savesTable.tags })
      .from(savesTable)
      .where(inArray(savesTable.id, saveIds.slice(offset, offset + 500)));
    for (const row of rows) {
      const next = normalizeTagList([...row.tags, ...add]);
      if (next.length === row.tags.length) continue;
      txs.push({
        kind: "update",
        model: "save",
        id: row.id,
        patch: { tags: next },
        before: { tags: row.tags },
        meta: { actor: "system", actorReason },
      });
    }
  }
  if (txs.length === 0) return 0;
  await executeBatch([...(await prepareTagRegistryUpdates(add)), ...txs]);
  return txs.length;
}

export function planTagRegistryUpdates(
  names: Array<string>,
  existing: ReadonlyArray<Pick<Tag, "id" | "name" | "lastUsedAt">>,
  now = new Date(),
): Array<Transaction> {
  const byName = new Map(existing.map((tag) => [labelKey(tag.name), tag]));
  return normalizeTagList(names).map((name): Transaction => {
    const row = byName.get(labelKey(name));
    if (row) {
      return {
        kind: "update",
        model: "tag",
        id: row.id,
        patch: { lastUsedAt: now },
        before: { lastUsedAt: row.lastUsedAt },
        meta: { actor: "system", actorReason: "tag-bump-last-used" },
      };
    }
    const id = ulid();
    return {
      kind: "create",
      model: "tag",
      id,
      data: { id, name, usageCount: 0, lastUsedAt: now },
      meta: { actor: "system", actorReason: "tag-autocreate" },
    };
  });
}

export async function prepareTagRegistryUpdates(
  names: Array<string>,
): Promise<Array<Transaction>> {
  if (names.length === 0) {
    return [];
  }
  return planTagRegistryUpdates(names, await listTags());
}
