import { isStepCount, simulateReadableStream, ToolLoopAgent, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import {
  contextDependencies,
  emptySearchNote,
  libraryContext,
} from "./context";
import { textChunks, toolCallChunks } from "./mock-model";

const dependencies = {
  ...contextDependencies,
  listFolders: async () => [],
  folderIdsForSave: async () => [],
  searchLibrary: async () => ({
    saves: [
      {
        id: "known",
        title: "Film",
        source: "arena" as const,
        url: "https://example.com",
        author: null,
        notes: null,
        description: null,
      },
    ],
  }),
};

it("shows only verified result IDs and streams the same data it persists", async () => {
  const onResults = vi.fn();
  const onSteps = vi.fn();
  const onSources = vi.fn();
  const context = libraryContext(
    {
      scope: {},
      signal: new AbortController().signal,
      onActivity: vi.fn(),
      onSources,
      onResults,
      onSteps,
    },
    dependencies,
  );
  const show = context.tools.find((tool) => tool.name === "showSaves");
  if (!show) {
    throw new Error("Missing showSaves tool");
  }
  await expect(
    show.execute({ title: "References", saveIds: ["unknown"] }),
  ).rejects.toThrow(/Only Saves/);
  expect(context.results()).toEqual([]);
  const search = context.tools.find((tool) => tool.name === "searchLibrary");
  if (!search) {
    throw new Error("Missing searchLibrary tool");
  }
  let calls = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      const first = calls++ === 0;
      return {
        stream: simulateReadableStream({
          chunks: first
            ? toolCallChunks("search-1", "searchLibrary", { query: "film" })
            : textChunks("Found"),
        }),
      };
    },
  });
  const agent = new ToolLoopAgent({
    model,
    tools: {
      searchLibrary: tool({
        description: search.description,
        inputSchema: search.schema,
        execute: (args) =>
          search.execute(z.record(z.string(), z.json()).parse(args)),
      }),
    },
    stopWhen: isStepCount(2),
  });
  const result = await agent.stream({
    messages: [{ role: "user", content: "Search film" }],
    onToolExecutionStart: context.onToolExecutionStart,
    onToolExecutionEnd: context.onToolExecutionEnd,
  });
  await result.text;
  await context.tools
    .find((tool) => tool.name === "searchLibrary")
    ?.execute({ query: "film" });
  expect(onSources).toHaveBeenCalledTimes(1);
  expect(context.results()).toEqual([]);
  await show.execute({ title: "References", saveIds: ["known", "known"] });
  expect(context.results()).toEqual([
    { title: "References", saveIds: ["known"] },
  ]);
  expect(onResults).toHaveBeenLastCalledWith(context.results());
  expect(context.steps()).toMatchObject([
    { label: "Search library", detail: "film", status: "complete" },
  ]);
  expect(onSteps.mock.calls[0]?.[0][0].status).toBe("running");
  expect(onSteps).toHaveBeenLastCalledWith(context.steps());
});

it("keeps distinct curated groups and deduplicates repeats regardless of order", async () => {
  const context = libraryContext(
    {
      scope: {},
      signal: new AbortController().signal,
      onActivity: vi.fn(),
      onSources: vi.fn(),
    },
    {
      ...dependencies,
      searchLibrary: async () => ({
        saves: ["one", "two", "three"].map((id) => ({
          id,
          title: id,
          source: "arena" as const,
          url: `https://example.com/${id}`,
          author: null,
          notes: null,
          description: null,
        })),
      }),
    },
  );
  await context.tools
    .find((tool) => tool.name === "searchLibrary")
    ?.execute({ query: "film" });
  const show = context.tools.find((tool) => tool.name === "showSaves");
  if (!show) {
    throw new Error("Missing showSaves");
  }
  await show.execute({ title: "Lighting", saveIds: ["one", "two"] });
  await show.execute({ title: "Lighting", saveIds: ["two", "one"] });
  await expect(
    show.execute({ title: "Composition", saveIds: ["two", "three"] }),
  ).resolves.toMatchObject({
    references: [
      { id: "two", reference: "#save-2" },
      { id: "three", reference: "#save-3" },
    ],
  });
  await show.execute({ title: "Color", saveIds: ["one", "two"] });
  await expect(
    show.execute({ title: "Unknown", saveIds: ["missing"] }),
  ).rejects.toThrow(/Only Saves/);
  expect(context.results()).toEqual([
    { title: "Lighting", saveIds: ["one", "two"] },
    { title: "Composition", saveIds: ["two", "three"] },
    { title: "Color", saveIds: ["one", "two"] },
  ]);
  expect(context.sources()).toHaveLength(3);
});

it("registers ranked semantic evidence with stable citation references", async () => {
  const searchLibrary = vi.fn(async () => ({
    saves: [
      {
        id: "ranked-first",
        title: "URL parser",
        source: "web" as const,
        url: "https://example.com/first",
        author: null,
        notes: "Parser implementation",
        description: "Relevant code evidence",
      },
      {
        id: "ranked-second",
        title: "URL notes",
        source: "web" as const,
        url: "https://example.com/second",
        author: null,
        notes: null,
        description: "Supporting evidence",
      },
    ],
  }));
  const context = libraryContext(
    {
      scope: { saveIds: ["ranked-first", "ranked-second"] },
      signal: new AbortController().signal,
      onActivity: vi.fn(),
      onSources: vi.fn(),
    },
    { ...dependencies, searchLibrary },
  );
  const result = await context.tools
    .find((tool) => tool.name === "searchLibrary")
    ?.execute({ query: "URL parser", task: "code", limit: 500 });

  expect(searchLibrary).toHaveBeenCalledExactlyOnceWith(
    { query: "URL parser", task: "code", limit: 500 },
    { saveIds: ["ranked-first", "ranked-second"] },
  );
  expect(result).toEqual({
    saves: [
      expect.objectContaining({ id: "ranked-first", reference: "#save-1" }),
      expect.objectContaining({ id: "ranked-second", reference: "#save-2" }),
    ],
  });
  expect(context.sources().map((source) => source.id)).toEqual([
    "ranked-first",
    "ranked-second",
  ]);
});

it("gates image description with the current model's vision capability", async () => {
  const describeSaves = vi.fn(async () => ({
    ids: ["known"],
    images: 1,
    message: "Pixels are available.",
  }));
  const createContext = (canUseVision: boolean) =>
    libraryContext(
      {
        scope: {},
        signal: new AbortController().signal,
        onActivity: vi.fn(),
        onSources: vi.fn(),
        visionEnabled: () => canUseVision,
      },
      {
        ...dependencies,
        readSave: async () => ({ error: "Save unavailable in fixture." }),
        describeSaves,
      },
    );

  const unavailable = createContext(false).tools.find(
    (tool) => tool.name === "describeSaves",
  );
  expect(await unavailable?.execute({ ids: ["known"] })).toEqual({
    error: "Choose a vision model in Settings Models.",
  });
  expect(describeSaves).not.toHaveBeenCalled();

  const available = createContext(true).tools.find(
    (tool) => tool.name === "describeSaves",
  );
  await expect(available?.execute({ ids: ["known"] })).resolves.toMatchObject({
    images: 1,
  });
  expect(describeSaves).toHaveBeenCalledExactlyOnceWith({ ids: ["known"] });
});

it("names the filters that emptied a search", () => {
  expect(
    emptySearchNote({
      query: "",
      source: "local",
      folderId: "Library",
      media: [],
      untagged: true,
    }),
  ).toBe(
    'No Saves matched source "local", folderId "Library", untagged. Remove any filter the request did not ask for and search again.',
  );
  expect(emptySearchNote({ query: "dog", media: [] })).toBeUndefined();
});
