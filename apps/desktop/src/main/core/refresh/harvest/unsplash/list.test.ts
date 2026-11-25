// @vitest-environment node

import { runInContext } from "node:vm";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import type { ListHarvestArgs, ListHarvestResult } from "../list-types";
import { buildUnsplashListExpression, UNSPLASH_LIST_URL } from "./list";

function asset(id: string) {
  return {
    id,
    slug: `two-women-in-oversized-shirts-with-files-and-phone-${id}`,
    created_at: "2025-10-24T15:47:41Z",
    description:
      "fashion-oriented office retro aesthetics photo with two women",
    alt_description: "Two women in oversized shirts with files and phone",
    asset_type: "photo",
    urls: {
      raw: `https://plus.unsplash.com/premium_photo-${id}?ixid=NHwxMjA3fDA&ixlib=rb-4.1.0`,
      full: `https://plus.unsplash.com/premium_photo-${id}?crop=entropy&q=85`,
    },
    user: {
      username: "lishakov",
      name: "Andrej Lišakov",
      links: { html: "https://unsplash.com/@lishakov" },
      profile_image: { large: "https://images.unsplash.com/profile-1" },
    },
  };
}

function bookmarks(total: number, ids: Array<string>): Reply {
  return { status: 200, body: { total, results: ids.map(asset) } };
}

interface Reply {
  status: number;
  body?: object;
}

const ME: Reply = { status: 200, body: { username: "pond" } };

async function walk(
  args: Partial<ListHarvestArgs>,
  replies: Map<string, Reply>,
): Promise<{ result: ListHarvestResult; requested: Array<string> }> {
  const dom = new JSDOM("<!doctype html><body></body>", {
    url: UNSPLASH_LIST_URL,
    runScripts: "outside-only",
  });
  const requested: Array<string> = [];
  Object.assign(dom.window, {
    setTimeout: (fn: () => void) => setTimeout(fn, 0),
    fetch: async (url: string) => {
      const parsed = new URL(url, "https://unsplash.com");
      const key =
        parsed.pathname === "/napi/me"
          ? "me"
          : (parsed.searchParams.get("page") ?? "");
      requested.push(key);
      const reply = replies.get(key) ?? { status: 404 };
      return new Response(JSON.stringify(reply.body ?? {}), {
        status: reply.status,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const result: ListHarvestResult = await runInContext(
    buildUnsplashListExpression({ knownIds: [], ...args }),
    dom.getInternalVMContext(),
  );
  return { result, requested };
}

function ids(result: ListHarvestResult): Array<string> {
  return result.ok ? result.entries.map((entry) => entry.sourceId) : [];
}

describe("Unsplash bookmarks walk", () => {
  it("reads pages until it has the total and keeps the original file", async () => {
    const first = Array.from({ length: 20 }, (_, i) => `aaaaaaaa${100 + i}`);
    const { result, requested } = await walk(
      {},
      new Map([
        ["me", ME],
        ["1", bookmarks(21, first)],
        ["2", bookmarks(21, ["p_1H2gI1-KA"])],
      ]),
    );
    expect(requested).toEqual(["me", "1", "2"]);
    expect(ids(result)).toHaveLength(21);
    expect(result).toMatchObject({
      ok: true,
      reachedEnd: true,
      complete: true,
    });
    expect(result.ok && result.entries[20]).toEqual({
      sourceId: "p_1H2gI1-KA",
      url: "https://unsplash.com/photos/p_1H2gI1-KA",
      title: "Two women in oversized shirts with files and phone",
      description:
        "fashion-oriented office retro aesthetics photo with two women",
      author: "Andrej Lišakov",
      mediaUrl:
        "https://plus.unsplash.com/premium_photo-p_1H2gI1-KA?ixid=NHwxMjA3fDA&ixlib=rb-4.1.0",
      mediaUrls: [
        {
          url: "https://plus.unsplash.com/premium_photo-p_1H2gI1-KA?ixid=NHwxMjA3fDA&ixlib=rb-4.1.0",
          type: "image",
        },
      ],
      mediaType: "image",
      listKinds: ["saved"],
    });
  });

  it("stops on an empty page", async () => {
    const { result, requested } = await walk(
      {},
      new Map([
        ["me", ME],
        ["1", bookmarks(50, ["bbbbbbbbbb1"])],
        ["2", bookmarks(50, [])],
      ]),
    );
    expect(requested).toEqual(["me", "1", "2"]);
    expect(ids(result)).toEqual(["bbbbbbbbbb1"]);
  });

  it("stops after two pages of bookmarks it already has", async () => {
    const pageOne = Array.from({ length: 20 }, (_, i) => `cccccccc${100 + i}`);
    const pageTwo = Array.from({ length: 20 }, (_, i) => `dddddddd${100 + i}`);
    const { result, requested } = await walk(
      { knownIds: [...pageOne, ...pageTwo] },
      new Map([
        ["me", ME],
        ["1", bookmarks(100, pageOne)],
        ["2", bookmarks(100, pageTwo)],
        ["3", bookmarks(100, ["eeeeeeeeeee"])],
      ]),
    );
    expect(requested).toEqual(["me", "1", "2"]);
    expect(result).toMatchObject({ ok: true, reachedEnd: true });
    expect(result.ok && result.complete).toBeFalsy();
  });

  it("resumes at the page a timed-out run stopped on", async () => {
    const { result, requested } = await walk(
      { resumeCursor: "4" },
      new Map([
        ["me", ME],
        ["4", bookmarks(61, ["fffffffffff"])],
      ]),
    );
    expect(requested).toEqual(["me", "4"]);
    expect(ids(result)).toEqual(["fffffffffff"]);
    expect(result.ok && result.complete).toBeFalsy();
  });

  it("reports a signed-out session", async () => {
    const { result } = await walk(
      {},
      new Map([["me", { status: 401, body: { errors: ["OAuth error"] } }]]),
    );
    expect(result).toEqual({ ok: false, reason: "auth_required" });
  });
});
