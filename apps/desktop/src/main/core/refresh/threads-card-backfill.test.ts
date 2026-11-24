import { queueGenerations, saves, tasks } from "@pond/schema/db";
import type { NewSave } from "@pond/schema/db";
import { storedAsRawJson } from "@pond/schema/raw-schema";
import Database from "better-sqlite3";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { wrapSqlite } from "../../database/client";
import { initializePondSchema } from "../../db";
import { requeueReplyCaptures } from "./threads-card-backfill";

function nativeSqliteAvailable(): boolean {
  try {
    const probe = new Database(":memory:");
    probe.close();
    return true;
  } catch (error) {
    if (process.versions.electron) {
      throw error;
    }
    return false;
  }
}

const databases: Array<Database.Database> = [];

afterEach(() => {
  for (const db of databases.splice(0)) {
    db.close();
  }
});

function setup() {
  const sqlite = new Database(":memory:");
  databases.push(sqlite);
  initializePondSchema(sqlite, () => false);
  const db = wrapSqlite(sqlite);
  const runtime = {
    getDb: async () => db,
    kickReconciler: () => {},
    async persistSave(id: string, patch: Partial<NewSave>) {
      db.update(saves).set(patch).where(eq(saves.id, id)).run();
      return null;
    },
  };
  return { db, runtime };
}

describe.skipIf(!nativeSqliteAvailable())("requeueReplyCaptures", () => {
  it("detaches requeued tasks from their finished generation", async () => {
    const { db, runtime } = setup();
    const at = new Date();
    db.insert(queueGenerations)
      .values({ id: "gen", kind: "refresh", status: "done" })
      .run();
    db.insert(saves)
      .values({
        id: "reply",
        source: "twitter",
        sourceId: "reply",
        url: "https://x.com/someone/status/1",
        status: "complete",
        rawJson: storedAsRawJson({
          capture: {
            replyTo: {
              id: "0",
              source: "twitter",
              url: "https://x.com/other/status/0",
            },
          },
        }),
      })
      .run();
    for (const op of ["capture_tweet", "finalize"] as const) {
      db.insert(tasks)
        .values({
          id: op,
          saveId: "reply",
          source: "twitter",
          op,
          status: "done",
          generationId: "gen",
          nextRunAt: at,
          createdAt: at,
          updatedAt: at,
        })
        .run();
    }

    expect(
      await requeueReplyCaptures([{ id: "reply", source: "twitter" }], runtime),
    ).toBe(1);

    for (const op of ["capture_tweet", "finalize"] as const) {
      const task = db
        .select()
        .from(tasks)
        .where(and(eq(tasks.saveId, "reply"), eq(tasks.op, op)))
        .get();
      expect(task?.status).toBe("pending");
      // The claim query skips tasks whose generation is no longer active.
      expect(task?.generationId).toBeNull();
    }
  });
});
