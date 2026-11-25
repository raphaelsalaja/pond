import {
  buildWhere,
  colorNear,
  matches,
  queryIsFullySqlSupported,
} from "@pond/schema/filters";
import type { Query, SaveLike } from "@pond/schema/filters";
import Database from "better-sqlite3";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { compileKeywordWhere } from "./keyword-query";

function nativeSqliteAvailable(): boolean {
  try {
    new Database(":memory:").close();
    return true;
  } catch (error) {
    if (process.versions.electron) throw error;
    return false;
  }
}

const examples: Array<SaveLike> = [
  {
    id: "cat",
    source: "local",
    url: "",
    title: "Black cat food",
    tags: ["Design", "blue"],
    folderIds: ["FolderA"],
    width: 2100,
    height: 900,
    sensitiveScore: 0.91,
    dominantColors: ["#0000ff"],
  },
  {
    id: "dog",
    source: "local",
    url: "",
    title: "Black dog store",
    tags: ["design", "blue", "extra"],
    folderIds: ["FolderA", "FolderB"],
    width: 1600,
    height: 900,
    sensitiveScore: 0.55,
    favorite: true,
  },
  {
    id: "none",
    source: "local",
    url: "",
    title: null,
    tags: [],
    folderIds: [],
    width: null,
    height: null,
  },
];

const webExamples: Array<SaveLike> = [
  {
    id: "shop",
    source: "web",
    url: "https://example.com/records/kind-of-blue",
    title: "Kind of Blue",
    tags: [],
    folderIds: [],
    mediaType: "link",
    rawJson: {
      capture: {
        id: "shop",
        source: "web",
        url: "https://example.com/records/kind-of-blue",
        media: [],
        extras: { product: true },
      },
      extractorId: "web-page",
      extractedAt: "2026-10-27T00:00:00.000Z",
    },
  },
  {
    id: "site",
    source: "web",
    url: "https://example.com",
    title: "Example",
    tags: [],
    folderIds: [],
    mediaType: "link",
  },
];

function splitExample(
  id: string,
  sourceId: string,
  media: Array<number>,
): SaveLike {
  return {
    id,
    source: "instagram",
    url: "",
    tags: [],
    folderIds: [],
    rawJson: {
      capture: { id, source: "instagram", url: "", media: [] },
      extractorId: "instagram",
      extractedAt: "2026-10-27T00:00:00.000Z",
      split: { sourceId, media },
    },
  };
}

/** The in-memory engine's answer, which the SQL compiler must agree with. */
function matchingIds(query: Query, rows: Array<SaveLike>): Array<string> {
  const ids: Array<string> = [];
  for (const save of rows) {
    if (matches(query, save)) {
      ids.push(save.id);
    }
  }
  return ids;
}

function fixture(rows: Array<SaveLike> = examples) {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE saves (id TEXT, title TEXT, tags TEXT, width INTEGER, height INTEGER, dominant_colors TEXT, sensitive_score REAL, files TEXT, source TEXT, media_type TEXT, raw_json TEXT, raw_slim TEXT, favorite INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE folders (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE folder_metadata (folder_id TEXT PRIMARY KEY, description TEXT);
    CREATE TABLE save_folders (save_id TEXT, folder_id TEXT);
    CREATE VIRTUAL TABLE saves_fts USING fts5(id UNINDEXED, title);`);
  db.function("pond_color_near", (palette, hex, tolerance) =>
    Number(
      colorNear(
        z.string().parse(hex),
        z.array(z.string()).parse(JSON.parse(z.string().parse(palette))),
        z.number().parse(tolerance),
      ),
    ),
  );
  db.prepare("INSERT INTO folders VALUES (?, ?)").run("FolderA", "Folder A");
  db.prepare("INSERT INTO folders VALUES (?, ?)").run("FolderB", "Folder B");
  for (const save of rows) {
    db.prepare(
      "INSERT INTO saves VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      save.id,
      save.title,
      JSON.stringify(save.tags),
      save.width ?? null,
      save.height ?? null,
      JSON.stringify(save.dominantColors ?? []),
      save.sensitiveScore ?? null,
      "[]",
      save.source,
      save.mediaType ?? null,
      save.rawJson ? JSON.stringify(save.rawJson) : null,
      save.rawJson ? JSON.stringify(save.rawJson) : null,
      save.favorite ? 1 : 0,
    );
    db.prepare("INSERT INTO saves_fts VALUES (?, ?)").run(save.id, save.title);
    for (const folder of save.folderIds ?? []) {
      db.prepare("INSERT INTO save_folders VALUES (?, ?)").run(save.id, folder);
    }
  }
  return db;
}

describe.skipIf(!nativeSqliteAvailable())("filter engine parity", () => {
  const queries: Array<Query> = [
    {
      combinator: "and",
      not: true,
      rules: [{ field: "title", operator: "contains", value: "cat" }],
    },
    {
      combinator: "or",
      not: true,
      rules: [
        { field: "title", operator: "contains", value: "cat" },
        {
          combinator: "and",
          not: true,
          rules: [
            {
              field: "tags",
              operator: "exact",
              value: ["DESIGN", "blue", "blue"],
            },
          ],
        },
      ],
    },
    { combinator: "and", not: true, rules: [] },
    {
      combinator: "and",
      rules: [
        { field: "title", operator: "contains", value: "cat", negate: true },
      ],
    },
    {
      combinator: "and",
      rules: [
        { field: "tags", operator: "exact", value: ["Design", "blue", "blue"] },
      ],
    },
    {
      combinator: "and",
      rules: [{ field: "folder", operator: "exact", value: ["foldera"] }],
    },
    {
      combinator: "and",
      rules: [{ field: "folder", operator: "none", value: ["foldera"] }],
    },
    {
      combinator: "and",
      rules: [{ field: "folder", operator: "exact", value: [] }],
    },
    {
      combinator: "and",
      rules: [{ field: "aspect", operator: "eq", value: "21:9" }],
    },
    {
      combinator: "and",
      rules: [{ field: "aspect", operator: "nin", value: ["21:9", "16:9"] }],
    },
    {
      combinator: "and",
      rules: [
        {
          field: "color",
          operator: "near",
          value: { hex: "#0000ff", tolerance: 20 },
        },
      ],
    },
    {
      combinator: "and",
      rules: [
        {
          field: "sensitiveContent",
          operator: "eq",
          value: "likely-sensitive",
        },
      ],
    },
    {
      combinator: "and",
      rules: [
        {
          field: "sensitiveContent",
          operator: "eq",
          value: "not-checked",
        },
      ],
    },
    {
      combinator: "and",
      rules: [{ field: "favorite", operator: "eq", value: true }],
    },
    {
      combinator: "and",
      rules: [{ field: "favorite", operator: "eq", value: false }],
    },
  ];

  it.each(queries)("agrees with in-memory evaluation for %j", (query) => {
    const db = fixture();
    try {
      const where = buildWhere(query);
      if (!where) throw new Error("Expected a filter predicate");
      const compiled = new SQLiteSyncDialect().sqlToQuery(where);
      const rows = z
        .array(z.object({ id: z.string() }))
        .parse(
          db
            .prepare(`SELECT id FROM saves WHERE ${compiled.sql} ORDER BY id`)
            .all(...compiled.params),
        );
      expect(rows.map((row) => row.id)).toEqual(
        matchingIds(query, examples).sort(),
      );
      expect(queryIsFullySqlSupported(query)).toBe(true);
    } finally {
      db.close();
    }
  });

  it.each([
    ["product", "shop"],
    ["link", "site"],
  ])("agrees with in-memory evaluation for the %s type", (type, expected) => {
    const rows = [...examples, ...webExamples];
    const query: Query = {
      combinator: "and",
      rules: [{ field: "type", operator: "eq", value: type }],
    };
    const db = fixture(rows);
    try {
      const where = buildWhere(query);
      if (!where) {
        throw new Error("Expected a filter predicate");
      }
      const compiled = new SQLiteSyncDialect().sqlToQuery(where);
      const found = z
        .array(z.object({ id: z.string() }))
        .parse(
          db
            .prepare(`SELECT id FROM saves WHERE ${compiled.sql} ORDER BY id`)
            .all(...compiled.params),
        );
      expect(found.map((row) => row.id)).toEqual([expected]);
      expect(matchingIds(query, rows)).toEqual([expected]);
    } finally {
      db.close();
    }
  });

  it.each<["eq" | "neq", string, Array<string>]>([
    ["eq", "instagram:DAbC", ["post-a", "post-b"]],
    ["eq", "instagram:dAbC", []],
    ["eq", "x:DAbC", []],
    ["neq", "instagram:DAbC", ["cat", "dog", "none", "other"]],
  ])(
    "matches split post %s %s exactly in SQL and memory",
    (operator, value, ids) => {
      const rows = [
        ...examples,
        splitExample("post-a", "DAbC", [0]),
        splitExample("post-b", "DAbC", [1]),
        splitExample("other", "dabc", [0]),
      ];
      const query: Query = {
        combinator: "and",
        rules: [{ field: "post", operator, value }],
      };
      const db = fixture(rows);
      try {
        const where = buildWhere(query);
        if (!where) throw new Error("Expected a filter predicate");
        const compiled = new SQLiteSyncDialect().sqlToQuery(where);
        const found = z
          .array(z.object({ id: z.string() }))
          .parse(
            db
              .prepare(`SELECT id FROM saves WHERE ${compiled.sql} ORDER BY id`)
              .all(...compiled.params),
          );
        expect(found.map((row) => row.id)).toEqual(ids);
        expect(
          rows
            .flatMap((save) => (matches(query, save) ? [save.id] : []))
            .sort(),
        ).toEqual(ids);
        expect(queryIsFullySqlSupported(query)).toBe(true);
      } finally {
        db.close();
      }
    },
  );

  it("evaluates keyword precedence, phrases and complements on the real index", () => {
    const db = fixture();
    try {
      for (const [query, ids] of [
        ["(cat OR dog) black -store", ["cat"]],
        ['"cat food"', ["cat"]],
        ["-cat", ["dog", "none"]],
        ["cat OR -store", ["cat", "none"]],
      ] satisfies Array<[string, Array<string>]>) {
        const where = compileKeywordWhere(query);
        if (!where) throw new Error("Expected a keyword predicate");
        const compiled = new SQLiteSyncDialect().sqlToQuery(where);
        const rows = z
          .array(z.object({ id: z.string() }))
          .parse(
            db
              .prepare(`SELECT id FROM saves WHERE ${compiled.sql} ORDER BY id`)
              .all(...compiled.params),
          );
        expect(rows.map((row) => row.id)).toEqual(ids);
      }
    } finally {
      db.close();
    }
  });
});

it("never drops invalid conditions from Boolean groups", () => {
  const query: Query = {
    combinator: "or",
    rules: [
      { field: "title", operator: "contains", value: "cat" },
      { field: "title", operator: "near", value: "bad" },
    ],
  };
  expect(() => buildWhere(query)).toThrow("Unsupported filter");
  expect(queryIsFullySqlSupported(query)).toBe(false);
});
