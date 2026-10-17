import { describe, expect, it } from "vitest";
import type { ListEntry } from "../list-types";
import {
  BoardFeedResponseSchema,
  BoardsResponseSchema,
  boardFeedUrl,
  boardPinsPage,
  boardsPage,
  collectBoards,
  type PinterestBoard,
  type ResourcePageResult,
  resourceFailure,
  walkBoards,
} from "./boards";

function pins(ids: string[]): ListEntry[] {
  return ids.map((id) => ({
    sourceId: id,
    url: `https://www.pinterest.com/pin/${id}/`,
  }));
}

/** Serves board pages from a fixture and records every request, like the resource API. */
function boardFeed(pages: Record<string, ListEntry[][]>) {
  const requests: Array<[string, string | null]> = [];
  const fetchPage = async (
    boardId: string,
    bookmark: string | null,
  ): Promise<ResourcePageResult<ListEntry>> => {
    requests.push([boardId, bookmark]);
    const board = pages[boardId];
    if (!board) return { ok: false, reason: "unknown" };
    const index = bookmark ? Number(bookmark) : 0;
    const items = board[index] ?? [];
    const next = index + 1 < board.length ? String(index + 1) : null;
    return { ok: true, page: { items, bookmark: next } };
  };
  return { fetchPage, requests };
}

describe("boardsPage", () => {
  it("reads boards and the next bookmark", () => {
    const page = boardsPage(
      BoardsResponseSchema.parse({
        resource_response: {
          data: [
            { id: "915", name: "Design References", pin_count: 42 },
            { id: "88", name: "Memes", type: "board" },
            { id: "7", name: "A story", type: "story" },
            { name: "No id" },
          ],
          bookmark: "Pz8x",
        },
      }),
    );
    expect(page).toEqual({
      items: [
        { id: "915", name: "Design References", pinCount: 42 },
        { id: "88", name: "Memes", pinCount: null },
      ],
      bookmark: "Pz8x",
    });
  });

  it("ends on Pinterest's end markers", () => {
    for (const bookmark of ["-end-", "Y2JOb25lOw=="]) {
      expect(
        boardsPage(
          BoardsResponseSchema.parse({
            resource_response: { data: [], bookmark },
          }),
        ).bookmark,
      ).toBeNull();
    }
  });

  it("falls back to the bookmark echoed in the request options", () => {
    expect(
      boardsPage(
        BoardsResponseSchema.parse({
          resource_response: { data: [] },
          resource: { options: { bookmarks: ["Pz8y"] } },
        }),
      ).bookmark,
    ).toBe("Pz8y");
  });
});

describe("boardPinsPage", () => {
  it("keeps numeric pins and skips other feed items", () => {
    const page = boardPinsPage(
      BoardFeedResponseSchema.parse({
        resource_response: {
          data: [
            { id: "1001", type: "pin" },
            { id: "1002" },
            { id: "story-1", type: "story" },
            { id: "1003", type: "story" },
            null,
          ],
        },
      }),
    );
    expect(page).toEqual({ items: pins(["1001", "1002"]), bookmark: null });
  });

  it("reads feeds that wrap pins in results", () => {
    const page = boardPinsPage(
      BoardFeedResponseSchema.parse({
        resource_response: { data: { results: [{ id: "1001" }] } },
      }),
    );
    expect(page.items).toEqual(pins(["1001"]));
  });

  it("survives a malformed payload", () => {
    expect(
      boardPinsPage(BoardFeedResponseSchema.parse({ nope: true })),
    ).toEqual({ items: [], bookmark: null });
  });
});

describe("resourceFailure", () => {
  it("maps a failure envelope to a harvest reason", () => {
    const failure = (http_status?: number) =>
      resourceFailure({
        resource_response: { status: "failure", http_status },
      });
    expect(failure(401)).toBe("auth_required");
    expect(failure(429)).toBe("rate_limited");
    expect(failure(500)).toBe("unknown");
    expect(
      resourceFailure({ resource_response: { status: "success" } }),
    ).toBeNull();
  });
});

describe("boardFeedUrl", () => {
  it("asks for one board and carries the bookmark", () => {
    const url = new URL(boardFeedUrl("915", "Pz8x"));
    expect(url.pathname).toBe("/resource/BoardFeedResource/get/");
    expect(JSON.parse(url.searchParams.get("data") ?? "")).toEqual({
      options: { board_id: "915", page_size: 50, bookmarks: ["Pz8x"] },
      context: {},
    });
  });
});

describe("collectBoards", () => {
  it("pages through every board", async () => {
    const pages: PinterestBoard[][] = [
      [{ id: "1", name: "One", pinCount: 3 }],
      [{ id: "2", name: "Two", pinCount: null }],
    ];
    const result = await collectBoards(async (bookmark) => {
      const index = bookmark ? Number(bookmark) : 0;
      return {
        ok: true,
        page: {
          items: pages[index] ?? [],
          bookmark: index + 1 < pages.length ? String(index + 1) : null,
        },
      };
    });
    expect(result).toEqual({ ok: true, boards: pages.flat() });
  });

  it("reports a failure on the first page", async () => {
    expect(
      await collectBoards(async () => ({ ok: false, reason: "auth_required" })),
    ).toEqual({ ok: false, reason: "auth_required" });
  });
});

describe("walkBoards", () => {
  const design = { id: "design", name: "Design" };
  const type = { id: "type", name: "Type" };

  it("walks only the chosen boards and unions their pins", async () => {
    const feed = boardFeed({
      design: [pins(["1", "2"]), pins(["3"])],
      type: [pins(["3", "4"])],
      memes: [pins(["99"])],
    });
    const result = await walkBoards(
      [design, type],
      { knownIds: [] },
      feed.fetchPage,
    );
    const [one, two, three, four] = pins(["1", "2", "3", "4"]);
    expect(result).toEqual({
      ok: true,
      entries: [
        { ...one, collectionIds: ["design"] },
        { ...two, collectionIds: ["design"] },
        { ...three, collectionIds: ["design", "type"] },
        { ...four, collectionIds: ["type"] },
      ],
      reachedEnd: true,
      seen: 4,
    });
    expect(feed.requests.map(([board]) => board)).not.toContain("memes");
  });

  it("stops a board early after two pages of known pins", async () => {
    const feed = boardFeed({
      design: [pins(["9"]), pins(["1"]), pins(["2"]), pins(["3"])],
    });
    const result = await walkBoards(
      [design],
      { knownIds: ["1", "2", "3"], earlyStop: true },
      feed.fetchPage,
    );
    expect(result).toMatchObject({ ok: true, reachedEnd: true });
    expect(feed.requests).toHaveLength(3);
  });

  it("walks to the end on a full sync even when pins are known", async () => {
    const feed = boardFeed({
      design: [pins(["1"]), pins(["2"]), pins(["3"])],
    });
    await walkBoards(
      [design],
      { knownIds: ["1", "2", "3"], earlyStop: false },
      feed.fetchPage,
    );
    expect(feed.requests).toHaveLength(3);
  });

  it("skips a board that no longer exists and keeps the others", async () => {
    const feed = boardFeed({ type: [pins(["4"])] });
    const result = await walkBoards(
      [design, type],
      { knownIds: [] },
      feed.fetchPage,
    );
    expect(result).toEqual({
      ok: true,
      entries: pins(["4"]).map((pin) => ({ ...pin, collectionIds: ["type"] })),
      reachedEnd: true,
      seen: 1,
    });
  });

  it("marks the walk unfinished when a later page fails", async () => {
    let calls = 0;
    const result = await walkBoards([design], { knownIds: [] }, async () => {
      calls += 1;
      return calls === 1
        ? { ok: true, page: { items: pins(["1"]), bookmark: "next" } }
        : { ok: false, reason: "unknown" };
    });
    expect(result).toMatchObject({
      ok: true,
      entries: pins(["1"]),
      reachedEnd: false,
    });
  });

  it("stops the whole sync when Pinterest rate limits", async () => {
    const feed = boardFeed({ type: [pins(["4"])] });
    const result = await walkBoards(
      [design, type],
      { knownIds: [] },
      async (boardId, bookmark) =>
        boardId === "design"
          ? { ok: false, reason: "rate_limited" }
          : feed.fetchPage(boardId, bookmark),
    );
    expect(result).toEqual({ ok: false, reason: "rate_limited" });
    expect(feed.requests).toHaveLength(0);
  });
});
