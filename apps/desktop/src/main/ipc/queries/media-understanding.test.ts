import { DEFAULT_PREFS } from "@pond/schema/db";
import type { Prefs } from "@pond/schema/db";
import { describe, expect, it, vi } from "vitest";
import { isAuxiliaryKind } from "../../../shared/save-file-names";
import { MediaUnderstandingError } from "../../core/media-understanding";
import type { MediaUnderstanding } from "../../core/media-understanding";
import { queryOperationAccess } from "./agent-operation-access";
import { agentOperationsForQueries } from "./agent-operations";
import { createMediaUnderstandingQueries } from "./media-understanding";

const SAVE_DIR = "/library/items/save-1";

type SaveFileRef = { kind: string; path: string };

/** Mirrors the main-process contract: the picked file must exist, and only a poster may be auxiliary. */
function libraryFiles(files: ReadonlyArray<SaveFileRef>) {
  return async (
    _saveId: string,
    pick: (files: ReadonlyArray<SaveFileRef>) => number,
  ) => {
    if (files.length === 0)
      return { ok: false as const, reason: "no_files" as const };
    const file = files[pick(files)];
    if (!file) return { ok: false as const, reason: "out_of_range" as const };
    if (isAuxiliaryKind(file.kind) && file.kind !== "poster") {
      return { ok: false as const, reason: "auxiliary_file" as const };
    }
    return { ok: true as const, path: `${SAVE_DIR}/${file.path}` };
  };
}

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
    files?: ReadonlyArray<SaveFileRef>;
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
  const service: MediaUnderstanding = overrides.service ?? {
    caption: async () => ({
      text: "A red bicycle beside a wall.",
      model: "ollama/gemma4:e2b:caption:v1",
    }),
    ocr: async () => ({
      text: "TOTAL 12.50",
      model: "ollama/gemma4:e2b:ocr:v1",
    }),
  };
  const caption = vi.spyOn(service, "caption");
  const ocr = vi.spyOn(service, "ocr");
  const media = {
    readLibraryMedia: async () => overrides.bytes ?? Buffer.from("image"),
    libraryMediaMetadata: async () => ({
      originalSize:
        overrides.metadataSize ?? overrides.bytes?.byteLength ?? "image".length,
    }),
  };
  const readLibraryMedia = vi.spyOn(media, "readLibraryMedia");
  const libraryMediaMetadata = vi.spyOn(media, "libraryMediaMetadata");
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
    resolvePickedSaveFilePath:
      overrides.resolve ??
      libraryFiles(overrides.files ?? [{ kind: "image", path: "image.png" }]),
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

  it.each(["article", "avatar", "thumbnail"])(
    "reads the post's image when file 0 is a %s",
    async (kind) => {
      const { queries, caption, libraryMediaMetadata } = setup({
        files: [
          { kind, path: kind === "article" ? "article.html" : `${kind}.jpg` },
          { kind: "image", path: "media-1.jpeg" },
        ],
      });

      await expect(
        queries["saves.understandMedia"]({ saveId: "save-1", task: "caption" }),
      ).resolves.toMatchObject({ ok: true });
      expect(libraryMediaMetadata).toHaveBeenCalledExactlyOnceWith(
        `${SAVE_DIR}/media-1.jpeg`,
      );
      expect(caption).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ mimeType: "image/jpeg" }),
      );
    },
  );

  it("reads a locally imported image whose kind is not image", async () => {
    const { queries, libraryMediaMetadata } = setup({
      files: [
        { kind: "thumbnail", path: "photo.jpg_thumbnail.webp" },
        { kind: "other", path: "photo.jpg" },
      ],
    });

    await expect(
      queries["saves.understandMedia"]({ saveId: "save-1", task: "caption" }),
    ).resolves.toMatchObject({ ok: true });
    expect(libraryMediaMetadata).toHaveBeenCalledExactlyOnceWith(
      `${SAVE_DIR}/photo.jpg`,
    );
  });

  it("reads a video Save through its poster", async () => {
    const { queries, caption, libraryMediaMetadata } = setup({
      files: [
        { kind: "avatar", path: "avatar.jpg" },
        { kind: "video", path: "video-1.mp4" },
        { kind: "poster", path: "poster-1.jpg" },
      ],
    });

    await expect(
      queries["saves.understandMedia"]({ saveId: "save-1", task: "caption" }),
    ).resolves.toMatchObject({ ok: true });
    expect(libraryMediaMetadata).toHaveBeenCalledExactlyOnceWith(
      `${SAVE_DIR}/poster-1.jpg`,
    );
    expect(caption).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ mimeType: "image/jpeg" }),
    );
  });

  it.each([
    [[], "no_files"],
    [
      [
        { kind: "article", path: "article.html" },
        { kind: "avatar", path: "avatar.jpg" },
      ],
      "auxiliary_file",
    ],
    [[{ kind: "video", path: "video-1.mp4" }], "unsupported_media"],
  ] as const)(
    "reports why a Save with files %j has nothing to read",
    async (files, reason) => {
      const { queries, caption, readLibraryMedia } = setup({ files });

      await expect(
        queries["saves.understandMedia"]({ saveId: "save-1", task: "caption" }),
      ).resolves.toEqual({ ok: false, reason });
      expect(readLibraryMedia).not.toHaveBeenCalled();
      expect(caption).not.toHaveBeenCalled();
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
      files: [{ kind: "other", path: "document.pdf" }],
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
