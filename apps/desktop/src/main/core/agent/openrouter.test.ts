import type { LanguageModel } from "ai";
import { describe, expect, it } from "vitest";
import { createOpenRouterModel } from "./openrouter";

function isModelInstance(
  model: LanguageModel,
): model is Exclude<LanguageModel, string> {
  return typeof model !== "string";
}

describe("OpenRouter routing", () => {
  it("uses chat completions with current attribution headers", async () => {
    const requests: Array<{ url: string; headers: Headers }> = [];
    const model = await createOpenRouterModel(
      "sk-or-test",
      "anthropic/claude-sonnet-4.5",
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
        prompt: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
      }),
    ).rejects.toThrow();

    const request = requests[0];
    expect(request?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(request?.headers.get("authorization")).toBe("Bearer sk-or-test");
    expect(request?.headers.get("http-referer")).toBe(
      "https://github.com/raphaelsalaja/pond",
    );
    expect(request?.headers.get("x-openrouter-title")).toBe("Pond");
  });
});
