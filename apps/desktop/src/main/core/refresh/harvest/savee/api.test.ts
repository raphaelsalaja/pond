import type { JsonValue } from "@pond/schema/json";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { readSaveeCapture, readSaveeItems } from "./api";
import type { SaveePost } from "./api";

const post = vi.fn<SaveePost>();

function json(body: JsonValue, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function item(shortID: string, createdAt: string) {
  return {
    shortID,
    createdAt,
    name: `item ${shortID}`,
    asset: {
      type: "image",
      image: { original: `https://dm.savee-cdn.com/${shortID}.avif` },
    },
  };
}

const VIEWER = { data: { auth: { user: { _id: "u1", username: "me" } } } };

function page(items: Array<JsonValue>, nextCursor: string | null) {
  return {
    data: {
      userByUsername: {
        items: { items, pageInfo: { nextCursor, isLimited: false } },
      },
    },
  };
}

const GraphqlCallSchema = z.looseObject({
  query: z.string(),
  variables: z.looseObject({
    username: z.string().optional(),
    cursor: z.string().optional(),
    shortID: z.string().optional(),
  }),
});

type GraphqlCall = z.infer<typeof GraphqlCallSchema>;

function call(body: string): GraphqlCall {
  return GraphqlCallSchema.parse(JSON.parse(body));
}

function serve(pages: Record<string, JsonValue>, viewer: JsonValue = VIEWER) {
  post.mockImplementation(async (body) => {
    const { query, variables } = call(body);
    if (query.startsWith("query PondViewer")) {
      return json(viewer);
    }
    if (query.startsWith("query PondUserItems")) {
      const cursor = variables.cursor ?? "first";
      return json(pages[cursor] ?? page([], null));
    }
    return json({ errors: [{ message: "unknown query" }] }, 400);
  });
}

beforeEach(() => {
  post.mockReset();
});

describe("readSaveeItems", () => {
  it("joins pages by nextCursor for the signed-in username", async () => {
    serve({
      first: page(
        [
          item("c", "2026-10-26T10:00:00.000Z"),
          item("b", "2026-10-25T10:00:00.000Z"),
        ],
        "cur1",
      ),
      cur1: page([item("a", "2026-10-24T10:00:00.000Z")], null),
    });
    const result = await readSaveeItems({ knownIds: [] }, post);
    expect(result).toMatchObject({ ok: true, reachedEnd: true });
    expect(result.ok && result.entries.map((e) => e.sourceId)).toEqual([
      "c",
      "b",
      "a",
    ]);
    const usernames = post.mock.calls
      .map(([body]) => call(body))
      .filter((c) => c.query.startsWith("query PondUserItems"))
      .map((c) => c.variables.username);
    expect(usernames).toEqual(["me", "me"]);
  });

  it("stops after two pages of items it already has", async () => {
    serve({
      first: page([item("c", "2026-10-26T10:00:00.000Z")], "cur1"),
      cur1: page([item("b", "2026-10-25T10:00:00.000Z")], "cur2"),
      cur2: page([item("a", "2026-10-24T10:00:00.000Z")], null),
    });
    const result = await readSaveeItems({ knownIds: ["c", "b"] }, post);
    expect(result.ok && result.entries.map((e) => e.sourceId)).toEqual([
      "c",
      "b",
    ]);
  });

  it("stops at the first item saved before the since limit", async () => {
    serve({
      first: page(
        [
          item("c", "2026-10-26T10:00:00.000Z"),
          item("b", "2026-10-20T10:00:00.000Z"),
        ],
        "cur1",
      ),
    });
    const result = await readSaveeItems(
      { knownIds: [], savedSince: "2026-10-25T00:00:00.000Z" },
      post,
    );
    expect(result.ok && result.entries.map((e) => e.sourceId)).toEqual(["c"]);
  });

  it("maps an unauthenticated session to auth_required", async () => {
    serve(
      {},
      {
        data: null,
        errors: [
          { message: "not signed in", extensions: { code: "UNAUTHENTICATED" } },
        ],
      },
    );
    expect(await readSaveeItems({ knownIds: [] }, post)).toEqual({
      ok: false,
      reason: "auth_required",
    });
  });

  it("maps a missing viewer to auth_required", async () => {
    serve({}, { data: { auth: null } });
    expect(await readSaveeItems({ knownIds: [] }, post)).toEqual({
      ok: false,
      reason: "auth_required",
    });
  });

  it("maps a 429 to rate_limited", async () => {
    post.mockImplementation(
      async () => new Response("slow down", { status: 429 }),
    );
    expect(await readSaveeItems({ knownIds: [] }, post)).toEqual({
      ok: false,
      reason: "rate_limited",
    });
  });
});

describe("readSaveeCapture", () => {
  it("builds a capture from the item query", async () => {
    post.mockImplementation(async (body) => {
      const { query, variables } = call(body);
      if (
        query.startsWith("query PondItem") &&
        variables.shortID === "h4W8146"
      ) {
        return json({
          data: { itemByShortID: item("h4W8146", "2026-10-26T10:00:00.000Z") },
        });
      }
      return json({ errors: [{ message: "unknown query" }] }, 400);
    });
    const result = await readSaveeCapture("h4W8146", post);
    expect(result.ok && result.capture).toMatchObject({
      id: "h4W8146",
      source: "savee",
      url: "https://savee.com/i/h4W8146/",
      title: "item h4W8146",
    });
  });

  it("reports an item that is gone", async () => {
    post.mockImplementation(async () =>
      json({ data: { itemByShortID: null } }),
    );
    expect(await readSaveeCapture("gone", post)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});
