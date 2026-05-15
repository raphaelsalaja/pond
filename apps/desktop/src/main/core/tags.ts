import {
  type NewTag,
  saves as savesTable,
  tags as tagsTable,
} from "@pond/schema/db";
import type { Transaction } from "@pond/schema/tx";
import { eq } from "drizzle-orm";
import log from "electron-log/main.js";
import { ulid } from "ulid";
import { getDb } from "../db";
import { executeBatch, executeTransaction } from "./executor";

export interface CreateTagInput {
  name: string;
  color?: string | null;
  group?: string | null;
}

export async function createTag(
  input: CreateTagInput,
): Promise<{ ok: boolean }> {
  const name = input.name.trim();
  if (!name) return { ok: false };
  const data: NewTag = {
    id: ulid(),
    name,
    color: input.color ?? null,
    group: input.group ?? null,
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
  const rows = await db
    .select()
    .from(tagsTable)
    .where(eq(tagsTable.name, name));
  const row = rows[0];
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
  const fromName = from.trim();
  const toName = to.trim();
  if (!fromName || !toName || fromName === toName) {
    return { ok: false, affected: 0 };
  }
  const db = await getDb();

  const all = await db.select().from(savesTable);
  const txs: Transaction[] = [];
  for (const row of all) {
    const current = (row.tags ?? []).slice();
    const idx = current.findIndex(
      (t) => t.toLowerCase() === fromName.toLowerCase(),
    );
    if (idx === -1) continue;
    if (current.some((t) => t.toLowerCase() === toName.toLowerCase())) {
      current.splice(idx, 1);
    } else {
      current[idx] = toName;
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

  const tagRows = await db
    .select()
    .from(tagsTable)
    .where(eq(tagsTable.name, fromName));
  const tagRow = tagRows[0];
  if (tagRow) {
    txs.push({
      kind: "update",
      model: "tag",
      id: tagRow.id,
      patch: { name: toName },
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
  const result = await renameTag(from, to);
  if (!result.ok) return result;
  const db = await getDb();
  const rows = await db
    .select()
    .from(tagsTable)
    .where(eq(tagsTable.name, from));
  if (rows[0]) {
    try {
      await executeTransaction({
        kind: "delete",
        model: "tag",
        id: rows[0].id,
        before: rows[0],
        meta: { actor: "user", actorReason: "tag-merge" },
      });
    } catch (err) {
      log.warn("[pond tags] merge cleanup failed", err);
    }
  }
  return result;
}

export async function deleteTag(name: string): Promise<{
  ok: boolean;
  affected: number;
}> {
  const db = await getDb();
  const all = await db.select().from(savesTable);
  const txs: Transaction[] = [];
  for (const row of all) {
    const current = (row.tags ?? []).filter(
      (t) => t.toLowerCase() !== name.toLowerCase(),
    );
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
  const tagRows = await db
    .select()
    .from(tagsTable)
    .where(eq(tagsTable.name, name));
  if (tagRows[0]) {
    txs.push({
      kind: "delete",
      model: "tag",
      id: tagRows[0].id,
      before: tagRows[0],
      meta: { actor: "user", actorReason: "tag-delete" },
    });
  }
  if (txs.length === 0) return { ok: true, affected: 0 };
  await executeBatch(txs);
  return { ok: true, affected: txs.length };
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
  await executeTransaction({
    kind: "update",
    model: "save",
    id: saveId,
    patch: { tags: next },
    before: { tags: row.tags },
    meta: { actor: "user", actorReason: "save-tags-set" },
  });
  for (const name of next) {
    const existing = await db
      .select()
      .from(tagsTable)
      .where(eq(tagsTable.name, name));
    if (existing[0]) continue;
    try {
      await executeTransaction({
        kind: "create",
        model: "tag",
        id: ulid(),
        data: { id: ulid(), name, usageCount: 0 },
        meta: { actor: "system", actorReason: "tag-autocreate" },
      });
    } catch {
      /* race-safe; another concurrent write may have just created it */
    }
  }
  return { ok: true };
}
