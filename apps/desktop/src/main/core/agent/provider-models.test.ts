import { describe, expect, it } from "vitest";
import {
  displayName,
  modelsFromProviderResponse,
  resolveModelId,
} from "./provider-models";

describe("modelsFromProviderResponse", () => {
  it("keeps OpenAI chat models and drops embeddings, whisper, and images", () => {
    const models = modelsFromProviderResponse("openai", {
      data: [
        { id: "gpt-5.4-mini" },
        { id: "gpt-5.6" },
        { id: "o3" },
        { id: "text-embedding-3-large" },
        { id: "whisper-1" },
        { id: "dall-e-3" },
        { id: "gpt-image-1" },
      ],
    });
    expect(models.map((model) => model.id)).toEqual([
      "gpt-5.4-mini",
      "gpt-5.6",
      "o3",
    ]);
    expect(models.map((model) => model.name)).toEqual([
      "GPT 5.4 Mini",
      "GPT 5.6",
      "O3",
    ]);
  });

  it("keeps Sapient chat and vision models and drops speech and robot models", () => {
    const models = modelsFromProviderResponse("sapient", {
      data: [
        {
          id: "openhorizon/qwen2.5-3b-q4",
          object: "model",
          owned_by: "sapient",
        },
        {
          id: "openhorizon/smolvlm2-500m",
          object: "model",
          owned_by: "sapient",
        },
        {
          id: "openhorizon/whisper-base",
          object: "model",
          owned_by: "sapient",
        },
        { id: "openhorizon/kokoro-82m", object: "model", owned_by: "sapient" },
        { id: "openhorizon/orpheus-3b", object: "model", owned_by: "sapient" },
        { id: "lerobot/smolvla_base", object: "model", owned_by: "sapient" },
      ],
      active_model: null,
      resident_models: [],
    });
    expect(models.map((model) => model.id)).toEqual([
      "openhorizon/qwen2.5-3b-q4",
      "openhorizon/smolvlm2-500m",
    ]);
  });

  it("uses Anthropic display names when the API sends them", () => {
    const models = modelsFromProviderResponse("anthropic", {
      data: [
        { id: "claude-opus-4-5", display_name: "Claude Opus 4.5" },
        { id: "claude-sonnet-4-5", display_name: "Claude Sonnet 4.5" },
      ],
    });
    expect(models).toEqual([
      { id: "claude-opus-4-5", name: "Claude Opus 4.5" },
      { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
    ]);
  });

  it("strips Gemini model prefixes and requires generateContent", () => {
    const models = modelsFromProviderResponse("gemini", {
      models: [
        {
          name: "models/gemini-2.5-pro",
          displayName: "Gemini 2.5 Pro",
          supportedGenerationMethods: ["generateContent"],
        },
        {
          name: "models/embedding-001",
          displayName: "Embedding",
          supportedGenerationMethods: ["embedContent"],
        },
      ],
    });
    expect(models).toEqual([{ id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" }]);
  });

  it("keeps OpenRouter text models and excludes other output modalities", () => {
    const models = modelsFromProviderResponse("openrouter", {
      data: [
        {
          id: "anthropic/claude-sonnet-4.5",
          name: "Claude Sonnet 4.5",
          architecture: { output_modalities: ["text"] },
        },
        {
          id: "google/gemini-image-model",
          name: "Gemini Image Model",
          architecture: { output_modalities: ["text", "image"] },
        },
        {
          id: "openai/audio-model",
          name: "Audio Model",
          architecture: { output_modalities: ["text", "audio"] },
        },
      ],
    });

    expect(models).toEqual([
      { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
    ]);
  });

  it("keeps every Ollama id the host reports", () => {
    const models = modelsFromProviderResponse("ollama", {
      data: [{ id: "llama3.2:latest" }, { id: "qwen2.5vl" }],
    });
    expect(models).toEqual([
      {
        id: "llama3.2:latest",
        name: "llama3.2:latest",
        modelCapabilities: {
          text: true,
          vision: false,
          audio: false,
          tools: false,
        },
      },
      {
        id: "qwen2.5vl",
        name: "qwen2.5vl",
        modelCapabilities: {
          text: true,
          vision: false,
          audio: false,
          tools: false,
        },
      },
    ]);
  });

  it("keeps native capabilities separate from catalog capability tags", () => {
    expect(
      modelsFromProviderResponse("ollama", {
        data: [
          {
            id: "gemma4:e2b",
            capabilities: ["completion", "vision", "tools"],
          },
        ],
      }),
    ).toEqual([
      {
        id: "gemma4:e2b",
        name: "gemma4:e2b",
        modelCapabilities: {
          text: true,
          vision: true,
          audio: false,
          tools: true,
        },
      },
    ]);
  });

  it("keeps model byte sizes reported by local runtimes", () => {
    expect(
      modelsFromProviderResponse("ollama", {
        data: [
          {
            id: "gemma4:e2b",
            size: 4_800_000_000,
          },
        ],
      }),
    ).toEqual([
      {
        id: "gemma4:e2b",
        name: "gemma4:e2b",
        sizeBytes: 4_800_000_000,
        modelCapabilities: {
          text: true,
          vision: false,
          audio: false,
          tools: false,
        },
      },
    ]);
  });

  it("uses LM Studio capability metadata without guessing from the id", () => {
    expect(
      modelsFromProviderResponse("lmstudio", {
        data: [
          {
            id: "plain-model",
            display_name: "Plain Model",
            capabilities: {
              vision: true,
              trained_for_tool_use: true,
            },
          },
          { id: "vision-model-without-metadata" },
        ],
      }),
    ).toEqual([
      {
        id: "plain-model",
        name: "Plain Model",
        modelCapabilities: {
          text: true,
          vision: true,
          audio: false,
          tools: true,
        },
      },
      {
        id: "vision-model-without-metadata",
        name: "vision-model-without-metadata",
        modelCapabilities: {
          text: true,
          vision: false,
          audio: false,
          tools: false,
        },
      },
    ]);
  });
});

describe("displayName", () => {
  it("formats an API id without a vendor nickname map", () => {
    expect(displayName("gpt-5.4-mini")).toBe("GPT 5.4 Mini");
    expect(displayName("gpt-4o-mini")).toBe("GPT 4o Mini");
  });
});

describe("resolveModelId", () => {
  it("prefers the saved id for that provider over the catalog fallback", () => {
    expect(
      resolveModelId(
        "openai",
        { modelIds: { openai: "gpt-5.4-mini" } },
        "gpt-5.6-sol",
      ),
    ).toBe("gpt-5.4-mini");
  });

  it("falls back to the legacy ollama field, then the catalog", () => {
    expect(
      resolveModelId("ollama", { ollamaModelId: "qwen2.5vl" }, "llama3.2"),
    ).toBe("qwen2.5vl");
    expect(resolveModelId("openai", {}, "gpt-5.6-sol")).toBe("gpt-5.6-sol");
  });
});
