import { expect, it } from "vitest";
import { catalogModelsForProvider, createModelCatalog } from "./model-catalog";

const entries = [
  {
    id: "openai/test",
    name: "Official Name",
    type: "language",
    context_window: 200_000,
    max_tokens: 8192,
    tags: [" Vision ", "FAST"],
    reasoning_options: [
      { type: "effort", values: ["LOW", "high", "unsupported"] },
      { type: "budget_tokens" },
    ],
    pricing: { input: "0.000001", output: "0.000002" },
  },
  {
    id: "anthropic/claude-test.5",
    name: "Claude Test 5",
    type: "language",
    tags: [],
  },
  { id: "google/gemini-test", name: "Gemini Test", type: "language", tags: [] },
  { id: "xai/grok-test", name: "Grok Test", type: "language", tags: [] },
  { id: "openai/image-test", name: "Image Test", type: "image", tags: [] },
];

it("fetches a public catalog without credentials and deduplicates concurrent loads", async () => {
  let calls = 0;
  const load = createModelCatalog(async (url, options) => {
    calls++;
    expect(url).toBe("https://ai-gateway.vercel.sh/v1/models");
    expect(options?.headers).toBeUndefined();
    return Response.json({ data: entries });
  });
  const [first, second] = await Promise.all([load(), load()]);
  expect(first).toEqual(second);
  expect(first.models).toHaveLength(4);
  await load();
  expect(calls).toBe(1);
});

it("uses catalog names and metadata while preserving native inference IDs", () => {
  expect(
    catalogModelsForProvider("openai", entries, [
      {
        id: "test",
        name: "Generated Name",
        modelCapabilities: {
          text: true,
          vision: true,
          audio: false,
          tools: true,
        },
      },
    ]),
  ).toEqual([
    {
      id: "test",
      name: "Official Name",
      catalogId: "openai/test",
      contextWindow: 200_000,
      maxOutputTokens: 8192,
      capabilities: ["vision", "fast"],
      modelCapabilities: {
        text: true,
        vision: true,
        audio: false,
        tools: true,
      },
      reasoningOptions: ["low", "high"],
      pricing: {
        input: "0.000001",
        output: "0.000002",
        cachedInput: undefined,
        cacheCreation: undefined,
      },
    },
  ]);
  expect(
    catalogModelsForProvider("anthropic", entries, [
      { id: "claude-test-5-20260101", name: "Claude Test 5" },
    ])[0]?.id,
  ).toBe("claude-test-5-20260101");
});

it("maps Google to Pond providers and makes previews unselectable", () => {
  expect(catalogModelsForProvider("openai", entries)[0]).toMatchObject({
    id: "openai/test",
    modelCapabilities: {
      text: true,
      vision: true,
      audio: false,
      tools: false,
    },
  });
  expect(catalogModelsForProvider("gemini", entries)[0]).toMatchObject({
    id: "google/gemini-test",
    available: false,
    modelCapabilities: {
      text: true,
      vision: false,
      audio: false,
      tools: false,
    },
  });
  expect(catalogModelsForProvider("xai", entries)[0]?.name).toBe("Grok Test");
  expect(
    catalogModelsForProvider("mistral", [
      {
        id: "mistral/codestral",
        name: "Codestral",
        type: "language",
        tags: [],
      },
    ])[0]?.id,
  ).toBe("mistral/codestral");
  expect(catalogModelsForProvider("ollama", entries)).toEqual([]);
});

it("does not invent aliases or overwrite local inventories", () => {
  const native = [{ id: "custom-name", name: "My Model" }];
  expect(catalogModelsForProvider("deepseek", entries, native)).toEqual(native);
  expect(catalogModelsForProvider("azure", entries, native)).toEqual(native);
  expect(catalogModelsForProvider("ollama", entries, native)).toEqual(native);
});

it("retains the last good catalog after a failed refresh and retries", async () => {
  let time = 0;
  let fail = false;
  const load = createModelCatalog(
    async () =>
      fail
        ? new Response(null, { status: 503 })
        : Response.json({ data: entries }),
    () => time,
  );
  const first = await load();
  time = 300_001;
  fail = true;
  const stale = await load();
  expect(stale.models).toEqual(first.models);
  expect(stale.error).toContain("last loaded catalog");
  fail = false;
  expect((await load()).error).toBeUndefined();
});

it("rejects malformed catalogs without caching the failure", async () => {
  let calls = 0;
  const load = createModelCatalog(async () => {
    calls++;
    return Response.json(
      calls === 1 ? { data: [{ id: "bad" }] } : { data: entries },
    );
  });
  expect(await load()).toMatchObject({
    models: [],
    error: expect.stringContaining("Could not load"),
  });
  expect((await load()).models).toHaveLength(4);
});
