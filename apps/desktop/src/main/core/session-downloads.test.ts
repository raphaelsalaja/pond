import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CANCEL_REASON,
  type ConnectedAccount,
  type Save,
  type Source,
  type Task,
} from "@pond/schema/db";
import type { ExtensionCookie } from "@pond/schema/session";
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
import { closeDb, getDb, getGlobalDb } from "../db";
import { invalidatePaths, resolvePaths } from "../paths";
import { stopSourceForSignIn } from "./pipeline/source-admission";
import { invalidatePrefs } from "./prefs";
import { resumeSessionDownloads } from "./session-downloads";
import { createAccount } from "./sync/accounts";

function cookie(
  name: string,
  value: string,
  domain = ".x.com",
): ExtensionCookie {
  return {
    name,
    value,
    domain,
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "unspecified",
  };
}

function credentials(value: string): ExtensionCookie[] {
  return [cookie("auth_token", value)];
}

function nativeSqliteAvailable(): boolean {
  try {
    new Database(":memory:").close();
    return true;
  } catch (error) {
    if (process.versions.electron) throw error;
    return false;
  }
}

describe.skipIf(!nativeSqliteAvailable())("session download recovery", () => {
  let directory = "";
  let primary: ConnectedAccount;
  let secondary: ConnectedAccount;

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), "pond-session-downloads-"));
    vi.spyOn(app, "getPath").mockReturnValue(directory);
    invalidatePaths();
    invalidatePrefs();
    resolvePaths(join(directory, "Session Downloads.pond"));
    primary = await createAccount({ source: "twitter", id: "primary" });
    secondary = await createAccount({ source: "twitter", id: "secondary" });
  });

  beforeEach(async () => {
    (await getDb()).$raw.exec(
      "DELETE FROM saves; DELETE FROM queue_generations; DELETE FROM source_gates",
    );
  });

  afterAll(async () => {
    closeDb();
    (await getGlobalDb()).$raw.close();
    vi.restoreAllMocks();
    invalidatePaths();
    invalidatePrefs();
    rmSync(directory, { recursive: true, force: true });
  });

  async function seed(
    id: string,
    input: {
      accountId?: string | null;
      source?: Source;
      status?: Save["status"];
      taskStatus?: Task["status"];
      error?: string;
      deletedAt?: number;
    } = {},
  ): Promise<void> {
    const { $raw } = await getDb();
    const source = input.source ?? "twitter";
    $raw
      .prepare(
        `INSERT INTO saves (id, source, source_id, url, status, account_id, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        source,
        id,
        `https://example.com/${id}`,
        input.status ?? "ingesting",
        input.accountId === undefined ? primary.id : input.accountId,
        input.deletedAt ?? null,
      );
    $raw
      .prepare(
        `INSERT INTO tasks (id, save_id, source, op, status, last_error)
      VALUES (?, ?, ?, 'harvest_metadata', ?, ?)`,
      )
      .run(
        `task-${id}`,
        id,
        source,
        input.taskStatus ?? "blocked",
        input.error ?? "AuthRequiredError: Connect Twitter",
      );
  }

  async function taskStates() {
    return (await getDb()).$raw
      .prepare("SELECT save_id, status FROM tasks ORDER BY save_id")
      .all();
  }

  it("resumes only matching authentication blocks and the first account's unassigned Saves", async () => {
    await seed("own");
    await seed("failed", { status: "failed" });
    await seed("unassigned", { accountId: null });
    await seed("other-account", { accountId: secondary.id });
    await seed("other-source", { source: "github" });
    await seed("complete", { status: "complete" });
    await seed("deleted", { deletedAt: Date.now() });
    await seed("cancelled", { status: "failed", taskStatus: "cancelled" });
    await seed("different-error", { error: "TransientError: Network failed" });

    expect(await resumeSessionDownloads(primary)).toBe(3);
    expect(await taskStates()).toEqual([
      { save_id: "cancelled", status: "cancelled" },
      { save_id: "complete", status: "blocked" },
      { save_id: "deleted", status: "blocked" },
      { save_id: "different-error", status: "blocked" },
      { save_id: "failed", status: "pending" },
      { save_id: "other-account", status: "blocked" },
      { save_id: "other-source", status: "blocked" },
      { save_id: "own", status: "pending" },
      { save_id: "unassigned", status: "pending" },
    ]);
  });

  it("does not assign unassigned Saves to a later account", async () => {
    await seed("own", { accountId: secondary.id });
    await seed("unassigned", { accountId: null });
    await seed("first-account");

    expect(await resumeSessionDownloads(secondary)).toBe(1);
    expect(await taskStates()).toEqual([
      { save_id: "first-account", status: "blocked" },
      { save_id: "own", status: "pending" },
      { save_id: "unassigned", status: "blocked" },
    ]);
  });

  it("does not retry unrelated failures when no authentication blocks match", async () => {
    await seed("unrelated", {
      status: "failed",
      taskStatus: "dead",
      error: "TransientError: Network failed",
    });

    expect(await resumeSessionDownloads(primary)).toBe(0);
    expect(await taskStates()).toEqual([
      { save_id: "unrelated", status: "dead" },
    ]);
  });

  it.each(["paused", "cancelling", "cancelled"])(
    "preserves a Save with unfinished work in a %s batch",
    async (status) => {
      await seed("paused-save");
      const { $raw } = await getDb();
      $raw
        .prepare(
          "INSERT INTO queue_generations (id, kind, status) VALUES ('paused-batch', 'refresh', ?)",
        )
        .run(status);
      $raw
        .prepare(
          `INSERT INTO tasks (id, save_id, source, op, status, generation_id)
        VALUES ('paused-peer', 'paused-save', 'twitter', 'fetch_blobs', 'pending', 'paused-batch')`,
        )
        .run();

      expect(await resumeSessionDownloads(primary)).toBe(0);
      expect(await taskStates()).toEqual([
        { save_id: "paused-save", status: "blocked" },
        { save_id: "paused-save", status: "pending" },
      ]);
    },
  );

  it("waits for new credentials after a failed automatic retry and allows explicit imports", async () => {
    await seed("repeated");
    const { $raw } = await getDb();
    const blockAgain = () =>
      $raw
        .prepare(
          "UPDATE tasks SET status = 'blocked', last_error = 'AuthRequiredError: Connect Twitter'",
        )
        .run();

    expect(await resumeSessionDownloads(primary, credentials("first"))).toBe(1);
    blockAgain();
    expect(await resumeSessionDownloads(primary, credentials("first"))).toBe(0);
    expect(await taskStates()).toEqual([
      { save_id: "repeated", status: "blocked" },
    ]);
    expect(await resumeSessionDownloads(primary, credentials("second"))).toBe(
      1,
    );
    blockAgain();
    expect(await resumeSessionDownloads(primary)).toBe(1);
  });

  it("lifts a sign-in stop when you reconnect, but not for credentials it already tried", async () => {
    await seed("parked", {
      taskStatus: "pending",
      error: "TransientError: Network failed",
    });
    const { $raw } = await getDb();
    const state = () => ({
      gate: $raw
        .prepare(
          "SELECT state, reason FROM source_gates WHERE source = 'twitter'",
        )
        .get(),
      task: $raw.prepare("SELECT status, deferred_reason FROM tasks").get(),
    });
    const stopped = {
      gate: { state: "open", reason: "auth_required" },
      task: { status: "deferred", deferred_reason: "auth_required" },
    };
    const resumed = {
      gate: { state: "closed", reason: null },
      task: { status: "pending", deferred_reason: null },
    };
    const tried = credentials("tried");

    await stopSourceForSignIn("twitter");
    expect(state()).toEqual(stopped);
    await resumeSessionDownloads(primary, tried);
    expect(state()).toEqual(resumed);

    await stopSourceForSignIn("twitter");
    await resumeSessionDownloads(primary, tried);
    expect(state()).toEqual(stopped);
    await resumeSessionDownloads(primary, credentials("reconnected"));
    expect(state()).toEqual(resumed);

    await stopSourceForSignIn("twitter");
    await resumeSessionDownloads(primary);
    expect(state()).toEqual(resumed);
  });

  it("does not consume credentials when no authentication block matches", async () => {
    expect(await resumeSessionDownloads(primary, credentials("unused"))).toBe(
      0,
    );
    await seed("new-block");
    expect(await resumeSessionDownloads(primary, credentials("unused"))).toBe(
      1,
    );
  });

  it("retries newly blocked Saves without repeating earlier attempts", async () => {
    const current = credentials("new-blocks");
    await seed("earlier");
    expect(await resumeSessionDownloads(primary, current)).toBe(1);
    (await getDb()).$raw
      .prepare("UPDATE tasks SET status = 'blocked', last_error = ?")
      .run("AuthRequiredError: Connect Twitter");
    await seed("later");

    expect(await resumeSessionDownloads(primary, current)).toBe(1);
    expect(await taskStates()).toEqual([
      { save_id: "earlier", status: "blocked" },
      { save_id: "later", status: "pending" },
    ]);
  });

  it.each([
    {
      source: "twitter" as const,
      domain: ".x.com",
      authCookie: "auth_token",
      rotationCookie: "ct0",
    },
    {
      source: "youtube" as const,
      domain: ".youtube.com",
      authCookie: "LOGIN_INFO",
      rotationCookie: "__Secure-1PSIDTS",
    },
  ])(
    "retries $source when a watched session cookie changes",
    async (source) => {
      const account =
        source.source === "twitter"
          ? primary
          : await createAccount({ source: source.source, id: "youtube" });
      await seed("rotated", { accountId: account.id, source: source.source });
      const auth = cookie(source.authCookie, "unchanged", source.domain);
      expect(
        await resumeSessionDownloads(account, [
          auth,
          cookie(source.rotationCookie, "old", source.domain),
        ]),
      ).toBe(1);
      (await getDb()).$raw
        .prepare("UPDATE tasks SET status = 'blocked', last_error = ?")
        .run("AuthRequiredError: Connect source");

      expect(
        await resumeSessionDownloads(account, [
          auth,
          cookie(source.rotationCookie, "new", source.domain),
        ]),
      ).toBe(1);
    },
  );

  it("ignores cookie order and unrelated cookie changes", async () => {
    await seed("same-session");
    const auth = cookie("auth_token", "stable");
    const otherPath = { ...auth, path: "/other", value: "second-token" };
    const rotation = cookie("ct0", "stable-csrf");
    expect(
      await resumeSessionDownloads(primary, [auth, otherPath, rotation]),
    ).toBe(1);
    (await getDb()).$raw
      .prepare("UPDATE tasks SET status = 'blocked', last_error = ?")
      .run("AuthRequiredError: Connect Twitter");

    expect(
      await resumeSessionDownloads(primary, [
        rotation,
        otherPath,
        auth,
        cookie("theme", "dark"),
      ]),
    ).toBe(0);
  });

  it.each([
    { status: "cancelled", reason: CANCEL_REASON },
    { status: "cancelled", reason: null },
    { status: "dead", reason: CANCEL_REASON },
  ])(
    "preserves a Save with a cancelled task ($status, $reason)",
    async ({ status, reason }) => {
      await seed("cancelled-save");
      const { $raw } = await getDb();
      $raw
        .prepare(
          `INSERT INTO tasks (id, save_id, source, op, status, last_error)
      VALUES ('cancelled-peer', 'cancelled-save', 'twitter', 'fetch_blobs', ?, ?)`,
        )
        .run(status, reason);

      expect(await resumeSessionDownloads(primary)).toBe(0);
      expect(await taskStates()).toEqual([
        { save_id: "cancelled-save", status: "blocked" },
        { save_id: "cancelled-save", status },
      ]);
    },
  );
});
