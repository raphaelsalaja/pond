import type { JsonValue } from "@pond/schema/json";
import { afterEach, describe, expect, it } from "vitest";
import { readTumblrCapture, readTumblrLikes } from "./api";
import type { TumblrGet } from "./api";

const missing: TumblrGet = async () => new Response("missing", { status: 404 });

let respond: TumblrGet = missing;
const calls: Array<Parameters<TumblrGet>> = [];

const get: TumblrGet = async (url, headers) => {
  calls.push([url, headers]);
  return respond(url, headers);
};

const HOME = `<html><script type="application/json" id="___INITIAL_STATE___">${JSON.stringify(
  { apiFetchStore: { API_TOKEN: "tok" } },
)}</script></html>`;

function json(body: JsonValue, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function post(id: string, likedTimestamp: number) {
  return {
    idString: id,
    blogName: "pascalcampion",
    likedTimestamp,
    content: [{ type: "text", text: `post ${id}` }],
    trail: [],
  };
}

function serve(pages: Record<string, JsonValue>, status = 200) {
  respond = async (raw) => {
    const url = new URL(raw);
    if (url.pathname === "/") {
      return new Response(HOME);
    }
    if (url.pathname === "/api/v2/user/info") {
      return json(
        {
          response: {
            user: {
              name: "pc",
              blogs: [{ name: "pascalcampion", primary: true }],
            },
          },
        },
        status,
      );
    }
    if (url.pathname === "/api/v2/user/likes") {
      const before = url.searchParams.get("before") ?? "first";
      return json(pages[before] ?? { response: { likedPosts: [] } });
    }
    return new Response("missing", { status: 404 });
  };
}

afterEach(() => {
  respond = missing;
  calls.length = 0;
});

describe("readTumblrLikes", () => {
  it("walks pages by the before cursor and sends the bearer", async () => {
    serve({
      first: {
        response: {
          likedPosts: [post("3", 300), post("2", 200)],
          links: { next: { queryParams: { before: "200" } } },
        },
      },
      "200": { response: { likedPosts: [post("1", 100)] } },
    });
    const result = await readTumblrLikes({ knownIds: [] }, get);
    expect(result).toMatchObject({ ok: true, reachedEnd: true });
    expect(result.ok && result.entries.map((e) => e.sourceId)).toEqual([
      "3",
      "2",
      "1",
    ]);
    const likesCall = calls.find(([u]) => u.includes("/user/likes"));
    expect(likesCall?.[1].authorization).toBe("Bearer tok");
  });

  it("stops after two pages of posts it already has", async () => {
    serve({
      first: {
        response: {
          likedPosts: [post("3", 300)],
          links: { next: { queryParams: { before: "300" } } },
        },
      },
      "300": {
        response: {
          likedPosts: [post("2", 200)],
          links: { next: { queryParams: { before: "200" } } },
        },
      },
      "200": {
        response: {
          likedPosts: [post("1", 100)],
          links: { next: { queryParams: { before: "100" } } },
        },
      },
    });
    const result = await readTumblrLikes({ knownIds: ["3", "2"] }, get);
    expect(result.ok && result.entries.map((e) => e.sourceId)).toEqual([
      "3",
      "2",
    ]);
  });

  it("stops at the first like older than the since limit", async () => {
    serve({
      first: {
        response: {
          likedPosts: [post("3", 300), post("2", 200)],
          links: { next: { queryParams: { before: "200" } } },
        },
      },
    });
    const result = await readTumblrLikes(
      { knownIds: [], savedSince: new Date(250_000).toISOString() },
      get,
    );
    expect(result.ok && result.entries.map((e) => e.sourceId)).toEqual(["3"]);
  });

  it("starts from a resume cursor", async () => {
    serve({ "200": { response: { likedPosts: [post("1", 100)] } } });
    const result = await readTumblrLikes(
      { knownIds: [], resumeCursor: "200" },
      get,
    );
    expect(result.ok && result.entries.map((e) => e.sourceId)).toEqual(["1"]);
  });

  it("reports a signed-out session", async () => {
    serve({}, 401);
    expect(await readTumblrLikes({ knownIds: [] }, get)).toEqual({
      ok: false,
      reason: "auth_required",
    });
  });
});

describe("readTumblrCapture", () => {
  it("reads the permalink timeline for the blog in the URL", async () => {
    respond = async (raw) => {
      const url = new URL(raw);
      if (url.pathname === "/") {
        return new Response(HOME);
      }
      if (url.pathname === "/api/v2/blog/pascalcampion/posts/1/permalink") {
        return json({
          response: { timeline: { elements: [post("1", 100)] } },
        });
      }
      return new Response("missing", { status: 404 });
    };
    const result = await readTumblrCapture(
      "1",
      "https://pascalcampion.tumblr.com/post/1/slug",
      get,
    );
    expect(result.ok && result.capture.url).toBe(
      "https://www.tumblr.com/pascalcampion/1",
    );
  });

  it("reports a post that is gone", async () => {
    respond = async (raw) =>
      new URL(raw).pathname === "/"
        ? new Response(HOME)
        : new Response("missing", { status: 404 });
    expect(
      await readTumblrCapture(
        "1",
        "https://www.tumblr.com/pascalcampion/1",
        get,
      ),
    ).toEqual({ ok: false, reason: "not_found" });
  });
});
