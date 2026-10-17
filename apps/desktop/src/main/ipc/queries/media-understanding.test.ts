import { DEFAULT_PREFS, type Prefs } from "@pond/schema/db";
import { describe, expect, it, vi } from "vitest";
import {
  type MediaUnderstanding,
  MediaUnderstandingError,
} from "../../core/media-understanding";
import { queryOperationAccess } from "./agent-operation-access";
import { agentOperationsForQueries } from "./agent-operations";
import { createMediaUnderstandingQueries } from "./media-understanding";

const IMAGE_PATH = "/library/items/save-1/image.png";

function prefs(
  agent: Partial<Prefs["agent"]> = {},
  ai: Partial<Prefs["ai"]> = {},
): Pick<Prefs, "agent" | "ai"> {
  return {
    ai: {
      ...DEFAULT_PREFS.ai,
      mediaUnderstandingProvider: "ollama",
      mediaUnderstandingModelId: "gemma4:e2b",
      ...ai,
    },
    agent: {
      languageModel: "ollama",
      modelIds: { ollama: "gemma4:e2b" },
      ollamaModelId: "gemma4:e2b",
      lmstudioModelId: "local",
      ollamaBaseUrl: "http://127.0.0.1:11434/v1",
      lmstudioBaseUrl: "http://127.0.0.1:1234/v1",
      sapientBaseUrl: "http://127.0.0.1:11435/v1",
      azureResourceName: "",
      modelOptions: {},
      enabledKeys: { ollama: true },
      addedProviders: ["ollama"],
      mcpSearch: true,
      mcpOpen: true,
      mcpExport: true,
      ...agent,
    },
  };
}

function setup(
  overrides: {
    prefs?: Pick<Prefs, "agent" | "ai">;
    resolve?: () => Promise<
      | { ok: true; path: string }
      | { ok: false; reason: "not_found" | "missing" | "unsafe_path" }
    >;
    bytes?: Buffer;
    metadataSize?: number;
    models?: Array<{
      id: string;
      name: string;
      available?: boolean;
      modelCapabilities?: {
        text: boolean;
        vision: boolean;
        audio: boolean;
        tools: boolean;
      };
    }>;
    service?: MediaUnderstanding;
  } = {},
) {
  const caption = vi.fn(async () => ({
    text: "A red bicycle beside a wall.",
    model: "ollama/gemma4:e2b:caption:v1",
  }));
  const ocr = vi.fn(async () => ({
    text: "TOTAL 12.50",
    model: "ollama/gemma4:e2b:ocr:v1",
  }));
  const service = overrides.service ?? { caption, ocr };
  const readLibraryMedia = vi.fn(
    async () => overrides.bytes ?? Buffer.from("image"),
  );
  const libraryMediaMetadata = vi.fn(async () => ({
    originalSize:
      overrides.metadataSize ?? overrides.bytes?.byteLength ?? "image".length,
  }));
  const queries = createMediaUnderstandingQueries({
    getPrefs: async () => overrides.prefs ?? prefs(),
    keyFor: async () => null,
    listProviderModels: async () => ({
      ok: true,
      models: overrides.models ?? [
        {
          id: "gemma4:e2b",
          name: "Gemma 4 E2B",
          modelCapabilities: {
            text: true,
            vision: true,
            audio: false,
            tools: false,
          },
        },
      ],
    }),
    libraryMediaMetadata,
    readLibraryMedia,
    resolveSaveFilePath:
      overrides.resolve ?? (async () => ({ ok: true, path: IMAGE_PATH })),
    service,
  });
  return {
    queries,
    caption,
    ocr,
    libraryMediaMetadata,
    readLibraryMedia,
  };
}

describe("saves.understandMedia", () => {
  it("is internal background work and is not exposed to the Assistant", () => {
    const { queries } = setup();

    expect(queryOperationAccess["saves.understandMedia"]).toBe("hidden");
    expect(agentOperationsForQueries(queries)).toEqual([]);
  });

  it.each([
    ["caption", "A red bicycle beside a wall."],
    ["ocr", "TOTAL 12.50"],
  ] as const)(
    "understands a Library image with the %s task",
    async (task, text) => {
      const { queries, caption, ocr } = setup();

      await expect(
        queries["saves.understandMedia"]({ saveId: "save-1", task }),
      ).resolves.toEqual({
        ok: true,
        text,
        model: `ollama/gemma4:e2b:${task}:v1`,
      });
      const invoked = task === "caption" ? caption : ocr;
      expect(invoked).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          mimeType: "image/png",
          bytes: Buffer.from("image"),
          connection: {
            provider: "ollama",
            modelId: "gemma4:e2b",
            apiKey: null,
            baseUrl: "http://127.0.0.1:11434/v1",
          },
        }),
      );
    },
  );

  it.each([
    ["not_found", "not_found"],
    ["missing", "missing"],
    ["unsafe_path", "unsafe_path"],
  ] as const)("returns %s without reading media", async (reason, expected) => {
    const { queries, caption, readLibraryMedia } = setup({
      resolve: async () => ({ ok: false, reason }),
    });

    await expect(
      queries["saves.understandMedia"]({ saveId: "save-1", task: "caption" }),
    ).resolves.toEqual({ ok: false, reason: expected });
    expect(readLibraryMedia).not.toHaveBeenCalled();
    expect(caption).not.toHaveBeenCalled();
  });

  it("rejects unsupported media before reading it", async () => {
    const { queries, caption, readLibraryMedia } = setup({
      resolve: async () => ({
        ok: true,
        path: "/library/items/save-1/document.pdf",
      }),
    });

    await expect(
      queries["saves.understandMedia"]({ saveId: "save-1", task: "caption" }),
    ).resolves.toEqual({ ok: false, reason: "unsupported_media" });
    expect(readLibraryMedia).not.toHaveBeenCalled();
    expect(caption).not.toHaveBeenCalled();
  });

  it("rejects images over 25 MiB before invoking the service", async () => {
    const { queries, caption } = setup({
      bytes: Buffer.alloc(25 * 1024 * 1024 + 1),
    });

    await expect(
      queries["saves.understandMedia"]({ saveId: "save-1", task: "caption" }),
    ).resolves.toEqual({ ok: false, reason: "too_large" });
    expect(caption).not.toHaveBeenCalled();
  });

  it("rejects an oversized Library file before allocating its bytes", async () => {
    const { queries, caption, readLibraryMedia } = setup({
      metadataSize: 25 * 1024 * 1024 + 1,
    });

    await expect(
      queries["saves.understandMedia"]({ saveId: "save-1", task: "caption" }),
    ).resolves.toEqual({ ok: false, reason: "too_large" });
    expect(readLibraryMedia).not.toHaveBeenCalled();
    expect(caption).not.toHaveBeenCalled();
  });

  it("uses the dedicated media provider and model instead of Assistant selections", async () => {
    const { queries, caption } = setup({
      prefs: prefs(
        {
          languageModel: "lmstudio",
          modelIds: { lmstudio: "agent-language" },
        },
        {
          mediaUnderstandingProvider: "ollama",
          mediaUnderstandingModelId: "gemma4:e2b",
        },
      ),
    });

    await expect(
      queries["saves.understandMedia"]({ saveId: "save-1", task: "caption" }),
    ).resolves.toMatchObject({ ok: true });
    expect(caption).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        connection: expect.objectContaining({
          provider: "ollama",
          modelId: "gemma4:e2b",
        }),
      }),
    );
  });

  it("requires the exact configured model to be installed", async () => {
    const { queries, caption } = setup({
      models: [
        {
          id: "different-model",
          name: "Different model",
          modelCapabilities: {
            text: true,
            vision: true,
            audio: false,
            tools: false,
          },
        },
      ],
    });

    await expect(
      queries["saves.understandMedia"]({ saveId: "save-1", task: "caption" }),
    ).resolves.toEqual({ ok: false, reason: "model_unavailable" });
    expect(caption).not.toHaveBeenCalled();
  });

  it("rejects an installed text-only model", async () => {
    const { queries, caption } = setup({
      models: [
        {
          id: "gemma4:e2b",
          name: "Gemma text-only",
          modelCapabilities: {
            text: true,
            vision: false,
            audio: false,
            tools: false,
          },
        },
      ],
    });

    await expect(
      queries["saves.understandMedia"]({ saveId: "save-1", task: "caption" }),
    ).resolves.toEqual({ ok: false, reason: "model_not_vision" });
    expect(caption).not.toHaveBeenCalled();
  });

  it("returns service failures using query result conventions", async () => {
    const error = new MediaUnderstandingError("model-chatter", "caption");
    error.operationalMetric = {
      modelId: "gemma4:e2b",
      task: "caption",
      temperature: "warm",
      durationMs: 125,
      imageBytes: 5,
      outcome: "model_chatter",
      fallbackUsed: false,
    };
    const { queries } = setup({
      service: {
        caption: async () => {
          throw error;
        },
        ocr: async () => ({ text: "", model: "unused" }),
      },
    });

    await expect(
      queries["saves.understandMedia"]({ saveId: "save-1", task: "caption" }),
    ).resolves.toEqual({
      ok: false,
      reason: "model_chatter",
      operation: {
        modelId: "gemma4:e2b",
        task: "caption",
        temperature: "warm",
        durationMs: 125,
        imageBytes: 5,
        outcome: "model_chatter",
        fallbackUsed: false,
      },
    });
  });
});
