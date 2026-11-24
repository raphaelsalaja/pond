import { describe, expect, it } from "vitest";
import {
  readBlueskyCapture,
  readBlueskyLikes,
  readBlueskyLists,
  resolveProfile,
} from "./api";
import type { AtGet } from "./atproto";

const ME = "did:plc:me";
const PDS = "https://puffball.us-east.host.bsky.network";
const AUTHOR = "did:plc:t2dnigzpoovty4qcxzgv73fu";

function postUri(rkey: string): string {
  return `at://${AUTHOR}/app.bsky.feed.post/${rkey}`;
}

interface LikeValue {
  $type: string;
  subject: { cid: string; uri: string };
  createdAt?: string;
}

function like(rkey: string, subject: string, createdAt?: string) {
  const value: LikeValue = {
    $type: "app.bsky.feed.like",
    subject: { cid: "bafy", uri: subject },
  };
  if (createdAt) {
    value.createdAt = createdAt;
  }
  return { uri: `at://${ME}/app.bsky.feed.like/${rkey}`, value };
}

function post(rkey: string) {
  return {
    uri: postUri(rkey),
    author: { did: AUTHOR, handle: "alice.bsky.social", displayName: "Alice" },
    record: { text: `post ${rkey}`, createdAt: "2026-10-01T00:00:00.000Z" },
    likeCount: 3,
  };
}

interface Route {
  match: (url: URL) => boolean;
  body: object;
  status?: number;
}

interface Transport {
  get: AtGet;
  urls: Array<URL>;
}

interface LikesBody {
  records: Array<ReturnType<typeof like>>;
  cursor?: string;
}

function transport(routes: Array<Route>): Transport {
  const urls: Array<URL> = [];
  const get: AtGet = async (raw) => {
    const url = new URL(raw);
    urls.push(url);
    const route = routes.find((r) => r.match(url));
    if (!route) {
      return new Response("{}", { status: 404 });
    }
    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
    });
  };
  return { get, urls };
}

const DID_DOC: Route = {
  match: (url) => url.host === "plc.directory",
  body: {
    service: [
      {
        id: "#atproto_pds",
        type: "AtprotoPersonalDataServer",
        serviceEndpoint: PDS,
      },
    ],
  },
};

function likesPage(cursor: string | undefined, body: LikesBody): Route {
  return {
    match: (url) =>
      url.pathname.endsWith("com.atproto.repo.listRecords") &&
      url.searchParams.get("cursor") === (cursor ?? null),
    body,
  };
}

const POSTS: Route = {
  match: (url) => url.pathname.endsWith("app.bsky.feed.getPosts"),
  body: {
    posts: ["3aaaaaaaaaaaa", "3bbbbbbbbbbbb", "3cccccccccccc"].map(post),
  },
};

describe("Bluesky likes", () => {
  it("walks your like records on your own PDS and keeps the liked-at time", async () => {
    const { get, urls } = transport([
      DID_DOC,
      likesPage(undefined, {
        records: [
          like(
            "3mys4qcjf6k24",
            postUri("3aaaaaaaaaaaa"),
            "2026-10-26T16:18:01.499Z",
          ),
          like("3mys4ll3mrs2o", `at://${AUTHOR}/app.bsky.feed.generator/cats`),
          like("3mys4kkkkkkk2", postUri("3dddddddddddd")),
        ],
        cursor: "3mys4kkkkkkk2",
      }),
      likesPage("3mys4kkkkkkk2", {
        records: [like("3mys4jjjjjjj2", postUri("3bbbbbbbbbbbb"))],
      }),
      POSTS,
    ]);
    const result = await readBlueskyLikes({ knownIds: [] }, get, ME);

    expect(result).toMatchObject({ ok: true, reachedEnd: true });
    if (!result.ok) {
      return;
    }
    expect(result.entries.map((e) => e.sourceId)).toEqual([
      "3aaaaaaaaaaaa",
      "3bbbbbbbbbbbb",
    ]);
    expect(result.entries[0]).toMatchObject({
      url: "https://bsky.app/profile/alice.bsky.social/post/3aaaaaaaaaaaa",
      savedAt: "2026-10-26T16:18:01.499Z",
      listKinds: ["liked"],
    });
    expect(result.entries[1]?.savedAt).toMatch(/^20\d\d-/);
    const listCalls = urls.filter((u) =>
      u.pathname.endsWith("com.atproto.repo.listRecords"),
    );
    expect(listCalls.map((u) => u.origin)).toEqual([PDS, PDS]);
    expect(listCalls[0]?.searchParams.get("repo")).toBe(ME);
    const hydrated = urls.find((u) =>
      u.pathname.endsWith("app.bsky.feed.getPosts"),
    );
    expect(hydrated?.searchParams.getAll("uris")).toEqual([
      postUri("3aaaaaaaaaaaa"),
      postUri("3dddddddddddd"),
    ]);
  });

  it("resumes from the cursor a timed-out backfill stopped at", async () => {
    const { get, urls } = transport([
      DID_DOC,
      likesPage("3mys4kkkkkkk2", {
        records: [like("3mys4jjjjjjj2", postUri("3cccccccccccc"))],
      }),
      POSTS,
    ]);
    const result = await readBlueskyLikes(
      { knownIds: [], resumeCursor: "3mys4kkkkkkk2" },
      get,
      ME,
    );
    expect(result.ok && result.entries.map((e) => e.sourceId)).toEqual([
      "3cccccccccccc",
    ]);
    expect(urls.filter((u) => u.pathname.endsWith("listRecords"))).toHaveLength(
      1,
    );
  });

  it("stops at the first like before the import's start date", async () => {
    const { get } = transport([
      DID_DOC,
      likesPage(undefined, {
        records: [
          like(
            "3mys4qcjf6k24",
            postUri("3aaaaaaaaaaaa"),
            "2026-10-26T00:00:00.000Z",
          ),
          like(
            "3mys4ll3mrs2o",
            postUri("3bbbbbbbbbbbb"),
            "2026-09-01T00:00:00.000Z",
          ),
        ],
        cursor: "next",
      }),
      POSTS,
    ]);
    const result = await readBlueskyLikes(
      { knownIds: [], savedSince: "2026-10-01T00:00:00.000Z" },
      get,
      ME,
    );
    expect(result.ok && result.entries.map((e) => e.sourceId)).toEqual([
      "3aaaaaaaaaaaa",
    ]);
    expect(result).toMatchObject({ reachedEnd: true });
  });

  it("fails when the DID has no PDS", async () => {
    const { get } = transport([]);
    expect(await readBlueskyLikes({ knownIds: [] }, get, ME)).toEqual({
      ok: false,
      reason: "unknown",
    });
  });
});

describe("Bluesky capture", () => {
  it("resolves a handle URL to the post's DID form before reading it", async () => {
    const { get, urls } = transport([
      {
        match: (url) => url.pathname.endsWith("resolveHandle"),
        body: { did: AUTHOR },
      },
      POSTS,
    ]);
    const result = await readBlueskyCapture(
      "3aaaaaaaaaaaa",
      "https://bsky.app/profile/alice.bsky.social/post/3aaaaaaaaaaaa",
      get,
    );
    expect(result).toMatchObject({
      ok: true,
      capture: { id: "3aaaaaaaaaaaa", description: "post 3aaaaaaaaaaaa" },
    });
    const read = urls.find((u) => u.pathname.endsWith("getPosts"));
    expect(read?.searchParams.getAll("uris")).toEqual([
      postUri("3aaaaaaaaaaaa"),
    ]);
  });

  it("reports a deleted post as gone", async () => {
    const { get } = transport([
      {
        match: (url) => url.pathname.endsWith("getPosts"),
        body: { posts: [] },
      },
    ]);
    expect(
      await readBlueskyCapture(
        "3aaaaaaaaaaaa",
        `https://bsky.app/profile/${AUTHOR}/post/3aaaaaaaaaaaa`,
        get,
      ),
    ).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("Bluesky profile", () => {
  it("stores the current handle the profile reports", async () => {
    const { get } = transport([
      {
        match: (url) => url.pathname.endsWith("resolveHandle"),
        body: { did: ME },
      },
      {
        match: (url) => url.pathname.endsWith("app.bsky.actor.getProfile"),
        body: { did: ME, handle: "alice.example.com" },
      },
    ]);
    expect(await resolveProfile(get, "alice.bsky.social")).toEqual({
      did: ME,
      handle: "alice.example.com",
    });
  });

  it("returns null for a handle that does not resolve", async () => {
    const { get } = transport([]);
    expect(await resolveProfile(get, "nobody.example")).toBeNull();
  });
});

function entry(sourceId: string, kind: "liked" | "saved") {
  return { sourceId, url: `https://bsky.app/x/${sourceId}`, listKinds: [kind] };
}

describe("readBlueskyLists", () => {
  it("reads likes, then bookmarks, and merges a post on both", async () => {
    const result = await readBlueskyLists(
      { knownIds: [], listKinds: ["saved", "liked"] },
      {
        liked: async () => ({
          ok: true,
          entries: [entry("a", "liked")],
          reachedEnd: true,
        }),
        saved: async () => ({
          ok: true,
          entries: [entry("a", "saved"), entry("b", "saved")],
          reachedEnd: true,
        }),
      },
    );
    expect(
      result.ok && result.entries.map((e) => [e.sourceId, e.listKinds]),
    ).toEqual([
      ["a", ["liked", "saved"]],
      ["b", ["saved"]],
    ]);
  });

  it("keeps syncing likes when bookmarks aren't signed in", async () => {
    const result = await readBlueskyLists(
      { knownIds: [], listKinds: ["saved", "liked"] },
      {
        liked: async () => ({ ok: true, entries: [], reachedEnd: true }),
        saved: async () => ({ ok: false, reason: "auth_required" }),
      },
    );
    expect(result).toEqual({
      ok: true,
      entries: [],
      reachedEnd: true,
      seen: 0,
    });
  });

  it("asks you to sign in when only bookmarks are on", async () => {
    const result = await readBlueskyLists(
      { knownIds: [], listKinds: ["saved"] },
      {
        liked: async () => ({ ok: true, entries: [], reachedEnd: true }),
        saved: async () => ({ ok: false, reason: "auth_required" }),
      },
    );
    expect(result).toEqual({ ok: false, reason: "auth_required" });
  });

  it("prefixes the cursor with its list and resumes there", async () => {
    const calls: Array<[string, string | undefined]> = [];
    const readers = {
      liked: async (args: { resumeCursor?: string }) => {
        calls.push(["liked", args.resumeCursor]);
        return { ok: true as const, entries: [], reachedEnd: true };
      },
      saved: async (args: { resumeCursor?: string }) => {
        calls.push(["saved", args.resumeCursor]);
        return {
          ok: true as const,
          entries: [entry("b", "saved")],
          reachedEnd: false,
          resumeCursor: "next",
        };
      },
    };
    const first = await readBlueskyLists(
      { knownIds: [], listKinds: ["saved", "liked"] },
      readers,
    );
    expect(first.ok && first.resumeCursor).toBe("saved:next");
    await readBlueskyLists(
      {
        knownIds: [],
        listKinds: ["saved", "liked"],
        resumeCursor: "saved:next",
      },
      readers,
    );
    expect(calls).toEqual([
      ["liked", undefined],
      ["saved", undefined],
      ["saved", "next"],
    ]);
  });

  it("treats an unprefixed cursor as a likes cursor", async () => {
    const calls: Array<[string, string | undefined]> = [];
    await readBlueskyLists(
      { knownIds: [], listKinds: ["saved", "liked"], resumeCursor: "old" },
      {
        liked: async (args) => {
          calls.push(["liked", args.resumeCursor]);
          return { ok: true, entries: [], reachedEnd: true };
        },
        saved: async (args) => {
          calls.push(["saved", args.resumeCursor]);
          return { ok: true, entries: [], reachedEnd: true };
        },
      },
    );
    expect(calls).toEqual([
      ["liked", "old"],
      ["saved", undefined],
    ]);
  });
});
