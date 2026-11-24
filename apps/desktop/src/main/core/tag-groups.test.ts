import { tagGroupMembers, tagGroups } from "@pond/schema/db";
import type { TagGroup, TagGroupMember } from "@pond/schema/db";
import type { Transaction } from "@pond/schema/tx";
import Database from "better-sqlite3";
import { and, asc, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { wrapSqlite } from "../database/client";
import { initializePondSchema } from "../db";
import { mergeGroup, planGroupMergeTransactions } from "./tag-groups";

const createdAt = new Date(0);
const databases: Array<Database.Database> = [];

afterEach(() => {
  for (const database of databases.splice(0)) {
    database.close();
  }
});

function nativeSqliteAvailable(): boolean {
  try {
    new Database(":memory:").close();
    return true;
  } catch (error) {
    if (process.versions.electron) {
      throw error;
    }
    return false;
  }
}

function group(id: string, name: string): TagGroup {
  return {
    id,
    name,
    description: null,
    color: null,
    sortOrder: 0,
    collapsed: false,
    createdAt,
  };
}

function member(
  tagId: string,
  groupId: string,
  sortOrder: number,
): TagGroupMember {
  return { tagId, groupId, sortOrder };
}

describe("tag group merge transactions", () => {
  it("moves unique memberships, removes duplicates, and deletes the source atomically", () => {
    const source = group("source", "Source");
    const target = group("target", "Target");
    const result = planGroupMergeTransactions({
      source,
      target,
      sourceMembers: [
        member("already-there", source.id, 0),
        member("new-a", source.id, 1),
        member("new-b", source.id, 2),
      ],
      targetMembers: [
        member("existing", target.id, 3),
        member("already-there", target.id, 7),
      ],
    });

    expect(result.added).toBe(2);
    expect(result.transactions).toEqual([
      expect.objectContaining({
        kind: "delete",
        model: "tag_group_member",
        id: "already-there:source",
      }),
      expect.objectContaining({
        kind: "create",
        model: "tag_group_member",
        id: "new-a:target",
        data: { tagId: "new-a", groupId: "target", sortOrder: 8 },
      }),
      expect.objectContaining({
        kind: "delete",
        model: "tag_group_member",
        id: "new-a:source",
      }),
      expect.objectContaining({
        kind: "create",
        model: "tag_group_member",
        id: "new-b:target",
        data: { tagId: "new-b", groupId: "target", sortOrder: 9 },
      }),
      expect.objectContaining({
        kind: "delete",
        model: "tag_group_member",
        id: "new-b:source",
      }),
      expect.objectContaining({
        kind: "delete",
        model: "tag_group",
        id: "source",
        before: source,
      }),
    ]);
  });

  it("still removes an empty source group", () => {
    const source = group("source", "Source");
    const result = planGroupMergeTransactions({
      source,
      target: group("target", "Target"),
      sourceMembers: [],
      targetMembers: [],
    });

    expect(result.added).toBe(0);
    expect(result.transactions).toEqual([
      expect.objectContaining({
        kind: "delete",
        model: "tag_group",
        id: "source",
      }),
    ]);
  });
});

function setup() {
  const sqlite = new Database(":memory:");
  databases.push(sqlite);
  initializePondSchema(sqlite, () => false);
  const db = wrapSqlite(sqlite);
  sqlite.exec(`
    insert into tags(id, name) values
      ('shared', 'Shared'), ('source-only', 'Source only'), ('target-only', 'Target only');
    insert into tag_groups(id, name) values ('source', 'Source'), ('target', 'Target');
    insert into tag_group_members(tag_id, group_id, sort_order) values
      ('shared', 'source', 0), ('source-only', 'source', 1),
      ('target-only', 'target', 4), ('shared', 'target', 5);
  `);
  const batches: Array<Array<Transaction>> = [];
  const undo: Array<Array<Transaction>> = [];
  const apply = sqlite.transaction((transactions: Array<Transaction>) => {
    for (const transaction of transactions) {
      if (transaction.model === "tag_group_member") {
        if (transaction.kind === "create") {
          db.insert(tagGroupMembers).values(transaction.data).run();
        } else if (transaction.kind === "delete") {
          db.delete(tagGroupMembers)
            .where(
              and(
                eq(tagGroupMembers.tagId, transaction.before.tagId),
                eq(tagGroupMembers.groupId, transaction.before.groupId),
              ),
            )
            .run();
        }
      } else if (
        transaction.model === "tag_group" &&
        transaction.kind === "delete"
      ) {
        db.delete(tagGroups).where(eq(tagGroups.id, transaction.id)).run();
      }
    }
  });
  const runtime = {
    run: async <T>(operation: () => Promise<T>) => operation(),
    getDb: async () => db,
    async commit(transactions: Array<Transaction>) {
      apply(transactions);
      batches.push(transactions);
    },
    recordUndo: (transactions: Array<Transaction>) => undo.push(transactions),
  };
  return { db, runtime, batches, undo };
}

describe.skipIf(!nativeSqliteAvailable())("tag group merge", () => {
  it("moves memberships and removes the source in one undoable commit", async () => {
    const fixture = setup();

    await expect(
      mergeGroup(" Source ", "target", fixture.runtime),
    ).resolves.toEqual({ ok: true, affected: 1 });
    expect(fixture.batches).toHaveLength(1);
    expect(fixture.undo).toEqual(fixture.batches);
    expect(
      fixture.db.select({ name: tagGroups.name }).from(tagGroups).all(),
    ).toEqual([{ name: "Target" }]);
    expect(
      fixture.db
        .select({
          tagId: tagGroupMembers.tagId,
          sortOrder: tagGroupMembers.sortOrder,
        })
        .from(tagGroupMembers)
        .where(eq(tagGroupMembers.groupId, "target"))
        .orderBy(asc(tagGroupMembers.sortOrder))
        .all(),
    ).toEqual([
      { tagId: "target-only", sortOrder: 4 },
      { tagId: "shared", sortOrder: 5 },
      { tagId: "source-only", sortOrder: 6 },
    ]);
  });

  it("does not record undo or mutate state when the commit fails", async () => {
    const fixture = setup();
    fixture.runtime.commit = async () => {
      throw new Error("disk write failed");
    };

    await expect(
      mergeGroup("source", "target", fixture.runtime),
    ).rejects.toThrow("disk write failed");
    expect(fixture.undo).toEqual([]);
    expect(
      fixture.db
        .select()
        .from(tagGroups)
        .all()
        .map((row) => row.name),
    ).toEqual(["Source", "Target"]);
  });

  it("rejects missing and self merge targets", async () => {
    const fixture = setup();

    await expect(
      mergeGroup("missing", "MISSING", fixture.runtime),
    ).resolves.toEqual({ ok: false, error: "Tag group not found." });
    await expect(
      mergeGroup("Source", "source", fixture.runtime),
    ).resolves.toEqual({
      ok: false,
      error: "Choose a different tag group to merge into.",
    });
    expect(fixture.batches).toEqual([]);
  });
});
