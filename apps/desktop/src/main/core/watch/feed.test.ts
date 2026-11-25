import { expect, it, vi } from "vitest";
import { readFeed } from "./feed";
import { resolveWatchTarget } from "./resolve";
import type { FetchWatchPage } from "./types";

const ADDRESS = "https://example.com/Feed.xml?key=AbC";
const RSS = `<rss version="2.0"><channel>
  <title><![CDATA[News & Notes]]></title>
  <item><link><![CDATA[https://example.com/First?utm_source=rss]]></link></item>
  <item><link>https://example.com/First#comments</link></item>
  <item><link>https://example.com/Next?a=1&amp;b=2</link></item>
  <item><guid isPermaLink="true">https://example.com/Third</guid></item>
  <item><guid isPermaLink="false">private-id</guid></item>
  <item><link>javascript:alert(1)</link></item>
  <item><link>file:///tmp/example</link></item>
  <item><link>https://youtube.com/watch?v=abcdefghijk</link></item>
</channel></rss>`;

function serve(body: string): FetchWatchPage {
  return async () => new Response(body);
}

it("reads RSS links with the normal Save identity rules", async () => {
  expect(await readFeed(ADDRESS, serve(RSS))).toEqual({
    ok: true,
    title: "News & Notes",
    entries: [
      {
        url: "https://example.com/First",
        source: "web",
        sourceId: "https://example.com/First",
      },
      {
        url: "https://example.com/Next?a=1&b=2",
        source: "web",
        sourceId: "https://example.com/Next?a=1&b=2",
      },
      {
        url: "https://example.com/Third",
        source: "web",
        sourceId: "https://example.com/Third",
      },
      {
        url: "https://youtube.com/watch?v=abcdefghijk",
        source: "youtube",
        sourceId: "abcdefghijk",
      },
    ],
  });
});

it("reads Atom article links and resolves XML base URLs", async () => {
  const atom = `<atom:feed xmlns:atom="http://www.w3.org/2005/Atom" xml:base="/articles/">
    <atom:title type="text">Atom News</atom:title>
    <atom:entry>
      <atom:link rel="self" href="one.atom"/>
      <atom:link rel="enclosure" href="one.mp3"/>
      <atom:link rel="alternate" href="one"/>
    </atom:entry>
    <atom:entry xml:base="nested/"><atom:link href="two"/></atom:entry>
  </atom:feed>`;
  const result = await readFeed(ADDRESS, serve(atom));
  expect(result.ok && result.title).toBe("Atom News");
  expect(result.ok && result.entries.map((entry) => entry.url)).toEqual([
    "https://example.com/articles/one",
    "https://example.com/articles/nested/two",
  ]);
});

it("does not use the RSS self link as the article link", async () => {
  const xml = `<rss xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>News</title>
    <item><atom:link rel="self" href="https://example.com/feed"/>
      <link>https://example.com/article</link></item>
  </channel></rss>`;
  const result = await readFeed(ADDRESS, serve(xml));
  expect(result.ok && result.entries.map((entry) => entry.url)).toEqual([
    "https://example.com/article",
  ]);
});

it("uses a guid only when it is an absolute URL", async () => {
  const xml = `<rss><channel><title>News</title>
    <item><guid>a1b2c3-uuid</guid></item>
    <item><guid>tag:example.com,2026:post-9</guid></item>
    <item><guid>https://example.com/fourth</guid></item>
  </channel></rss>`;
  const result = await readFeed(ADDRESS, serve(xml));
  expect(result.ok && result.entries.map((entry) => entry.url)).toEqual([
    "https://example.com/fourth",
  ]);
});

it.each([
  [
    "a public DTD",
    `<?xml version="1.0"?>
<!DOCTYPE rss PUBLIC "-//Netscape Communications//DTD RSS 0.91//EN" "http://my.netscape.com/publish/formats/rss-0.91.dtd">
<rss version="0.91"><channel><title>News</title><item><link>https://example.com/article</link></item></channel></rss>`,
  ],
  [
    "an HTML document in CDATA",
    `<rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>News</title>
  <item><link>https://example.com/article</link><content:encoded><![CDATA[<!DOCTYPE html><p>Hi</p>]]></content:encoded></item>
</channel></rss>`,
  ],
])("reads a feed with %s", async (_name, xml) => {
  const result = await readFeed(ADDRESS, serve(xml));
  expect(result.ok && result.entries.map((entry) => entry.url)).toEqual([
    "https://example.com/article",
  ]);
});

it("accepts an empty feed with a title", async () => {
  expect(
    await readFeed(
      ADDRESS,
      serve("<rss><channel><title>Empty</title></channel></rss>"),
    ),
  ).toEqual({
    ok: true,
    title: "Empty",
    entries: [],
  });
});

it.each([
  "<html><head><title>News</title></head></html>",
  "<rss><channel><title>Broken</channel></rss>",
  '<!DOCTYPE rss [<!ENTITY example "text">]><rss><channel><title>&example;</title></channel></rss>',
])("rejects invalid feed input", async (body) => {
  expect(await readFeed(ADDRESS, serve(body))).toEqual({
    ok: false,
    reason: "not_found",
  });
});

it.each([
  [404, "not_found"],
  [410, "not_found"],
  [401, "auth_required"],
  [403, "auth_required"],
  [429, "rate_limited"],
  [503, "unavailable"],
])("reports HTTP status %s", async (status, reason) => {
  expect(
    await readFeed(ADDRESS, async () => new Response(null, { status })),
  ).toEqual({ ok: false, reason });
});

it("reports a network failure", async () => {
  expect(
    await readFeed(ADDRESS, async () => {
      throw new Error("Offline");
    }),
  ).toEqual({ ok: false, reason: "unavailable" });
});

it("passes cancellation to the request and omits browser credentials", async () => {
  const controller = new AbortController();
  const requests: Array<{
    credentials: RequestCredentials | undefined;
    aborted: boolean | undefined;
  }> = [];
  const fetchPage: FetchWatchPage = async (_url, init) => {
    controller.abort();
    requests.push({
      credentials: init.credentials,
      aborted: init.signal?.aborted,
    });
    throw new Error("Stopped");
  };
  expect(await readFeed(ADDRESS, fetchPage, controller.signal)).toEqual({
    ok: false,
    reason: "timeout",
  });
  expect(requests).toEqual([{ credentials: "omit", aborted: true }]);
});

it("rejects a feed that exceeds the response limit", async () => {
  expect(
    await readFeed(
      ADDRESS,
      async () =>
        new Response(RSS, {
          headers: { "content-length": String(6 * 1024 * 1024) },
        }),
    ),
  ).toEqual({ ok: false, reason: "unavailable" });
});

it("checks a feed and preserves the URL path and query", async () => {
  expect(await resolveWatchTarget("web", `${ADDRESS}#top`, serve(RSS))).toEqual(
    {
      kind: "feed",
      handle: ADDRESS,
      display: "News & Notes",
    },
  );
  expect(await resolveWatchTarget("web", ADDRESS, serve("<html/>"))).toBeNull();
});

it.each([
  "file:///tmp/feed",
  "javascript:alert(1)",
  "https://user:pass@example.com/feed",
  "person",
])("rejects an invalid feed URL before a request", async (input) => {
  const fetchPage = vi.fn<FetchWatchPage>();
  expect(await readFeed(input, fetchPage)).toEqual({
    ok: false,
    reason: "not_found",
  });
  expect(await resolveWatchTarget("web", input, fetchPage)).toBeNull();
  expect(fetchPage).not.toHaveBeenCalled();
});
