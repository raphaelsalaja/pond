import type { Transaction } from "@pond/schema/tx";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { eventTables, libraryTables } from "../database/tables";
import { initializePondSchema } from "../db";
import { clearUnfinishedDownloads } from "./clear-unfinished-downloads";

function nativeAvailable() {
  try {
    new Database(":memory:").close();
    return true;
  } catch (error) {
    if (process.versions.electron) throw error;
    return false;
  }
}

const opened: Array<Database.Database> = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

describe.skipIf(!nativeAvailable())("clear unfinished downloads", () => {
  it("trashes only the current unfinished non-local rows in one undo batch", async () => {
    const raw = new Database(":memory:");
    opened.push(raw);
    initializePondSchema(raw, () => false);
    const db = Object.assign(
      drizzle(raw, { schema: { ...libraryTables, ...eventTables } }),
      {
        $raw: raw,
      },
    );
    const insert = raw.prepare(
      "insert into saves(id,source,source_id,url,status,deleted_at) values(?,?,?,?,?,?)",
    );
    insert.run("running", "youtube", "running", "", "ingesting", null);
    insert.run("failed", "web", "failed", "", "failed", null);
    insert.run("skipped", "twitter", "skipped", "", "skipped", null);
    insert.run("finished", "youtube", "finished", "", "complete", null);
    insert.run("local", "local", "local", "", "failed", null);
    insert.run("already-trashed", "web", "trashed", "", "failed", Date.now());
    const commits: Array<Array<Transaction>> = [];
    const undo: Array<Array<Transaction>> = [];

    const result = await clearUnfinishedDownloads(
      db,
      async (transactions) => {
        commits.push(transactions);
      },
      (transactions) => undo.push(transactions),
    );

    /** The query has no order; which index answers it decides the row order. */
    expect(result.changed).toBe(3);
    expect(result.ids.toSorted()).toEqual(["failed", "running", "skipped"]);
    expect(commits).toHaveLength(1);
    expect(commits[0]?.map((transaction) => transaction.id)).toEqual(
      result.ids,
    );
    expect(undo).toEqual(commits);
  });

  it("does not commit or replace Undo when nothing is unfinished", async () => {
    const raw = new Database(":memory:");
    opened.push(raw);
    initializePondSchema(raw, () => false);
    const db = Object.assign(
      drizzle(raw, { schema: { ...libraryTables, ...eventTables } }),
      {
        $raw: raw,
      },
    );
    raw
      .prepare(
        "insert into saves(id,source,source_id,url,status) values('finished','web','finished','','complete')",
      )
      .run();
    const commits: Array<Array<Transaction>> = [];
    const undo: Array<Array<Transaction>> = [];

    await expect(
      clearUnfinishedDownloads(
        db,
        async (transactions) => {
          commits.push(transactions);
        },
        (transactions) => undo.push(transactions),
      ),
    ).resolves.toEqual({ changed: 0, ids: [] });
    expect(commits).toEqual([]);
    expect(undo).toEqual([]);
  });
});
