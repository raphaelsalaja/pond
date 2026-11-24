import { agentChats, agentMessages } from "@pond/schema/db";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { initializePondSchema } from "../../db";
import { loadModelTranscript } from "./transcript";

function nativeAvailable() {
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
  const db = drizzle(sqlite, { schema: { agentChats, agentMessages } });
  db.insert(agentChats).values({ id: "chat", title: "Existing chat" }).run();
  return { db, sqlite };
}

describe.skipIf(!nativeAvailable())("canonical agent transcript", () => {
  it("hydrates visible messages and keeps user metadata on disk", async () => {
    const { db } = setup();
    db.insert(agentMessages)
      .values({
        id: "user",
        chatId: "chat",
        role: "user",
        content: "Search",
        metadata: { scopeLabel: "Library" },
      })
      .run();
    const messages = await loadModelTranscript("chat", db);
    expect(messages).toEqual([{ role: "user", content: "Search" }]);
    expect(db.select().from(agentMessages).all()[0]?.metadata).toEqual({
      scopeLabel: "Library",
    });
  });

  it("uses validated visible replies for later turns", async () => {
    const { db } = setup();
    db.insert(agentMessages)
      .values([
        {
          id: "user",
          chatId: "chat",
          role: "user",
          content: "Search",
          createdAt: new Date(1),
        },
        {
          id: "visible",
          chatId: "chat",
          role: "assistant",
          content: "Validated answer",
          createdAt: new Date(2),
        },
        {
          id: "next",
          chatId: "chat",
          role: "user",
          content: "Missing thing",
          createdAt: new Date(3),
        },
        {
          id: "empty",
          chatId: "chat",
          role: "assistant",
          content: "No matches",
          createdAt: new Date(4),
        },
      ])
      .run();
    const messages = await loadModelTranscript("chat", db);
    expect(messages.map((row) => row.content)).toEqual([
      "Search",
      "Validated answer",
      "Missing thing",
      "No matches",
    ]);
  });

  it("excludes unsafe replies but preserves valid stopped text", async () => {
    const { db } = setup();
    db.insert(agentMessages)
      .values([
        {
          id: "user",
          chatId: "chat",
          role: "user",
          content: "Search",
          createdAt: new Date(1),
        },
        {
          id: "bad",
          chatId: "chat",
          role: "assistant",
          content: "Attached Save metadata: secret",
          metadata: { error: "Unreadable" },
          createdAt: new Date(2),
        },
        {
          id: "next",
          chatId: "chat",
          role: "user",
          content: "Explain",
          createdAt: new Date(3),
        },
        {
          id: "stopped",
          chatId: "chat",
          role: "assistant",
          content: "A useful beginning",
          metadata: { stopped: true },
          createdAt: new Date(4),
        },
      ])
      .run();
    const messages = await loadModelTranscript("chat", db);
    expect(messages.map((row) => row.content)).toEqual([
      "Search",
      "Explain",
      "A useful beginning",
    ]);
  });
});
