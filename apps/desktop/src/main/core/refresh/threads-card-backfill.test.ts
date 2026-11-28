import { queueGenerations, saves, tasks } from "@pond/schema/db";
import type { NewSave, SaveFile } from "@pond/schema/db";
import type { RawJson } from "@pond/schema/raw";
import { storedAsRawJson } from "@pond/schema/raw-schema";
import Database from "better-sqlite3";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { wrapSqlite } from "../../database/client";
import { initializePondSchema } from "../../db";
import type { CaptureTweetResult } from "../pipeline/workers/capture-tweet";
import {
  needsPostCardStructuredRepair,
  requeueReplyCaptures,
  startThreadsCardBackfill,
  withPostCardRepairAttempt,
} from "./threads-card-backfill";

function nativeSqliteAvailable(): boolean {
  try {
    const probe = new Database(":memory:");
    probe.close();
    return true;
  } catch (error) {
    if (process.versions.electron) throw error;
    return false;
  }
}

function postRaw(captureTweetVersion = 13): RawJson {
  return {
    extractorId: "test",
    extractedAt: "2026-11-16T00:00:00.000Z",
    captureTweetVersion,
    capture: {
      id: "9",
      source: "twitter",
      url: "https://x.com/alice/status/9",
      description: "A post",
      media: [],
    },
  };
}

function screenshotRaw(): RawJson {
  return {
    ...postRaw(),
    postCardProvenance: {
      light: { renderer: "screenshot", captureTweetVersion: 13 },
      dark: { renderer: "screenshot", captureTweetVersion: 13 },
    },
  };
}

function postCardFile(kind: string): SaveFile {
  return {
    kind,
    path: `${kind}.png`,
    sha256: "abc",
    size: 100,
    width: 1196,
  };
}

const POST_CARD_FILES = [
  postCardFile("tweet_screenshot_light"),
  postCardFile("tweet_screenshot_dark"),
];

/** Dimensions of the generic Threads wordmark the fallback captures when the post never renders in the hidden window. */
function wordmarkCardFile(kind: string): SaveFile {
  return {
    kind,
    path: `${kind}.png`,
    sha256: "abc",
    size: 2659,
    width: 276,
    height: 194,
  };
}

const WORDMARK_CARD_FILES = [
  wordmarkCardFile("tweet_screenshot_light"),
  wordmarkCardFile("tweet_screenshot_dark"),
];

const databases: Array<Database.Database> = [];

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

function setup(captureResult?: CaptureTweetResult) {
  const sqlite = new Database(":memory:");
  databases.push(sqlite);
  initializePondSchema(sqlite, () => false);
  const db = wrapSqlite(sqlite);
  const captureCalls: Array<{
    id: string;
    opts?: { nativeOnly?: boolean; force?: boolean };
  }> = [];
  const idle: CaptureTweetResult = {
    captured: 0,
    authWall: false,
    mediaAdded: false,
    replyParentPending: false,
  };
  const runtime = {
    getDb: async () => db,
    kickReconciler: () => {},
    async persistSave(id: string, patch: Partial<NewSave>) {
      db.update(saves).set(patch).where(eq(saves.id, id)).run();
      return null;
    },
    async runCaptureTweet(
      id: string,
      opts?: { nativeOnly?: boolean; force?: boolean },
    ): Promise<CaptureTweetResult> {
      if (opts) {
        captureCalls.push({ id, opts });
      } else {
        captureCalls.push({ id });
      }
      return captureResult ?? idle;
    },
    now: () => new Date("2026-11-16T01:00:00.000Z"),
  };
  return { db, runtime, captureCalls };
}

function insertPostSave(
  db: ReturnType<typeof setup>["db"],
  id: string,
  rawJson: RawJson,
  files: Array<SaveFile>,
): void {
  db.insert(saves)
    .values({
      id,
      source: "twitter",
      sourceId: id,
      url: `https://x.com/alice/status/${id}`,
      status: "complete",
      rawJson,
      files,
    })
    .run();
}

describe("post card structured repair selection", () => {
  it("targets only cards recorded as live screenshots", () => {
    expect(
      needsPostCardStructuredRepair(screenshotRaw(), POST_CARD_FILES),
    ).toBe(true);

    const mixed = {
      ...postRaw(),
      postCardProvenance: {
        light: { renderer: "screenshot" as const, captureTweetVersion: 13 },
        dark: { renderer: "react" as const, captureTweetVersion: 13 },
      },
    };
    expect(needsPostCardStructuredRepair(mixed, POST_CARD_FILES)).toBe(true);
  });

  it("repairs an unprovenanced card whose file is implausibly small", () => {
    expect(needsPostCardStructuredRepair(postRaw(), WORDMARK_CARD_FILES)).toBe(
      true,
    );
  });

  it("leaves a plausibly sized unprovenanced card alone", () => {
    expect(needsPostCardStructuredRepair(postRaw(), POST_CARD_FILES)).toBe(
      false,
    );
  });

  it("trusts structured provenance even when file dimensions are missing or small", () => {
    const structured = {
      ...postRaw(),
      postCardProvenance: {
        light: { renderer: "xeet" as const, captureTweetVersion: 13 },
        dark: { renderer: "react" as const, captureTweetVersion: 13 },
      },
    };
    expect(needsPostCardStructuredRepair(structured, WORDMARK_CARD_FILES)).toBe(
      false,
    );
  });

  it("leaves unprovenanced, structured and repaired cards alone", () => {
    expect(needsPostCardStructuredRepair(postRaw(), POST_CARD_FILES)).toBe(
      false,
    );

    const structured = {
      ...postRaw(),
      postCardProvenance: {
        light: { renderer: "xeet" as const, captureTweetVersion: 13 },
        dark: { renderer: "react" as const, captureTweetVersion: 13 },
      },
    };
    expect(needsPostCardStructuredRepair(structured, POST_CARD_FILES)).toBe(
      false,
    );

    const repaired = withPostCardRepairAttempt(
      screenshotRaw(),
      "2026-11-16T01:00:00.000Z",
    );
    expect(repaired?.postCardRepair).toEqual({
      version: 1,
      attemptedAt: "2026-11-16T01:00:00.000Z",
    });
    expect(needsPostCardStructuredRepair(repaired, POST_CARD_FILES)).toBe(
      false,
    );
    expect(needsPostCardStructuredRepair(screenshotRaw(), [])).toBe(false);
  });
});

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

describe.skipIf(!nativeSqliteAvailable())(
  "startThreadsCardBackfill post card repair",
  () => {
    it("leaves a Save with no provenance alone on upgrade", async () => {
      const { db, runtime, captureCalls } = setup();
      insertPostSave(db, "legacy", postRaw(), POST_CARD_FILES);

      await startThreadsCardBackfill(runtime);

      expect(captureCalls).toEqual([]);
      const row = db.select().from(saves).where(eq(saves.id, "legacy")).get();
      expect(row?.rawJson).toEqual(postRaw());
    });

    it("force-renders an unprovenanced Save whose card files are implausibly small", async () => {
      const { db, runtime, captureCalls } = setup();
      insertPostSave(db, "wordmark", postRaw(), WORDMARK_CARD_FILES);

      await startThreadsCardBackfill(runtime);

      expect(captureCalls).toEqual([
        { id: "wordmark", opts: { nativeOnly: true, force: true } },
      ]);
    });

    it("force-renders a recorded screenshot card and records a failed repair", async () => {
      const { db, runtime, captureCalls } = setup();
      insertPostSave(db, "shot", screenshotRaw(), POST_CARD_FILES);

      await expect(startThreadsCardBackfill(runtime)).resolves.toMatchObject({
        ok: true,
        recaptured: 0,
      });

      expect(captureCalls).toEqual([
        { id: "shot", opts: { nativeOnly: true, force: true } },
      ]);
      const row = db.select().from(saves).where(eq(saves.id, "shot")).get();
      expect(row?.rawJson?.postCardRepair).toEqual({
        version: 1,
        attemptedAt: "2026-11-16T01:00:00.000Z",
      });

      await startThreadsCardBackfill(runtime);
      expect(captureCalls).toHaveLength(1);
    });

    it("records the repair attempt when the render throws", async () => {
      const { db, runtime, captureCalls } = setup();
      insertPostSave(db, "shot", screenshotRaw(), POST_CARD_FILES);
      runtime.runCaptureTweet = async (id, opts) => {
        captureCalls.push(opts ? { id, opts } : { id });
        throw new Error("render crashed");
      };

      await startThreadsCardBackfill(runtime);
      await startThreadsCardBackfill(runtime);

      expect(captureCalls).toHaveLength(1);
      const row = db.select().from(saves).where(eq(saves.id, "shot")).get();
      expect(row?.rawJson?.postCardRepair?.version).toBe(1);
    });

    it("preserves rawJson updates made during a failed repair", async () => {
      const { db, runtime } = setup();
      insertPostSave(db, "legacy", screenshotRaw(), POST_CARD_FILES);
      const runCaptureTweet = runtime.runCaptureTweet;
      runtime.runCaptureTweet = async (id, opts) => {
        const result = await runCaptureTweet(id, opts);
        const current = db
          .select({ rawJson: saves.rawJson })
          .from(saves)
          .where(eq(saves.id, id))
          .get()?.rawJson;
        if (current) {
          db.update(saves)
            .set({
              rawJson: {
                ...current,
                extractedAt: "2026-11-16T02:00:00.000Z",
              },
            })
            .where(eq(saves.id, id))
            .run();
        }
        return result;
      };

      await startThreadsCardBackfill(runtime);

      const row = db.select().from(saves).where(eq(saves.id, "legacy")).get();
      expect(row?.rawJson?.extractedAt).toBe("2026-11-16T02:00:00.000Z");
      expect(row?.rawJson?.postCardRepair?.version).toBe(1);
    });

    it("does not write a repair marker when the structured render succeeds", async () => {
      const { db, runtime, captureCalls } = setup({
        captured: 2,
        authWall: false,
        mediaAdded: false,
        replyParentPending: false,
      });
      insertPostSave(db, "legacy", screenshotRaw(), POST_CARD_FILES);

      await expect(startThreadsCardBackfill(runtime)).resolves.toMatchObject({
        recaptured: 1,
      });

      expect(captureCalls).toEqual([
        { id: "legacy", opts: { nativeOnly: true, force: true } },
      ]);
      const row = db.select().from(saves).where(eq(saves.id, "legacy")).get();
      expect(row?.rawJson?.postCardRepair).toBeUndefined();
    });

    it("does not re-render current cards already proven to be structured", async () => {
      const { db, runtime, captureCalls } = setup();
      insertPostSave(
        db,
        "structured",
        {
          ...postRaw(),
          postCardProvenance: {
            light: { renderer: "xeet", captureTweetVersion: 13 },
            dark: { renderer: "react", captureTweetVersion: 13 },
          },
        },
        POST_CARD_FILES,
      );

      await startThreadsCardBackfill(runtime);

      expect(captureCalls).toEqual([]);
    });

    it("keeps stale-version recapture unforced when repair is not needed", async () => {
      const { db, runtime, captureCalls } = setup();
      insertPostSave(
        db,
        "stale",
        {
          ...postRaw(12),
          postCardProvenance: {
            light: { renderer: "react", captureTweetVersion: 12 },
            dark: { renderer: "react", captureTweetVersion: 12 },
          },
        },
        POST_CARD_FILES,
      );

      await startThreadsCardBackfill(runtime);

      expect(captureCalls).toEqual([
        { id: "stale", opts: { nativeOnly: true } },
      ]);
    });
  },
);
