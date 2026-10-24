import { describe, expect, it } from "vitest";
import {
  ASSISTANT_MODELS,
  assistantProvider,
  assistantSend,
  gatewayCreator,
  offeredProviders,
} from "./assistant";

describe("Assistant model policy", () => {
  it("uses unique provider records with explicit capabilities", () => {
    expect(new Set(ASSISTANT_MODELS.map((model) => model.id)).size).toBe(
      ASSISTANT_MODELS.length,
    );
    for (const model of ASSISTANT_MODELS) {
      expect(model.model).toBeTruthy();
      expect(model.setupUrl).toMatch(/^https:\/\//);
      expect(model.capabilities).toEqual({
        tools: expect.any(Boolean),
        structuredOutput: expect.any(Boolean),
        vision: expect.any(Boolean),
        customModel: expect.any(Boolean),
      });
    }
  });

  it("ships tool-capable models. Retrieval still runs in the app", () => {
    expect(ASSISTANT_MODELS.every((model) => model.capabilities.tools)).toBe(
      true,
    );
  });

  it("parses every catalog provider id", () => {
    for (const model of ASSISTANT_MODELS) {
      expect(assistantProvider.safeParse(model.id).success).toBe(true);
    }
  });

  it("validates snapshotted model run controls", () => {
    expect(
      assistantSend.parse({
        chatId: "chat",
        requestId: "request",
        content: "Hello",
        attachmentIds: [],
        provider: "openai",
        modelId: "gpt-test",
        controls: {
          fast: true,
          contextTokens: 256_000,
          reasoning: "high",
        },
      }),
    ).toMatchObject({
      modelId: "gpt-test",
      controls: {
        fast: true,
        contextTokens: 256_000,
        reasoning: "high",
      },
    });
    expect(
      assistantSend.safeParse({
        chatId: "chat",
        requestId: "request",
        content: "Hello",
        attachmentIds: [],
        provider: "openai",
        controls: {
          fast: true,
          contextTokens: 10,
          reasoning: "extreme",
        },
      }).success,
    ).toBe(false);
  });

  it("offers first-party chat providers only", () => {
    const modelIds: readonly string[] = ASSISTANT_MODELS.map(
      (model) => model.id,
    );
    expect(modelIds).not.toContain("qwen");
    expect(modelIds).not.toContain("compatible");
    expect(offeredProviders("cloud").map((model) => model.id)).toEqual([
      "anthropic",
      "openai",
      "gemini",
      "xai",
      "azure",
      "mistral",
      "groq",
      "cohere",
      "togetherai",
      "fireworks",
      "deepinfra",
      "cerebras",
      "perplexity",
      "baseten",
      "deepseek",
      "opencode-go",
      "openrouter",
    ]);
    expect(offeredProviders("local").map((model) => model.id)).toEqual([
      "ollama",
      "lmstudio",
      "sapient",
    ]);
    expect(gatewayCreator("groq")).toBe("groq");
    expect(offeredProviders("subscription").map((model) => model.id)).toEqual([
      "codex",
      "claude-code",
    ]);
    expect(gatewayCreator("azure")).toBeUndefined();
  });
});
