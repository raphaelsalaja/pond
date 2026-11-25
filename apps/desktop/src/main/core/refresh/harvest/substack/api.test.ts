import type { JsonValue } from "@pond/schema/json";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ListHarvestArgs } from "../list-types";
import {
  readSubstackCapture,
  readSubstackLists,
  readSubstackSubscriptions,
} from "./api";
import type { SubstackGet } from "./api";

const missing: SubstackGet = async () =>
  new Response("missing", { status: 404 });

let respond: SubstackGet = missing;
const requested: Array<string> = [];

const get: SubstackGet = async (raw, accept) => {
  requested.push(raw);
  return respond(raw, accept);
};

function harvestSubstackLists(args: ListHarvestArgs) {
  return readSubstackLists(args, get);
}

function harvestSubstackSubscriptions(since: string, limit: number) {
  return readSubstackSubscriptions({ since, limit }, get);
}

function fetchSubstackCapture(sourceId: string) {
  return readSubstackCapture(sourceId, get);
}

const PROFILE = {
  id: 42,
  handle: "reader",
  subscriptions: [
    { publication: { id: 7, subdomain: "lenny" } },
    { publication: { id: 8, subdomain: "stratechery" } },
  ],
};
const PUB = { id: 7, name: "Lenny's Newsletter", subdomain: "lenny" };

function json(body: JsonValue, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function feed(...items: Array<{ slug: string; date: string }>): Response {
  const body = items
    .map(
      (i) =>
        `<item><title>${i.slug}</title><link>https://x.com/p/${i.slug}</link><pubDate>${i.date}</pubDate></item>`,
    )
    .join("");
  return new Response(`<rss><channel>${body}</channel></rss>`);
}

type Route = (url: URL) => Response | undefined;

function serve(...routes: Array<Route>) {
  respond = async (raw) => {
    const url = new URL(raw);
    if (url.pathname === "/api/v1/user/profile/self") return json(PROFILE);
    for (const route of routes) {
      const res = route(url);
      if (res) return res;
    }
    return new Response("missing", { status: 404 });
  };
}

function calledPaths(): Array<string> {
  return requested.map((raw) => {
    const url = new URL(raw);
    return `${url.host}${url.pathname}`;
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  respond = missing;
  requested.length = 0;
  vi.useRealTimers();
});

describe("harvestSubstackLists", () => {
  it("needs a signed-in session", async () => {
    respond = async () => json({ error: "auth" }, 401);
    await expect(harvestSubstackLists({ knownIds: [] })).resolves.toEqual({
      ok: false,
      reason: "auth_required",
    });
  });

  it("walks saved and liked posts and marks posts in both", async () => {
    serve(
      (url) =>
        url.pathname === "/api/v1/reader/posts"
          ? url.searchParams.get("cursor")
            ? json({
                posts: [{ id: 2, slug: "two", publication_id: 7 }],
                publications: [PUB],
                more: false,
              })
            : json({
                posts: [{ id: 1, slug: "one", publication_id: 7 }],
                publications: [PUB],
                more: true,
                cursor: "next",
              })
          : undefined,
      (url) =>
        url.pathname === "/api/v1/reader/feed/profile/42"
          ? json({
              items: [
                {
                  type: "post",
                  post: { id: 2, slug: "two" },
                  publication: PUB,
                },
                { type: "note" },
              ],
            })
          : undefined,
    );
    const result = await harvestSubstackLists({ knownIds: [] });
    expect(result).toMatchObject({ ok: true, reachedEnd: true });
    if (!result.ok) return;
    expect(
      result.entries.map((e) => [e.sourceId, e.listKinds?.slice().sort()]),
    ).toEqual([
      ["lenny.substack.com/p/one", ["saved"]],
      ["lenny.substack.com/p/two", ["liked", "saved"]],
    ]);
  });

  it("stops at a page it already knows", async () => {
    serve((url) =>
      url.pathname === "/api/v1/reader/posts"
        ? json({
            posts: [{ id: 1, slug: "one", publication_id: 7 }],
            publications: [PUB],
            more: true,
            cursor: "next",
          })
        : undefined,
    );
    const result = await harvestSubstackLists({
      knownIds: ["lenny.substack.com/p/one"],
      listKinds: ["saved"],
    });
    expect(result).toMatchObject({ ok: true, reachedEnd: true });
    expect(
      calledPaths().filter((p) => p.endsWith("/reader/posts")),
    ).toHaveLength(1);
  });

  it("surfaces a rate limit on the first page", async () => {
    serve((url) =>
      url.pathname === "/api/v1/reader/posts" ? json({}, 429) : undefined,
    );
    await expect(
      harvestSubstackLists({ knownIds: [], listKinds: ["saved"] }),
    ).resolves.toEqual({ ok: false, reason: "rate_limited" });
  });
});

describe("harvestSubstackSubscriptions", () => {
  it("keeps posts published after since, newest first and capped", async () => {
    serve(
      (url) =>
        url.host === "lenny.substack.com"
          ? feed(
              { slug: "new", date: "Fri, 02 Oct 2026 12:00:00 GMT" },
              { slug: "old", date: "Mon, 01 Sep 2026 12:00:00 GMT" },
            )
          : undefined,
      (url) =>
        url.host === "stratechery.substack.com"
          ? feed(
              { slug: "newest", date: "Sat, 03 Oct 2026 12:00:00 GMT" },
              { slug: "newer", date: "Thu, 01 Oct 2026 12:00:00 GMT" },
            )
          : undefined,
    );
    const result = await harvestSubstackSubscriptions(
      "2026-09-15T00:00:00.000Z",
      2,
    );
    expect(result).toMatchObject({ ok: true, reachedEnd: false, seen: 3 });
    if (!result.ok) return;
    expect(result.entries).toEqual([
      {
        sourceId: "stratechery.substack.com/p/newest",
        url: "https://stratechery.substack.com/p/newest",
        listKinds: ["subscription"],
        title: "newest",
      },
      {
        sourceId: "lenny.substack.com/p/new",
        url: "https://lenny.substack.com/p/new",
        listKinds: ["subscription"],
        title: "new",
      },
    ]);
  });

  it("stops reading feeds once rate limited", async () => {
    serve((url) =>
      url.host === "lenny.substack.com" ? json({}, 429) : undefined,
    );
    const result = await harvestSubstackSubscriptions(
      "2026-09-15T00:00:00.000Z",
      50,
    );
    expect(result).toMatchObject({ ok: true, entries: [] });
    expect(calledPaths()).not.toContain("stratechery.substack.com/feed");
  });
});

describe("fetchSubstackCapture", () => {
  it("resolves a slug to the full post by id", async () => {
    serve(
      (url) =>
        url.pathname === "/api/v1/posts/how-to-price"
          ? json({ id: 5, slug: "how-to-price", title: "Preview" })
          : undefined,
      (url) =>
        url.pathname === "/api/v1/posts/by-id/5"
          ? json({
              post: {
                id: 5,
                slug: "how-to-price",
                title: "Full",
                body_html: "<p>Body</p>",
              },
              publication: PUB,
            })
          : undefined,
    );
    const result = await fetchSubstackCapture(
      "lenny.substack.com/p/how-to-price",
    );
    expect(result).toMatchObject({
      ok: true,
      capture: {
        id: "lenny.substack.com/p/how-to-price",
        url: "https://lenny.substack.com/p/how-to-price",
        title: "Full",
        description: "Body",
      },
    });
  });

  it("falls back to the public post when the id lookup fails", async () => {
    serve((url) =>
      url.pathname === "/api/v1/posts/how-to-price"
        ? json({ id: 5, slug: "how-to-price", title: "Preview" })
        : undefined,
    );
    const result = await fetchSubstackCapture(
      "lenny.substack.com/p/how-to-price",
    );
    expect(result).toMatchObject({ ok: true, capture: { title: "Preview" } });
  });

  it("reports a post that's gone", async () => {
    serve();
    await expect(fetchSubstackCapture("p-404")).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});
