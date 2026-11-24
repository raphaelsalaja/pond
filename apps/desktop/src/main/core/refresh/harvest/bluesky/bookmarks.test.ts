import type { JsonValue } from "@pond/schema/json";
import { describe, expect, it } from "vitest";
import { readBlueskyBookmarks } from "./bookmarks";
import type { BookmarkPage } from "./bookmarks";

const AUTHOR = "did:plc:t2dnigzpoovty4qcxzgv73fu";

function post(rkey: string) {
  return {
    uri: `at://${AUTHOR}/app.bsky.feed.post/${rkey}`,
    author: { did: AUTHOR, handle: "alice.bsky.social" },
    record: { text: `post ${rkey}`, createdAt: "2026-10-01T00:00:00.000Z" },
  };
}

function bookmark(rkey: string, createdAt: string) {
  return {
    createdAt,
    subject: { uri: `at://${AUTHOR}/app.bsky.feed.post/${rkey}` },
    item: post(rkey),
  };
}

function pages(bodies: Array<{ status?: number; body: JsonValue }>) {
  const cursors: Array<string | undefined> = [];
  const page: BookmarkPage = async (cursor) => {
    cursors.push(cursor);
    const next = bodies[cursors.length - 1];
    if (!next) {
      return null;
    }
    return { status: next.status ?? 200, body: next.body };
  };
  return { page, cursors };
}

describe("readBlueskyBookmarks", () => {
  it("reads every page as saved entries with the bookmarked time", async () => {
    const { page, cursors } = pages([
      {
        body: {
          bookmarks: [bookmark("a", "2026-10-20T10:00:00.000Z")],
          cursor: "c1",
        },
      },
      { body: { bookmarks: [bookmark("b", "2026-10-19T10:00:00.000Z")] } },
    ]);
    const result = await readBlueskyBookmarks({ knownIds: [] }, page);
    expect(cursors).toEqual([undefined, "c1"]);
    expect(result).toMatchObject({ ok: true, reachedEnd: true });
    if (!result.ok) {
      return;
    }
    expect(
      result.entries.map((e) => [e.sourceId, e.savedAt, e.listKinds]),
    ).toEqual([
      ["a", "2026-10-20T10:00:00.000Z", ["saved"]],
      ["b", "2026-10-19T10:00:00.000Z", ["saved"]],
    ]);
  });

  it("skips bookmarks whose post is gone", async () => {
    const { page } = pages([
      {
        body: {
          bookmarks: [
            { createdAt: "2026-10-20T10:00:00.000Z", item: { notFound: true } },
            bookmark("b", "2026-10-19T10:00:00.000Z"),
          ],
        },
      },
    ]);
    const result = await readBlueskyBookmarks({ knownIds: [] }, page);
    expect(result.ok && result.entries.map((e) => e.sourceId)).toEqual(["b"]);
  });

  it("stops at the saved-since date", async () => {
    const { page } = pages([
      {
        body: {
          bookmarks: [
            bookmark("a", "2026-10-20T10:00:00.000Z"),
            bookmark("b", "2026-09-01T10:00:00.000Z"),
          ],
          cursor: "c1",
        },
      },
    ]);
    const result = await readBlueskyBookmarks(
      { knownIds: [], savedSince: "2026-10-01T00:00:00.000Z" },
      page,
    );
    expect(result.ok && result.entries.map((e) => e.sourceId)).toEqual(["a"]);
    expect(result.ok && result.reachedEnd).toBe(true);
  });

  it("stops after two pages of bookmarks already in the library", async () => {
    const { page, cursors } = pages([
      {
        body: {
          bookmarks: [bookmark("a", "2026-10-20T10:00:00.000Z")],
          cursor: "c1",
        },
      },
      {
        body: {
          bookmarks: [bookmark("b", "2026-10-19T10:00:00.000Z")],
          cursor: "c2",
        },
      },
      { body: { bookmarks: [bookmark("c", "2026-10-18T10:00:00.000Z")] } },
    ]);
    await readBlueskyBookmarks({ knownIds: ["a", "b"] }, page);
    expect(cursors).toEqual([undefined, "c1"]);
  });

  it("asks you to sign in when the first page is refused", async () => {
    const { page } = pages([{ status: 401, body: null }]);
    expect(await readBlueskyBookmarks({ knownIds: [] }, page)).toEqual({
      ok: false,
      reason: "auth_required",
    });
  });

  it("keeps what it read and the cursor when a later page fails", async () => {
    const { page } = pages([
      {
        body: {
          bookmarks: [bookmark("a", "2026-10-20T10:00:00.000Z")],
          cursor: "c1",
        },
      },
      { status: 502, body: null },
    ]);
    const result = await readBlueskyBookmarks({ knownIds: [] }, page);
    expect(result).toMatchObject({
      ok: true,
      reachedEnd: false,
      resumeCursor: "c1",
    });
  });
});
