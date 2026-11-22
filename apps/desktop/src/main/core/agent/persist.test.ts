import * as schema from "@pond/schema/db";
import * as events from "@pond/schema/events";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantMetadata } from "../../../shared/assistant";
import { initializePondSchema } from "../../database/pond-schema";
import { listMessages, rewindLastTurn } from "./persist";

const db = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../db", () => ({ getDb: async () => db.current }));

function nativeAvailable(): boolean {
  try {
    new Database(":memory:").close();
    return true;
  } catch (error) {
    if (process.versions.electron) throw error;
    return false;
  }
}

let raw: Database.Database;

beforeEach(() => {
  raw = new Database(":memory:");
  initializePondSchema(raw, () => false);
  const memory = drizzle(raw, { schema: { ...schema, ...events } });
  db.current = Object.assign(memory, { $raw: raw });
  memory.insert(schema.agentChats).values({ id: "chat" }).run();
});

afterEach(() => raw.close());

function seed(
  rows: Array<{
    role: "user" | "assistant";
    content: string;
    metadata?: AssistantMetadata;
  }>,
) {
  const memory = drizzle(raw, { schema });
  rows.forEach((row, index) => {
    memory
      .insert(schema.agentMessages)
      .values({
        id: `m${index}`,
        chatId: "chat",
        role: row.role,
        content: row.content,
        metadata: row.metadata ? { ...row.metadata } : null,
        createdAt: new Date(index * 1000),
      })
      .run();
  });
}

const ids = async () => (await listMessages("chat")).map((row) => row.id);

describe.skipIf(!nativeAvailable())("rewindLastTurn", () => {
  it("drops the latest request and its replies and hands back the request", async () => {
    seed([
      { role: "user", content: "First" },
      { role: "assistant", content: "One" },
      { role: "user", content: "Second", metadata: { replyToQuestion: "q" } },
      { role: "assistant", content: "Two" },
      { role: "assistant", content: "Two, continued" },
    ]);
    await expect(rewindLastTurn("chat")).resolves.toEqual({
      ok: true,
      content: "Second",
      metadata: { replyToQuestion: "q" },
    });
    expect(await ids()).toEqual(["m0", "m1"]);
  });

  it("refuses a request that has no reply yet", async () => {
    seed([
      { role: "user", content: "First" },
      { role: "assistant", content: "One" },
      { role: "user", content: "Second" },
    ]);
    await expect(rewindLastTurn("chat")).resolves.toMatchObject({ ok: false });
    expect(await ids()).toEqual(["m0", "m1", "m2"]);
  });

  it("refuses a routine run", async () => {
    seed([
      {
        role: "user",
        content: "Tag new Saves",
        metadata: { routine: { trigger: "schedule" } },
      },
      { role: "assistant", content: "Tagged." },
    ]);
    await expect(rewindLastTurn("chat")).resolves.toMatchObject({ ok: false });
    expect(await ids()).toEqual(["m0", "m1"]);
  });

  it("refuses a reply with applied changes", async () => {
    seed([
      { role: "user", content: "Tag it" },
      {
        role: "assistant",
        content: "Tagged.",
        metadata: {
          changes: [
            {
              id: "save:tags",
              saveId: "save",
              title: "Clock",
              reason: "",
              status: "applied",
              field: "tags",
              before: [],
              after: ["Clock"],
            },
          ],
        },
      },
    ]);
    await expect(rewindLastTurn("chat")).resolves.toEqual({
      ok: false,
      error: "This reply has applied changes. Undo them before running it again.",
    });
    expect(await ids()).toEqual(["m0", "m1"]);
  });
});
