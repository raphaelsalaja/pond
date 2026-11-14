import type { JsonValue } from "@pond/schema/json";
import type { SQL } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  assistantProposalInput,
  assistantQuestion,
  assistantResultSet,
} from "../../../shared/assistant";
import { IPC } from "../../../shared/constants";
import {
  applyFilter as apply,
  applyFilterInput,
  citeSavesInput,
  describeSavesInput,
  grepLibrary as grep,
  grepLibraryInput,
  libraryOverviewInput,
  listFoldersInput,
  openSaveInput,
  setOverlay as overlay,
  readSave as read,
  readSaveInput,
  searchLibrary as search,
  searchLibraryInput,
  setOverlayInput,
  toolDependencies,
} from "./tools";

interface ToolTestState {
  admitted: Array<{ id: string }>;
}
const state: ToolTestState = { admitted: [] };
const mock = {
  ...state,
  where: vi.fn<(condition: SQL | undefined) => void>(),
  retrieve: vi
    .fn<typeof toolDependencies.retrieveLibrary>()
    .mockResolvedValue({ saves: [], hits: [] }),
  fts: vi.fn<typeof toolDependencies.grepRows>().mockResolvedValue([]),
  broadcast: vi.fn(),
};
const deps = {
  ...toolDependencies,
  retrieveLibrary: mock.retrieve,
  readRows: async (condition: SQL | undefined) => {
    mock.where(condition);
    return [];
  },
  grepRows: mock.fts,
  admittedIds: async (condition: SQL | undefined) => {
    mock.where(condition);
    return mock.admitted;
  },
  folderIdsForSave: async () => [],
};
const searchLibrary = (
  input: Parameters<typeof search>[0],
  scope: Parameters<typeof search>[1] = {},
) => search(input, scope, deps);
const readSave = (
  input: Parameters<typeof read>[0],
  scope: Parameters<typeof read>[1] = {},
) => read(input, scope, deps);
const grepLibrary = (
  input: Parameters<typeof grep>[0],
  scope: Parameters<typeof grep>[1] = {},
) => grep(input, scope, deps);
const applyFilter = (input: Parameters<typeof apply>[0]) =>
  apply(input, mock.broadcast);
const setOverlay = (input: Parameters<typeof overlay>[0]) =>
  overlay(input, mock.broadcast);
const dialect = new SQLiteSyncDialect();
const query = () => {
  const condition = mock.where.mock.calls[0]?.[0];
  if (!condition) throw new Error("Expected scoped query");
  return dialect.sqlToQuery(condition);
};
beforeEach(() => {
  vi.clearAllMocks();
  mock.admitted = [];
  mock.fts.mockResolvedValue([]);
});

describe("Assistant library boundaries", () => {
  it("bounds evidence candidates and preserves an explicit retrieval task", async () => {
    await searchLibrary(
      {
        query: "where is the URL parser?",
        task: "code",
        limit: 500,
      },
      { saveIds: ["attached"] },
    );
    expect(mock.retrieve).toHaveBeenCalledExactlyOnceWith(
      {
        query: "where is the URL parser?",
        task: "code",
        limit: 40,
      },
      { saveIds: ["attached"] },
    );
  });

  it("does not turn an empty attachment scope into unrestricted search", async () => {
    await searchLibrary({}, { saveIds: [] });
    expect(mock.retrieve).toHaveBeenCalledExactlyOnceWith({}, { saveIds: [] });
  });
  it("restricts guessed Save IDs to attached IDs and excludes Trash", async () => {
    expect(
      await readSave({ id: "guessed" }, { saveIds: ["attached"] }),
    ).toHaveProperty("error");
    expect(query().params).toEqual(["guessed", "attached"]);
    expect(query().sql).toContain('"saves"."deleted_at" is null');
    expect(query().sql).toContain('"saves"."id" in (?)');
  });
  it("keeps the selected folder constraint when the model requests another folder", async () => {
    await searchLibrary(
      { folderId: "model-folder" },
      { folderId: "selected-folder" },
    );
    expect(mock.retrieve).toHaveBeenCalledExactlyOnceWith(
      { folderId: "model-folder" },
      { folderId: "selected-folder" },
    );
  });
});

it("accepts media constraints separately from the lexical query", () => {
  expect(
    searchLibraryInput.parse({ query: "Kanye", media: ["image"] }),
  ).toEqual({ query: "Kanye", media: ["image"] });
});

it("accepts explicit evidence tasks while defaulting to ordinary search", () => {
  expect(searchLibraryInput.parse({ query: "ceramics" })).toEqual({
    query: "ceramics",
  });
  expect(
    searchLibraryInput.parse({ query: "parse a URL", task: "code" }),
  ).toEqual({ query: "parse a URL", task: "code" });
  expect(
    searchLibraryInput.parse({ query: "edited yesterday", task: "fact-check" }),
  ).toEqual({ query: "edited yesterday", task: "fact-check" });
});

it("accepts a visual probe on search input", () => {
  expect(
    searchLibraryInput.parse({
      visual: { kind: "saveId", id: "save" },
    }),
  ).toMatchObject({ visual: { kind: "saveId", id: "save" } });
});

it("reads favorite next to rating", async () => {
  const row: Awaited<ReturnType<typeof toolDependencies.readRows>>[number] = {
    id: "save",
    title: "Poster",
    url: "https://example.com",
    author: null,
    source: "local",
    description: null,
    notes: null,
    tags: [],
    caption: null,
    ocrText: null,
    transcript: null,
    rating: 3,
    favorite: true,
    mediaType: "image",
    width: null,
    height: null,
  };
  const result = await read(
    { id: "save" },
    {},
    {
      ...deps,
      readRows: async () => [row],
    },
  );
  expect(result).toMatchObject({ save: { rating: 3, favorite: true } });
});

it("returns OCR snippets from library grep", async () => {
  mock.fts.mockResolvedValue([
    {
      id: "save",
      title: null,
      description: null,
      caption: null,
      ocr: "invoice 441",
      transcript: null,
      notes: null,
    },
  ]);
  mock.admitted = [{ id: "save" }];
  expect(await grepLibrary({ query: "invoice" })).toEqual({
    hits: [{ id: "save", snippets: ["invoice 441"] }],
  });
});

function untypedSchemaPaths(schema: JsonValue, path = "$"): string[] {
  if (schema === true || schema === false) return [path];
  if (Array.isArray(schema))
    return schema.flatMap((entry, index) =>
      untypedSchemaPaths(entry, `${path}[${index}]`),
    );
  const parsed = z.record(z.string(), z.json()).safeParse(schema);
  if (!parsed.success) return [];
  const node = parsed.data;
  const keys = Object.keys(node).filter((key) => key !== "$schema");
  const typed =
    z.string().safeParse(node.type).success ||
    Array.isArray(node.type) ||
    node.const !== undefined ||
    node.enum !== undefined ||
    node.anyOf !== undefined ||
    node.oneOf !== undefined ||
    node.allOf !== undefined ||
    z.string().safeParse(node.$ref).success;
  const hits = !typed && keys.length === 0 ? [path] : [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "$schema" || key === "$ref" || key === "additionalProperties")
      continue;
    const properties =
      key === "properties"
        ? z.record(z.string(), z.json()).safeParse(value)
        : null;
    if (properties?.success) {
      for (const [name, property] of Object.entries(properties.data))
        hits.push(
          ...untypedSchemaPaths(property, `${path}.properties.${name}`),
        );
    } else hits.push(...untypedSchemaPaths(value, `${path}.${key}`));
  }
  return hits;
}

it("converts Assistant tool inputs to JSON Schema providers can type-check", () => {
  const schemas = {
    showSaves: assistantResultSet,
    requestQuestion: assistantQuestion,
    searchLibrary: searchLibraryInput,
    readSave: readSaveInput,
    grepLibrary: grepLibraryInput,
    libraryOverview: libraryOverviewInput,
    applyFilter: applyFilterInput,
    setOverlay: setOverlayInput,
    citeSaves: citeSavesInput,
    openSave: openSaveInput,
    findDuplicates: listFoldersInput,
    describeSaves: describeSavesInput,
    listFolders: listFoldersInput,
    proposeChanges: assistantProposalInput,
  };
  const failures = Object.entries(schemas).flatMap(([name, schema]) => {
    const json = z.toJSONSchema(schema);
    return untypedSchemaPaths(z.json().parse(json)).map(
      (path) => `${name}: ${path}`,
    );
  });
  expect(failures).toEqual([]);
});

it("broadcasts applyFilter and setOverlay for the Library grid", async () => {
  const broadcast = mock.broadcast;
  const query = {
    combinator: "and" as const,
    rules: [
      { field: "type" as const, operator: "eq" as const, value: "image" },
    ],
  };
  await applyFilter({ query });
  expect(broadcast).toHaveBeenCalledWith(IPC.agentFilter, query);
  await setOverlay({ semanticQuery: "black cat", visualSaveId: "save" });
  expect(broadcast).toHaveBeenCalledWith(IPC.agentOverlay, {
    semanticQuery: "black cat",
    visualSaveId: "save",
  });
});
