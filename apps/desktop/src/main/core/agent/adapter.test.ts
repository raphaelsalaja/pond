import { describe, expect, it } from "vitest";
import { z } from "zod";
import { loadModel } from "./adapter";

const loadedModel = z.object({
  modelId: z.string(),
  provider: z.string(),
});

describe("loadModel", () => {
  it.each([
    "openai",
    "anthropic",
    "gemini",
    "deepseek",
    "ollama",
    "xai",
    "mistral",
    "groq",
    "opencode-go",
    "openrouter",
  ] as const)(
    "preserves runtime-selected model IDs for %s",
    async (provider) => {
      const model = loadedModel.safeParse(
        await loadModel({
          provider,
          model: "pond-custom-model",
          apiKey: "offline-test-key",
        }),
      );
      expect(model.success && model.data.modelId).toBe("pond-custom-model");
    },
  );

  it("uses the compatible API for Sapient models", async () => {
    const model = loadedModel.safeParse(
      await loadModel({
        provider: "sapient",
        model: "openhorizon/qwen2.5-3b-q4",
        apiKey: null,
        baseUrl: "http://127.0.0.1:11435/v1",
      }),
    );
    expect(model.success && model.data.provider).toContain("sapient");
    expect(model.success && model.data.modelId).toBe(
      "openhorizon/qwen2.5-3b-q4",
    );
  });

  it("uses the compatible API for LM Studio models", async () => {
    const model = loadedModel.safeParse(
      await loadModel({
        provider: "lmstudio",
        model: "local/model:quantized",
        apiKey: null,
        baseUrl: "http://127.0.0.1:1234/v1",
      }),
    );
    expect(model.success && model.data.provider).toContain("lmstudio");
    expect(model.success && model.data.modelId).toBe("local/model:quantized");
  });

  it.each([
    ["grok-4.7", "opencode-go.responses"],
    ["claude-haiku-5-5", "opencode-go"],
    ["gemini-4-argon-contributor", "opencode-go"],
    ["deepseek-v4.1-flash", "opencode-go.chat"],
  ] as const)(
    "routes OpenCode Go model %s through its documented adapter",
    async (modelId, provider) => {
      const model = loadedModel.parse(
        await loadModel({
          provider: "opencode-go",
          model: modelId,
          apiKey: "offline-test-key",
          threadId: "chat-1",
        }),
      );
      expect(model.provider).toBe(provider);
    },
  );

  it("does not route Azure without a resource URL", async () => {
    await expect(
      loadModel({ provider: "azure", model: "gpt-5.6-sol", apiKey: "key" }),
    ).rejects.toThrow("Enter a resource name");
  });
});
