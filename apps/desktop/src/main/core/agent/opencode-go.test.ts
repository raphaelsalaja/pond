import type { LanguageModel } from "ai";
import { describe, expect, it } from "vitest";
import { createOpenCodeGoModel } from "./opencode-go";

function isModelInstance(
  model: LanguageModel,
): model is Exclude<LanguageModel, string> {
  return typeof model !== "string";
}

describe("OpenCode Go routing", () => {
  it.each([
    ["grok-4.7", "/openai/v1/responses", "authorization"],
    ["claude-haiku-5-5", "/anthropic/v1/messages", "x-api-key"],
    [
      "gemini-4-argon-contributor",
      "/google/v1beta/models/gemini-4-argon-contributor:generateContent",
      "x-goog-api-key",
    ],
    ["deepseek-v4.1-flash", "/openai/v1/chat/completions", "authorization"],
  ] as const)(
    "uses the documented endpoint and conversation headers for %s",
    async (modelId, path, keyHeader) => {
      const requests: Array<{ url: string; headers: Headers }> = [];
      const model = await createOpenCodeGoModel(
        "go-test",
        modelId,
        "chat-123",
        async (input, init) => {
          requests.push({
            url: String(input),
            headers: new Headers(init?.headers),
          });
          return new Response(JSON.stringify({ error: "offline" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        },
      );
      if (!isModelInstance(model)) {
        throw new Error("Expected an SDK model instance");
      }
      await expect(
        model.doGenerate({
          prompt: [
            { role: "user", content: [{ type: "text", text: "Hello" }] },
          ],
        }),
      ).rejects.toThrow();

      const request = requests[0];
      expect(request?.url).toContain(path);
      expect(request?.headers.get("user-agent")).toMatch(/^pond-desktop\/1/);
      expect(request?.headers.get("x-opencode-session")).toBe("chat-123");
      expect(request?.headers.get(keyHeader)).toContain("go-test");
    },
  );
});
