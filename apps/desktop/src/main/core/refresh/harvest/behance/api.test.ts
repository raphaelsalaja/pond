import type { JsonValue } from "@pond/schema/json";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readBehanceAppreciations } from "./api";
import type { BehancePost } from "./api";

function json(body: JsonValue, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function at(text: string): string {
  return Buffer.from(text).toString("base64");
}

function edge(id: number, savedAt: string) {
  return {
    cursor: at(savedAt),
    node: { id, name: `project ${id}`, owners: [{ username: "o" }] },
  };
}

const VIEWER = { data: { viewer: { username: "me" } } };

function page(edges: Array<JsonValue>, endCursor: string | null) {
  return {
    data: {
      user: {
        appreciatedProjects: {
          pageInfo: { endCursor, hasNextPage: endCursor !== null },
          edges,
        },
      },
    },
  };
}

const GraphqlCallSchema = z.looseObject({
  query: z.string(),
  variables: z.looseObject({
    username: z.string().optional(),
    after: z.string().nullable().optional(),
  }),
});

type GraphqlCall = z.infer<typeof GraphqlCallSchema>;

function call(body: string): GraphqlCall {
  return GraphqlCallSchema.parse(JSON.parse(body));
}

function recording(respond: BehancePost) {
  const bodies: Array<string> = [];
  const post: BehancePost = async (body) => {
    bodies.push(body);
    return respond(body);
  };
  return { post, bodies };
}

function serve(pages: Record<string, JsonValue>, viewer: JsonValue = VIEWER) {
  return recording(async (body) => {
    const { query, variables } = call(body);
    if (query.startsWith("query PondViewer")) {
      return json(viewer);
    }
    if (query.startsWith("query PondAppreciated")) {
      return json(pages[variables.after ?? "first"] ?? page([], null));
    }
    return json({ errors: [{ message: "unknown query" }] }, 400);
  });
}

describe("readBehanceAppreciations", () => {
  it("walks pages by endCursor for the signed-in user", async () => {
    const { post, bodies } = serve({
      first: page(
        [edge(3, "2026-10-03 10:00:00"), edge(2, "2026-10-02 10:00:00")],
        "c2",
      ),
      c2: page([edge(1, "2026-10-01 10:00:00")], null),
    });
    const result = await readBehanceAppreciations({ knownIds: [] }, post);
    expect(result).toMatchObject({ ok: true, reachedEnd: true, seen: 3 });
    if (!result.ok) {
      throw new Error("expected ok");
    }
    expect(result.entries.map((e) => e.sourceId)).toEqual(["3", "2", "1"]);
    expect(result.entries[0]?.savedAt).toBe("2026-10-03T10:00:00.000Z");
    const walk = bodies.map((body) => call(body).variables);
    expect(walk.slice(1)).toEqual([
      { username: "me", after: null },
      { username: "me", after: "c2" },
    ]);
  });

  it("stops after two pages of known projects", async () => {
    const { post } = serve({
      first: page([edge(4, "2026-10-04 10:00:00")], "c2"),
      c2: page([edge(3, "2026-10-03 10:00:00")], "c3"),
      c3: page([edge(2, "2026-10-02 10:00:00")], "c4"),
    });
    const result = await readBehanceAppreciations(
      { knownIds: ["4", "3", "2"] },
      post,
    );
    expect(result).toMatchObject({ ok: true, reachedEnd: true, seen: 2 });
  });

  it("stops at the saved-since date", async () => {
    const { post, bodies } = serve({
      first: page(
        [edge(3, "2026-10-03 10:00:00"), edge(2, "2026-09-01 10:00:00")],
        "c2",
      ),
    });
    const result = await readBehanceAppreciations(
      { knownIds: [], savedSince: "2026-10-01T00:00:00.000Z" },
      post,
    );
    if (!result.ok) {
      throw new Error("expected ok");
    }
    expect(result.entries.map((e) => e.sourceId)).toEqual(["3"]);
    expect(bodies).toHaveLength(2);
  });

  it("resumes from a cursor", async () => {
    const { post } = serve({
      c9: page([edge(1, "2026-10-01 10:00:00")], null),
    });
    const result = await readBehanceAppreciations(
      { knownIds: [], resumeCursor: "c9" },
      post,
    );
    if (!result.ok) {
      throw new Error("expected ok");
    }
    expect(result.entries.map((e) => e.sourceId)).toEqual(["1"]);
  });

  it("maps a missing viewer to auth_required", async () => {
    const { post } = serve({}, { data: { viewer: null } });
    const result = await readBehanceAppreciations({ knownIds: [] }, post);
    expect(result).toEqual({ ok: false, reason: "auth_required" });
  });

  it("surfaces the Fastly challenge", async () => {
    const post: BehancePost = async () =>
      new Response(
        '<script>document.cookie = "js_challenge_value=ab; Path=/"; window.location.reload();</script>',
        { status: 403 },
      );
    const result = await readBehanceAppreciations({ knownIds: [] }, post);
    expect(result).toMatchObject({ ok: false, challenge: true });
  });

  it("keeps earlier pages and a resume cursor when a later page fails", async () => {
    const post: BehancePost = async (body) => {
      const { query, variables } = call(body);
      if (query.startsWith("query PondViewer")) {
        return json(VIEWER);
      }
      if (variables.after === "c2") {
        return json({}, 500);
      }
      return json(page([edge(2, "2026-10-02 10:00:00")], "c2"));
    };
    const result = await readBehanceAppreciations({ knownIds: [] }, post);
    expect(result).toMatchObject({
      ok: true,
      reachedEnd: false,
      resumeCursor: "c2",
      seen: 1,
    });
  });
});
