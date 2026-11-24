import {
  tagGroupMembers as tagGroupMembersTable,
  tagGroups as tagGroupsTable,
  tags as tagsTable,
} from "@pond/schema/db";
import type {
  NewTagGroup,
  NewTagGroupMember,
  Tag,
  TagGroup,
  TagGroupMember,
} from "@pond/schema/db";
import type { Transaction } from "@pond/schema/tx";
import type { OkResult } from "@shared/query-contracts-shared";
import { and, asc, eq, sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { Db } from "../db";
import { getDb } from "../db";
import {
  executeBatch,
  executeTransaction,
  withMutationScope,
} from "./executor";
import { recordBatchForUndo } from "./undo";

interface TagGroupWithMembers extends TagGroup {
  tagIds: Array<string>;
  tagNames: Array<string>;
}

interface MergeGroupRuntime {
  run<T>(operation: () => Promise<T>): Promise<T>;
  getDb(): Promise<Db>;
  commit(transactions: Array<Transaction>): Promise<void>;
  recordUndo(transactions: Array<Transaction>): void;
}

interface GroupMergePlan {
  transactions: Array<Transaction>;
  added: number;
}

const defaultMergeGroupRuntime: MergeGroupRuntime = {
  run: withMutationScope,
  getDb,
  async commit(transactions) {
    await executeBatch(transactions);
  },
  recordUndo: recordBatchForUndo,
};

/** SQLite's lower() only folds ASCII, so names compare in JS. */
async function groupByLowerName(
  db: Db,
  lowered: string,
): Promise<TagGroup | undefined> {
  const rows = await db.select().from(tagGroupsTable);
  return rows.find((group) => group.name.toLowerCase() === lowered);
}

async function tagByLowerName(
  db: Db,
  lowered: string,
): Promise<Tag | undefined> {
  const rows = await db.select().from(tagsTable);
  return rows.find((tag) => tag.name.toLowerCase() === lowered);
}

export async function listGroups(): Promise<Array<TagGroupWithMembers>> {
  const db = await getDb();
  const groups = await db
    .select()
    .from(tagGroupsTable)
    .orderBy(asc(tagGroupsTable.sortOrder), asc(tagGroupsTable.name));
  if (groups.length === 0) {
    return [];
  }

  const memberRows = await db
    .select({
      groupId: tagGroupMembersTable.groupId,
      tagId: tagGroupMembersTable.tagId,
      tagName: tagsTable.name,
      sortOrder: tagGroupMembersTable.sortOrder,
    })
    .from(tagGroupMembersTable)
    .innerJoin(tagsTable, eq(tagGroupMembersTable.tagId, tagsTable.id))
    .orderBy(asc(tagGroupMembersTable.sortOrder), asc(tagsTable.name));

  const byGroup = new Map<
    string,
    { tagIds: Array<string>; tagNames: Array<string> }
  >();
  for (const g of groups) {
    byGroup.set(g.id, { tagIds: [], tagNames: [] });
  }
  for (const m of memberRows) {
    const bucket = byGroup.get(m.groupId);
    if (!bucket) {
      continue;
    }
    bucket.tagIds.push(m.tagId);
    bucket.tagNames.push(m.tagName);
  }

  return groups.map((g) => ({
    ...g,
    tagIds: byGroup.get(g.id)?.tagIds ?? [],
    tagNames: byGroup.get(g.id)?.tagNames ?? [],
  }));
}

export async function createGroup(input: {
  name: string;
  color?: string | null;
  description?: string | null;
}): Promise<OkResult<{ id: string }>> {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: "Enter a group name." };
  }
  const db = await getDb();
  const existing = await groupByLowerName(db, name.toLowerCase());
  if (existing) {
    return { ok: true, id: existing.id };
  }
  const nextOrder = await nextSortOrder(db);
  const data: NewTagGroup = {
    id: ulid(),
    name,
    color: input.color ?? null,
    description: input.description?.trim() || null,
    sortOrder: nextOrder,
    collapsed: false,
  };
  await executeTransaction({
    kind: "create",
    model: "tag_group",
    id: data.id,
    data,
    meta: { actor: "user", actorReason: "tag-group-create" },
  });
  return { ok: true, id: data.id };
}

export async function renameGroup(from: string, to: string): Promise<OkResult> {
  const target = to.trim();
  if (!target) {
    return { ok: false, error: "Enter a group name." };
  }
  const db = await getDb();
  const fromRow = await groupByLowerName(db, from.trim().toLowerCase());
  if (!fromRow) {
    return { ok: false, error: "Tag group not found." };
  }
  const targetKey = target.toLowerCase();
  if (fromRow.name.toLowerCase() === targetKey && fromRow.name === target) {
    return { ok: true };
  }
  const collision = await groupByLowerName(db, targetKey);
  if (collision && collision.id !== fromRow.id) {
    return { ok: false, error: "A tag group with that name already exists." };
  }
  await executeTransaction({
    kind: "update",
    model: "tag_group",
    id: fromRow.id,
    patch: { name: target },
    before: fromRow,
    meta: { actor: "user", actorReason: "tag-group-rename" },
  });
  return { ok: true };
}

export async function updateGroup(
  name: string,
  patch: Partial<NewTagGroup>,
): Promise<OkResult> {
  const db = await getDb();
  const row = await groupByLowerName(db, name.trim().toLowerCase());
  if (!row) {
    return { ok: false, error: "Tag group not found." };
  }
  const next: Partial<NewTagGroup> = { ...patch };
  if ("description" in next) {
    const description = next.description?.trim() ?? "";
    next.description = description || null;
  }
  await executeTransaction({
    kind: "update",
    model: "tag_group",
    id: row.id,
    patch: next,
    before: row,
    meta: { actor: "user", actorReason: "tag-group-update" },
  });
  return { ok: true };
}

export async function deleteGroup(
  name: string,
): Promise<OkResult<{ affected: number }>> {
  const db = await getDb();
  const row = await groupByLowerName(db, name.trim().toLowerCase());
  if (!row) {
    return { ok: false, error: "Tag group not found." };
  }
  const members = await db
    .select()
    .from(tagGroupMembersTable)
    .where(eq(tagGroupMembersTable.groupId, row.id));
  const txs: Array<Transaction> = [];
  for (const m of members) {
    txs.push({
      kind: "delete",
      model: "tag_group_member",
      id: memberKey(m),
      before: m,
      meta: { actor: "user", actorReason: "tag-group-delete" },
    });
  }
  txs.push({
    kind: "delete",
    model: "tag_group",
    id: row.id,
    before: row,
    meta: { actor: "user", actorReason: "tag-group-delete" },
  });
  await executeBatch(txs);
  return { ok: true, affected: members.length };
}

export async function addTagsToGroup(
  tagNames: Array<string>,
  groupName: string,
): Promise<OkResult<{ affected: number }>> {
  const db = await getDb();
  const group = await groupByLowerName(db, groupName.trim().toLowerCase());
  if (!group) {
    return { ok: false, error: "Tag group not found." };
  }
  const txs: Array<Transaction> = [];
  const [last] = await db
    .select({
      order: sql<number>`coalesce(max(${tagGroupMembersTable.sortOrder}), -1)`,
    })
    .from(tagGroupMembersTable)
    .where(eq(tagGroupMembersTable.groupId, group.id));
  let order = (last?.order ?? -1) + 1;
  for (const raw of tagNames) {
    const tag = await tagByLowerName(db, raw.trim().toLowerCase());
    if (!tag) {
      continue;
    }
    const existing = await db
      .select()
      .from(tagGroupMembersTable)
      .where(
        and(
          eq(tagGroupMembersTable.tagId, tag.id),
          eq(tagGroupMembersTable.groupId, group.id),
        ),
      );
    if (existing[0]) {
      continue;
    }
    const data: NewTagGroupMember = {
      tagId: tag.id,
      groupId: group.id,
      sortOrder: order++,
    };
    txs.push({
      kind: "create",
      model: "tag_group_member",
      id: memberKey(data),
      data,
      meta: { actor: "user", actorReason: "tag-group-add" },
    });
  }
  if (txs.length === 0) {
    return { ok: true, affected: 0 };
  }
  await executeBatch(txs);
  return { ok: true, affected: txs.length };
}

export async function mergeGroup(
  from: string,
  to: string,
  runtime: MergeGroupRuntime = defaultMergeGroupRuntime,
): Promise<OkResult<{ affected: number }>> {
  const sourceName = from.trim();
  const targetName = to.trim();
  if (!sourceName || !targetName) {
    return { ok: false, error: "Enter a group name." };
  }
  return runtime.run(async () => {
    const db = await runtime.getDb();
    const source = await groupByLowerName(db, sourceName.toLowerCase());
    const target = await groupByLowerName(db, targetName.toLowerCase());
    if (!source || !target) {
      return { ok: false, error: "Tag group not found." };
    }
    if (source.id === target.id) {
      return {
        ok: false,
        error: "Choose a different tag group to merge into.",
      };
    }
    const sourceMembers = await db
      .select()
      .from(tagGroupMembersTable)
      .where(eq(tagGroupMembersTable.groupId, source.id))
      .orderBy(asc(tagGroupMembersTable.sortOrder));
    const targetMembers = await db
      .select()
      .from(tagGroupMembersTable)
      .where(eq(tagGroupMembersTable.groupId, target.id));
    const { transactions, added } = planGroupMergeTransactions({
      source,
      target,
      sourceMembers,
      targetMembers,
    });
    await runtime.commit(transactions);
    runtime.recordUndo(transactions);
    return { ok: true, affected: added };
  });
}

export function planGroupMergeTransactions(input: {
  source: TagGroup;
  target: TagGroup;
  sourceMembers: Array<TagGroupMember>;
  targetMembers: Array<TagGroupMember>;
}): GroupMergePlan {
  const targetTagIds = new Set(
    input.targetMembers.map((member) => member.tagId),
  );
  let nextOrder =
    Math.max(-1, ...input.targetMembers.map((member) => member.sortOrder)) + 1;
  const transactions: Array<Transaction> = [];
  let added = 0;

  for (const member of input.sourceMembers) {
    if (!targetTagIds.has(member.tagId)) {
      const data: NewTagGroupMember = {
        tagId: member.tagId,
        groupId: input.target.id,
        sortOrder: nextOrder++,
      };
      transactions.push({
        kind: "create",
        model: "tag_group_member",
        id: memberKey(data),
        data,
        meta: { actor: "user", actorReason: "tag-group-merge" },
      });
      added += 1;
    }
    transactions.push({
      kind: "delete",
      model: "tag_group_member",
      id: memberKey(member),
      before: member,
      meta: { actor: "user", actorReason: "tag-group-merge" },
    });
  }
  transactions.push({
    kind: "delete",
    model: "tag_group",
    id: input.source.id,
    before: input.source,
    meta: { actor: "user", actorReason: "tag-group-merge" },
  });

  return { transactions, added };
}

export async function removeTagFromGroup(
  tagName: string,
  groupName: string,
): Promise<OkResult> {
  const db = await getDb();
  const tag = await tagByLowerName(db, tagName.trim().toLowerCase());
  const group = await groupByLowerName(db, groupName.trim().toLowerCase());
  if (!tag || !group) {
    return { ok: false, error: "Tag or tag group not found." };
  }
  const rows = await db
    .select()
    .from(tagGroupMembersTable)
    .where(
      and(
        eq(tagGroupMembersTable.tagId, tag.id),
        eq(tagGroupMembersTable.groupId, group.id),
      ),
    );
  const member = rows[0];
  if (!member) {
    return { ok: true };
  }
  await executeTransaction({
    kind: "delete",
    model: "tag_group_member",
    id: memberKey(member),
    before: member,
    meta: { actor: "user", actorReason: "tag-group-remove" },
  });
  return { ok: true };
}

async function nextSortOrder(db: Db): Promise<number> {
  const rows = await db
    .select({
      max: sql<number>`coalesce(max(${tagGroupsTable.sortOrder}), -1)`,
    })
    .from(tagGroupsTable);
  return (rows[0]?.max ?? -1) + 1;
}

function memberKey(member: Pick<TagGroupMember, "tagId" | "groupId">): string {
  return `${member.tagId}:${member.groupId}`;
}
