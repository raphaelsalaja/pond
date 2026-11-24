import { expect, it, vi } from "vitest";
import { listPinterestWatch } from "./pinterest-rss";
import type { FetchWatchPage } from "./types";

const RSS = `<rss><channel><title>Pins</title>
  <item><link><![CDATA[https://www.pinterest.com/pin/123/?utm_source=rss]]></link></item>
  <item><link>https://www.pinterest.com/pin/123/#comments</link></item>
  <item><guid>https://www.pinterest.com/pin/456/</guid></item>
  <item><link>https://example.com/pin/789/</link></item>
</channel></rss>`;

it.each([
  ["pond", "user", "https://www.pinterest.com/pond/feed.rss"],
  ["pond/ideas", "board", "https://www.pinterest.com/pond/ideas.rss"],
  ["pond/ideas", undefined, "https://www.pinterest.com/pond/ideas.rss"],
] as const)("reads the feed for %s", async (handle, kind, address) => {
  const requests: Array<{
    url: string;
    credentials: RequestCredentials | undefined;
    userAgent: string | null;
  }> = [];
  const fetchPage: FetchWatchPage = async (url, init) => {
    requests.push({
      url,
      credentials: init.credentials,
      userAgent: new Headers(init.headers).get("user-agent"),
    });
    return new Response(RSS);
  };

  const result = await listPinterestWatch(handle, kind, undefined, fetchPage);

  expect(requests).toEqual([
    {
      url: address,
      credentials: "omit",
      userAgent: expect.stringContaining("PondBot"),
    },
  ]);
  expect(result).toEqual({
    ok: true,
    entries: [
      {
        url: "https://www.pinterest.com/pin/123/",
        source: "pinterest",
        sourceId: "123",
      },
      {
        url: "https://www.pinterest.com/pin/456/",
        source: "pinterest",
        sourceId: "456",
      },
    ],
  });
});

it("rejects an incomplete board address before a request", async () => {
  const fetchPage = vi.fn<FetchWatchPage>();
  expect(
    await listPinterestWatch("pond/", "board", undefined, fetchPage),
  ).toEqual({
    ok: false,
    reason: "unknown",
  });
  expect(fetchPage).not.toHaveBeenCalled();
});

it("returns a feed failure to the Watch runner", async () => {
  expect(
    await listPinterestWatch(
      "pond",
      undefined,
      undefined,
      async () => new Response(null, { status: 429 }),
    ),
  ).toEqual({ ok: false, reason: "rate_limited" });
});

it("passes cancellation to the feed request", async () => {
  const controller = new AbortController();
  const fetchPage: FetchWatchPage = async (_url, init) => {
    controller.abort();
    expect(init.signal?.aborted).toBe(true);
    throw new Error("Stopped");
  };
  expect(
    await listPinterestWatch("pond", undefined, controller.signal, fetchPage),
  ).toEqual({ ok: false, reason: "timeout" });
});
