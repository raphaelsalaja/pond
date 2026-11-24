import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentChats, agentMessages } from "@pond/schema/db";
import Database from "better-sqlite3";
import { app } from "electron";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { AssistantMetadata } from "../../../shared/assistant";
import { closeDb, getDb } from "../../db";
import { invalidatePaths, resolvePaths } from "../../paths";
import { listMessages, rewindLastTurn } from "./persist";

function nativeAvailable(): boolean {
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

async function seed(
  rows: Array<{
    role: "user" | "assistant";
    content: string;
    metadata?: AssistantMetadata;
  }>,
) {
  const db = await getDb();
  rows.forEach((row, index) => {
    db.insert(agentMessages)
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
  let dir = "";

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "pond-agent-persist-"));
    vi.spyOn(app, "getPath").mockReturnValue(dir);
    invalidatePaths();
    resolvePaths(join(dir, "Agent Persist.pond"));
  });

  afterAll(() => {
    closeDb();
    vi.restoreAllMocks();
    invalidatePaths();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      /** Pond keeps `global.db` open until the process ends, and Windows can't delete an open file. */
      if (process.platform !== "win32") {
        throw error;
      }
    }
  });

  beforeEach(async () => {
    const db = await getDb();
    db.delete(agentMessages).run();
    db.delete(agentChats).run();
    db.insert(agentChats).values({ id: "chat" }).run();
  });

  it("drops the latest request and its replies and hands back the request", async () => {
    await seed([
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
    await seed([
      { role: "user", content: "First" },
      { role: "assistant", content: "One" },
      { role: "user", content: "Second" },
    ]);
    await expect(rewindLastTurn("chat")).resolves.toMatchObject({ ok: false });
    expect(await ids()).toEqual(["m0", "m1", "m2"]);
  });

  it("refuses a routine run", async () => {
    await seed([
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
    await seed([
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
      error:
        "This reply has applied changes. Undo them before running it again.",
    });
    expect(await ids()).toEqual(["m0", "m1"]);
  });
});
