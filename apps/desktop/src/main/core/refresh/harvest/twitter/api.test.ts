import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildBookmarksApiExpression } from "./api";

const ResultSchema = z.object({
  ok: z.literal(true),
  captures: z.array(z.object({ url: z.string() })),
  reachedEnd: z.boolean(),
});

function xwebPage(ids: Array<string>, next: string | null) {
  const entries: Array<object> = ids.map((id) => ({
    entry_id: `tweet-${id}`,
    content: { __typename: "TimelineTimelineItem" },
  }));
  if (next) {
    entries.push({
      entry_id: "cursor-bottom-1",
      content: { __typename: "TimelineTimelineCursor", value: next },
    });
  }
  return JSON.stringify({
    data: {
      bookmark_timeline_v2: {
        timeline: {
          instructions: [{ __typename: "TimelineAddEntries", entries }],
        },
      },
    },
  });
}

/** Stands in for X's x-web bookmarks page: the first page was server-rendered, so the copied request already asks for page 2. */
function bookmarksPage(pages: Record<string, string>) {
  const dom = new JSDOM("<main></main>", {
    runScripts: "outside-only",
    url: "https://x.com/i/history",
  });
  const requested: Array<string | null> = [];
  Object.assign(dom.window, {
    __pondBookmarksRequest: {
      url: `https://api.x.com/graphql/abc/BookmarkTimeline?variables=${encodeURIComponent(
        JSON.stringify({ count: 20, cursor: "PAGE2" }),
      )}`,
      method: "GET",
      headers: { "content-type": "application/json" },
    },
    fetch: async (url: string) => {
      const vars = z
        .object({ cursor: z.string().optional() })
        .parse(JSON.parse(new URL(url).searchParams.get("variables") ?? "{}"));
      const cursor = vars.cursor ?? null;
      requested.push(cursor);
      const body = pages[cursor ?? "FIRST"] ?? xwebPage([], null);
      return { ok: true, status: 200, text: async () => body };
    },
  });
  const run = async () =>
    ResultSchema.parse(
      // SAFETY: the expression wraps the controlled in-page function exercised by this fixture.
      await dom.window.eval(buildBookmarksApiExpression({ knownIds: [] })),
    );
  return { run, requested };
}

describe("buildBookmarksApiExpression", () => {
  it("replays from the first page and follows x-web cursors to the end", async () => {
    const { run, requested } = bookmarksPage({
      FIRST: xwebPage(["1", "2"], "PAGE2"),
      PAGE2: xwebPage(["3"], "PAGE3"),
      PAGE3: xwebPage([], null),
    });

    const result = await run();

    expect(requested).toEqual([null, "PAGE2", "PAGE3"]);
    expect(result.captures).toHaveLength(3);
    expect(result.reachedEnd).toBe(true);
  });
});
