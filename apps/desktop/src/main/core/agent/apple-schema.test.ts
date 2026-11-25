import { describe, expect, it } from "vitest";
import { z } from "zod";
import { replySchemaFor, toAppleSchema } from "./apple-schema";

describe("toAppleSchema", () => {
  it("maps objects, required fields, enums, arrays, and numbers", () => {
    const json = z.toJSONSchema(
      z.object({
        query: z.string().describe("What to look for"),
        kind: z.enum(["image", "video"]).optional(),
        limit: z.number().int().max(50).optional(),
        tags: z.array(z.string()).max(5).optional(),
        exact: z.boolean().optional(),
      }),
    );
    expect(toAppleSchema(json, "Search")).toEqual({
      kind: "object",
      name: "Search",
      properties: [
        {
          name: "query",
          description: "What to look for",
          optional: false,
          schema: { kind: "string" },
        },
        {
          name: "kind",
          optional: true,
          schema: {
            kind: "choice",
            name: "Search_kind",
            choices: ["image", "video"],
          },
        },
        { name: "limit", optional: true, schema: { kind: "integer" } },
        {
          name: "tags",
          optional: true,
          schema: { kind: "array", items: { kind: "string" }, max: 5 },
        },
        { name: "exact", optional: true, schema: { kind: "boolean" } },
      ],
    });
  });

  it("unwraps nullable unions and falls back to string for the rest", () => {
    const json = {
      type: "object",
      properties: {
        note: { anyOf: [{ type: "string" }, { type: "null" }] },
        value: { anyOf: [{ type: "string" }, { type: "number" }] },
        any: {},
      },
      required: ["note"],
    };
    const tree = toAppleSchema(json, "T");
    expect(tree.kind === "object" && tree.properties).toEqual([
      { name: "note", optional: true, schema: { kind: "string" } },
      { name: "value", optional: true, schema: { kind: "string" } },
      { name: "any", optional: true, schema: { kind: "string" } },
    ]);
  });

  it("names nested objects by path so names stay unique", () => {
    const json = z.toJSONSchema(
      z.object({ scope: z.object({ folderId: z.string() }) }),
    );
    const tree = toAppleSchema(json, "Search");
    expect(tree.kind === "object" && tree.properties[0]?.schema).toMatchObject({
      kind: "object",
      name: "Search_scope",
    });
  });

  it("stops at depth 6", () => {
    let schema: z.ZodType = z.string();
    for (let i = 0; i < 8; i++) schema = z.object({ next: schema });
    expect(
      JSON.stringify(toAppleSchema(z.toJSONSchema(schema), "Deep")),
    ).not.toContain("Deep_next_next_next_next_next_next_next");
  });
});

describe("replySchemaFor", () => {
  it("offers text plus one optional call over the given tools", () => {
    const reply = replySchemaFor([
      {
        name: "searchLibrary",
        description: "Search",
        inputSchema: z.toJSONSchema(z.object({ query: z.string() })),
      },
    ]);
    expect(reply).toMatchObject({
      kind: "object",
      name: "Reply",
      properties: [
        { name: "text", optional: false, schema: { kind: "string" } },
        {
          name: "call",
          optional: true,
          schema: {
            kind: "anyOf",
            name: "Call",
            variants: [
              {
                kind: "object",
                name: "Call_searchLibrary",
                description: "Search",
                properties: [
                  {
                    name: "tool",
                    optional: false,
                    schema: { kind: "choice", choices: ["searchLibrary"] },
                  },
                  {
                    name: "arguments",
                    optional: false,
                    schema: { kind: "object", name: "Args_searchLibrary" },
                  },
                ],
              },
            ],
          },
        },
      ],
    });
  });

  it("omits call when there are no tools", () => {
    const reply = replySchemaFor([]);
    expect(
      reply.kind === "object" && reply.properties.map((p) => p.name),
    ).toEqual(["text"]);
  });
});
