import {
  type NewTag,
  saves as savesTable,
  tags as tagsTable,
} from "@pond/schema/db";
import { labelKey, normalizeLabelName } from "@pond/schema/label-name";
import type { Transaction } from "@pond/schema/tx";
import { eq, sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { Db } from "../db";
import { getDb } from "../db";
import { executeBatch, executeTransaction } from "./executor";

export interface CreateTagInput {
  name: string;
  color?: string | null;
  description?: string | null;
}

async function tagByLowerName(db: Db, lowered: string) {
  const rows = await db
    .select()
    .from(tagsTable)
    .where(sql`lower(${tagsTable.name}) = ${lowered}`);
  return rows[0];
}

export async function listTags() {
  const db = await getDb();
  return await db.select().from(tagsTable);
}

export async function createTag(
  input: CreateTagInput,
): Promise<{ ok: boolean }> {
  const name = normalizeLabelName(input.name);
  if (!name) return { ok: false };
  const data: NewTag = {
    id: ulid(),
    name,
    color: input.color ?? null,
    description: input.description?.trim() || null,
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

export async function updateTag(
  name: string,
  patch: Partial<NewTag>,
): Promise<{ ok: boolean }> {
  const db = await getDb();
  const lowered = name.trim().toLowerCase();
  const row = await tagByLowerName(db, lowered);
  if (!row) return { ok: false };
  await executeTransaction({
    kind: "update",
    model: "tag",
    id: row.id,
    patch,
    before: row,
    meta: { actor: "user", actorReason: "tag-update" },
  });
  return { ok: true };
}

export async function renameTag(
  from: string,
  to: string,
): Promise<{ ok: boolean; affected: number }> {
  const fromKey = labelKey(from);
  const toStored = normalizeLabelName(to);
  const toKey = toStored.toLowerCase();
  if (!fromKey || !toStored || fromKey === toKey) {
    return { ok: false, affected: 0 };
  }
  const db = await getDb();
  const fromCanon = await tagByLowerName(db, fromKey);
  const toCanon = await tagByLowerName(db, toKey);
  if (fromCanon && toCanon && fromCanon.id !== toCanon.id) {
    return mergeTags(from, to);
  }

  const all = await db.select().from(savesTable);
  const txs: Transaction[] = [];
  for (const row of all) {
    const current = (row.tags ?? []).slice();
    const idx = current.findIndex((t) => t.toLowerCase() === fromKey);
    if (idx === -1) continue;
    if (current.some((t) => t.toLowerCase() === toKey)) {
      current.splice(idx, 1);
    } else {
      current[idx] = toStored;
    }
    txs.push({
      kind: "update",
      model: "save",
      id: row.id,
      patch: { tags: current },
      before: { tags: row.tags },
      meta: { actor: "user", actorReason: "tag-rename" },
    });
  }

  const tagRow = await tagByLowerName(db, fromKey);
  if (tagRow) {
    txs.push({
      kind: "update",
      model: "tag",
      id: tagRow.id,
      patch: { name: toStored },
      before: tagRow,
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
): Promise<{ ok: boolean; affected: number }> {
  const fromKey = labelKey(from);
  const toStored = normalizeLabelName(to);
  const toKey = toStored.toLowerCase();
  if (!fromKey || !toStored || fromKey === toKey) {
    return { ok: false, affected: 0 };
  }

  const db = await getDb();
  const fromRow = await tagByLowerName(db, fromKey);
  const toRow = await tagByLowerName(db, toKey);

  const all = await db.select().from(savesTable);
  const txs: Transaction[] = [];
  for (const row of all) {
    const current = (row.tags ?? []).slice();
    const idx = current.findIndex((t) => t.toLowerCase() === fromKey);
    if (idx === -1) continue;
    if (current.some((t) => t.toLowerCase() === toKey)) {
      current.splice(idx, 1);
    } else {
      current[idx] = toStored;
    }
    txs.push({
      kind: "update",
      model: "save",
      id: row.id,
      patch: { tags: current },
      before: { tags: row.tags },
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
    const patch: Partial<NewTag> = {};
    if (!toRow.description?.trim() && fromRow.description?.trim()) {
      patch.description = fromRow.description;
    }
    if (!toRow.color && fromRow.color) patch.color = fromRow.color;
    if (Object.keys(patch).length > 0) {
      txs.push({
        kind: "update",
        model: "tag",
        id: toRow.id,
        patch,
        before: toRow,
        meta: { actor: "user", actorReason: "tag-merge" },
      });
    }
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

export async function deleteTag(name: string): Promise<{
  ok: boolean;
  affected: number;
}> {
  const key = labelKey(name) || name.trim().toLowerCase();
  const db = await getDb();
  const all = await db.select().from(savesTable);
  const txs: Transaction[] = [];
  for (const row of all) {
    const current = (row.tags ?? []).filter((t) => t.toLowerCase() !== key);
    if (current.length === (row.tags?.length ?? 0)) continue;
    txs.push({
      kind: "update",
      model: "save",
      id: row.id,
      patch: { tags: current },
      before: { tags: row.tags },
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

function normalizeTagList(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
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
  next: string[],
): Promise<{ ok: boolean }> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(savesTable)
    .where(eq(savesTable.id, saveId));
  const row = rows[0];
  if (!row) return { ok: false };
  const normalized = normalizeTagList(next);
  await executeTransaction({
    kind: "update",
    model: "save",
    id: saveId,
    patch: { tags: normalized },
    before: { tags: row.tags },
    meta: { actor: "user", actorReason: "save-tags-set" },
  });
  for (const name of normalized) {
    const existing = await tagByLowerName(db, name.toLowerCase());
    if (existing) continue;
    const id = ulid();
    try {
      await executeTransaction({
        kind: "create",
        model: "tag",
        id,
        data: { id, name, usageCount: 0 },
        meta: { actor: "system", actorReason: "tag-autocreate" },
      });
    } catch {
      /* race-safe; another concurrent write may have just created it */
    }
  }
  return { ok: true };
}
