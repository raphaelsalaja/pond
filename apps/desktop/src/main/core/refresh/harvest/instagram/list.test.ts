import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { buildInstagramListExpression } from "./list";

interface FeedPage {
  items: Array<{ media: { code: string; media_type: number } }>;
  more_available: boolean;
  next_max_id?: string;
}

const PAGES = new Map<string, FeedPage>([
  ["top", page(["a1", "a2"], "c2")],
  ["c2", page(["b1", "b2"], "c3")],
  ["c3", page(["c1"])],
]);

function page(codes: Array<string>, next?: string): FeedPage {
  const feed: FeedPage = {
    items: codes.map((code) => ({ media: { code, media_type: 1 } })),
    more_available: next !== undefined,
  };
  if (next) {
    feed.next_max_id = next;
  }
  return feed;
}

function harness(opts: { rejectCursor?: string; abortAfter?: number } = {}) {
  const requested: Array<string> = [];
  const context = {
    location: { pathname: "/", href: "https://www.instagram.com/" },
    document: { querySelector: () => null, documentElement: { lang: "en" } },
    navigator: { language: "en" },
    setTimeout: (fn: () => void) => setTimeout(fn, 0),
    __pondHarvestAbort: false,
    fetch: async (url: string) => {
      const cursor = new URL(url, "https://www.instagram.com").searchParams.get(
        "max_id",
      );
      requested.push(cursor ?? "top");
      if (
        opts.abortAfter !== undefined &&
        requested.length >= opts.abortAfter
      ) {
        context.__pondHarvestAbort = true;
      }
      const body =
        cursor === opts.rejectCursor ? undefined : PAGES.get(cursor ?? "top");
      return {
        ok: body !== undefined,
        status: body ? 200 : 400,
        headers: { get: () => null },
        json: async () => body,
      };
    },
  };
  return { context, requested };
}

function codes(result: {
  entries?: Array<{ sourceId: string }>;
}): Array<string> {
  return (result.entries ?? []).map((e) => e.sourceId);
}

describe("Instagram saved list", () => {
  it("continues from a stored cursor", async () => {
    const { context, requested } = harness();
    const result = await runInNewContext(
      buildInstagramListExpression({ knownIds: [], resumeCursor: "c2" }),
      context,
    );
    expect(requested).toEqual(["c2", "c3"]);
    expect(codes(result)).toEqual(["b1", "b2", "c1"]);
    expect(result).toMatchObject({ ok: true, reachedEnd: true });
  });

  it("reads from the top when a stored cursor is rejected", async () => {
    const { context, requested } = harness({ rejectCursor: "stale" });
    const result = await runInNewContext(
      buildInstagramListExpression({ knownIds: [], resumeCursor: "stale" }),
      context,
    );
    expect(requested).toEqual(["stale", "top", "c2", "c3"]);
    expect(codes(result)).toEqual(["a1", "a2", "b1", "b2", "c1"]);
    expect(result).toMatchObject({ ok: true, reachedEnd: true });
  });

  it("hands back the next page's cursor when stopped early", async () => {
    const { context } = harness({ abortAfter: 1 });
    const result = await runInNewContext(
      buildInstagramListExpression({ knownIds: [] }),
      context,
    );
    expect(codes(result)).toEqual(["a1", "a2"]);
    expect(result).toMatchObject({
      ok: true,
      reachedEnd: false,
      resumeCursor: "c2",
    });
  });
});
