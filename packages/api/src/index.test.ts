import type { JsonValue } from "@pond/schema/json";
import { describe, expect, it, vi } from "vitest";
import {
  type ApiSave,
  hostToSource,
  PondApi,
  PondApiError,
  SOURCES,
  sourceLabel,
} from "./index";

const SAVE: ApiSave = {
  id: "save-1",
  libraryId: "lib-1",
  source: "x",
  url: "https://x.com/pond/status/1",
  title: "Pond",
  description: null,
  author: "pond",
  siteName: "X",
  tags: ["design"],
  folderIds: [],
  note: null,
  rating: null,
  favorite: true,
  kind: "image",
  status: "complete",
  savedAt: 1_700_000_000_000,
  publishedAt: null,
  deletedAt: null,
  media: { files: 1, width: 1200, height: 800, duration: null, bytes: 2048 },
  thumbnail: true,
  text: { caption: false, ocr: true, transcript: false },
};

function recorder(body: JsonValue) {
  const calls: { url: string; init: RequestInit }[] = [];
  const client = new PondApi({
    token: "secret",
    fetch: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return response({ status: "success", data: body });
    },
  });
  return { calls, client };
}

function response(body: JsonValue, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("PondApi", () => {
  it("rejects non-loopback endpoints by default", () => {
    expect(
      () => new PondApi({ baseUrl: "https://example.com/api/v2" }),
    ).toThrow("loopback");
  });

  it("authenticates and validates successful responses", async () => {
    const fetcher = vi.fn(async () =>
      response({
        status: "success",
        data: {
          name: "pond",
          version: "1.2.3",
          platform: "darwin",
          arch: "arm64",
        },
      }),
    );
    const client = new PondApi({
      token: async () => "secret",
      fetch: fetcher,
    });
    await expect(client.appInfo()).resolves.toMatchObject({ version: "1.2.3" });
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:41610/api/v2/app/info",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer secret",
        }),
      }),
    );
  });

  it("returns thumbnail bytes with their image type", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { "content-type": "image/png" },
        }),
    );
    const client = new PondApi({ token: "secret", fetch: fetcher });
    await expect(client.thumbnail("save 1")).resolves.toEqual({
      type: "image/png",
      bytes: new Uint8Array([137, 80, 78, 71]),
      etag: null,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:41610/api/v2/saves/thumb?id=save+1&size=original",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer secret" }),
      }),
    );
  });

  it("asks for a sized thumbnail and returns its ETag", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(new Uint8Array([1]), {
          headers: { "content-type": "image/webp", etag: '"abc"' },
        }),
    );
    const client = new PondApi({ fetch: fetcher });
    await expect(client.thumbnail("save", "small")).resolves.toMatchObject({
      type: "image/webp",
      etag: '"abc"',
    });
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:41610/api/v2/saves/thumb?id=save&size=small",
      expect.anything(),
    );
  });

  it("returns no thumbnail for the no_thumbnail code", async () => {
    const client = new PondApi({
      fetch: async () =>
        response(
          {
            status: "error",
            error: { code: "no_thumbnail", message: "No image." },
          },
          404,
        ),
    });
    await expect(client.thumbnail("save")).resolves.toBeNull();
  });

  it("still throws when the Save itself is missing", async () => {
    const client = new PondApi({
      fetch: async () =>
        response(
          {
            status: "error",
            error: { code: "save_not_found", message: "No Save has the id x." },
          },
          404,
        ),
    });
    await expect(client.thumbnail("x")).rejects.toMatchObject({
      kind: "not-found",
      code: "save_not_found",
    });
  });

  it("returns no thumbnail when the Save has no cover", async () => {
    const client = new PondApi({
      fetch: async () => response({ status: "error", error: "no cover" }, 404),
    });
    await expect(client.thumbnail("save")).resolves.toBeNull();
  });

  it("rejects thumbnail requests with a stale token", async () => {
    const client = new PondApi({
      fetch: async () =>
        response({ status: "error", error: "unauthorized" }, 401),
    });
    await expect(client.thumbnail("save")).rejects.toMatchObject({
      kind: "authentication",
    });
  });

  it("reads the stable code and message from error bodies", async () => {
    const client = new PondApi({
      fetch: async () =>
        response(
          {
            status: "error",
            error: {
              code: "stale_cursor",
              message: "The sort order changed. Run the search again.",
            },
          },
          409,
        ),
    });
    await expect(client.saves({})).rejects.toMatchObject({
      kind: "conflict",
      code: "stale_cursor",
      status: 409,
      message: "The sort order changed. Run the search again.",
    });
  });

  it("reports rejected requests as invalid rather than conflicts", async () => {
    const client = new PondApi({
      fetch: async () =>
        response(
          {
            status: "error",
            error: { code: "invalid_request", message: "limit: Too big" },
          },
          422,
        ),
    });
    await expect(client.saves({ limit: 9000 })).rejects.toMatchObject({
      kind: "invalid",
      code: "invalid_request",
    });
  });

  it("maps API failures to typed errors", async () => {
    const client = new PondApi({
      fetch: async () =>
        response({ status: "error", error: "unauthorized" }, 401),
    });
    await expect(client.appInfo()).rejects.toBeInstanceOf(PondApiError);
    await expect(client.appInfo()).rejects.toMatchObject({
      kind: "authentication",
      status: 401,
    });
  });

  it("returns hydrated saves from a query that includes them", async () => {
    const { calls, client } = recorder({
      ids: ["save-1"],
      saves: [SAVE],
      total: 1,
      nextCursor: null,
      libraryId: "lib-1",
      revision: 3,
    });
    const page = await client.query({
      query: { combinator: "and", rules: [] },
      keywords: "pond",
      include: ["saves"],
    });
    expect(page.saves?.[0]).toEqual(SAVE);
    expect(calls[0]?.url).toBe("http://127.0.0.1:41610/api/v2/library/query");
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      include: ["saves"],
    });
  });

  it("reads a Save from a Pond without favorites as not favorite", async () => {
    const older = Object.fromEntries(
      Object.entries(SAVE).filter(([key]) => key !== "favorite"),
    );
    const { client } = recorder({
      ids: ["save-1"],
      saves: [older],
      total: 1,
      nextCursor: null,
      libraryId: "lib-1",
      revision: 3,
    });
    const page = await client.query({
      query: { combinator: "and", rules: [] },
      include: ["saves"],
    });
    expect(page.saves?.[0]).toEqual({ ...SAVE, favorite: false });
  });

  it("rejects saves that miss the public shape", async () => {
    const { client } = recorder([{ id: "save-1", savedAt: "yesterday" }]);
    await expect(client.saves({})).rejects.toMatchObject({ kind: "response" });
  });

  it("encodes read parameters into the URL", async () => {
    const { calls, client } = recorder([]);
    await client.related("save 1", 5);
    await client.status(["a", "b"]);
    expect(calls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:41610/api/v2/saves/related?id=save+1&limit=5",
      "http://127.0.0.1:41610/api/v2/saves/status?ids=a%2Cb",
    ]);
  });

  it("posts writes with their documented bodies", async () => {
    const { calls, client } = recorder({ changed: 1 });
    await client.editTags({ ids: ["a"], add: ["design"] });
    await client.editFolders({ ids: ["a"], remove: ["f"] });
    await client.trash(["a"]);
    await client.restore(["a"]);
    await client.setNote("a", null);
    await expect(client.setRating(["a"], 4)).resolves.toEqual({ changed: 1 });
    await client.setFavorite(["a"], true);
    expect(
      calls.map((call) => [
        call.url.replace("http://127.0.0.1:41610/api/v2", ""),
        call.init.method,
        JSON.parse(String(call.init.body)),
      ]),
    ).toEqual([
      ["/saves/tags", "POST", { ids: ["a"], add: ["design"] }],
      ["/saves/folders", "POST", { ids: ["a"], remove: ["f"] }],
      ["/saves/trash", "POST", { ids: ["a"] }],
      ["/saves/restore", "POST", { ids: ["a"] }],
      ["/saves/note", "POST", { id: "a", note: null }],
      ["/saves/rating", "POST", { ids: ["a"], rating: 4 }],
      ["/saves/favorite", "POST", { ids: ["a"], favorite: true }],
    ]);
  });

  it("pins writes to the library they were read from", async () => {
    const { calls, client } = recorder({ changed: 1 });
    await client.trash(["a"], "lib");
    await client.restore(["a"], "lib");
    await client.setNote("a", "hi", "lib");
    await client.setRating(["a"], 2, "lib");
    await client.setFavorite(["a"], false, "lib");
    expect(
      calls.map((call) => JSON.parse(String(call.init.body)).libraryId),
    ).toEqual(["lib", "lib", "lib", "lib", "lib"]);
  });

  it("reads Library lists", async () => {
    const { calls, client } = recorder([
      { name: "design", count: 2, starred: true },
    ]);
    await expect(client.tags()).resolves.toEqual([
      { name: "design", count: 2, starred: true },
    ]);
    expect(calls[0]?.url).toBe("http://127.0.0.1:41610/api/v2/library/tags");
  });

  it("returns file bytes with their type", async () => {
    const client = new PondApi({
      fetch: async () =>
        new Response(new Uint8Array([7, 8]), {
          headers: { "content-type": "video/mp4" },
        }),
    });
    await expect(client.file("save", 1)).resolves.toEqual({
      type: "video/mp4",
      bytes: new Uint8Array([7, 8]),
      etag: null,
    });
  });
});

describe("sources", () => {
  it("labels source ids and recognizes their hosts", () => {
    expect(SOURCES).toContain("twitter");
    expect(sourceLabel("arena")).toBe("Are.na");
    expect(hostToSource("https://www.youtube.com/watch?v=1")).toBe("youtube");
    expect(hostToSource("https://example.com")).toBeNull();
  });
});
