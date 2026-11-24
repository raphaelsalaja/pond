import { describe, expect, it, vi } from "vitest";
import { createAppleLanguageModel, renderPrompt } from "./apple-language-model";
import type { runAppleHelper } from "./apple-runtime";

type CallOptions = Parameters<
  ReturnType<typeof createAppleLanguageModel>["doGenerate"]
>[0];

const tools: CallOptions["tools"] = [
  {
    type: "function",
    name: "searchLibrary",
    description: "Search",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
];

describe("renderPrompt", () => {
  it("splits system text from the transcript and labels turns", () => {
    const { instructions, prompt } = renderPrompt([
      { role: "system", content: "Be brief." },
      { role: "user", content: [{ type: "text", text: "posters?" }] },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "1",
            toolName: "searchLibrary",
            input: { query: "posters" },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "1",
            toolName: "searchLibrary",
            output: { type: "json", value: { ids: ["a"] } },
          },
        ],
      },
    ]);
    expect(instructions).toBe("Be brief.");
    expect(prompt).toBe(
      [
        "User: posters?",
        'Fish called searchLibrary with {"query":"posters"}',
        'Result of searchLibrary: {"ids":["a"]}',
      ].join("\n\n"),
    );
  });

  it("clips long tool results", () => {
    const { prompt } = renderPrompt([
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "1",
            toolName: "readSave",
            output: { type: "text", value: "x".repeat(5000) },
          },
        ],
      },
    ]);
    expect(prompt.length).toBeLessThan(2100);
  });
});

describe("createAppleLanguageModel", () => {
  it("returns a tool call", async () => {
    const run = vi.fn<typeof runAppleHelper>(async () => ({
      ok: true,
      content: {
        text: "",
        call: { tool: "searchLibrary", arguments: { query: "posters" } },
      },
    }));
    const model = createAppleLanguageModel({ run });
    const result = await model.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "posters?" }] }],
      tools,
    });
    expect(result.finishReason.unified).toBe("tool-calls");
    expect(result.content).toEqual([
      expect.objectContaining({
        type: "tool-call",
        toolName: "searchLibrary",
        input: '{"query":"posters"}',
      }),
    ]);
    expect(run.mock.calls[0]?.[0]).toMatchObject({
      command: "generate",
      prompt: "User: posters?",
    });
  });

  it("returns text", async () => {
    const run = vi.fn<typeof runAppleHelper>(async () => ({
      ok: true,
      content: { text: "You have 3 posters." },
    }));
    const result = await createAppleLanguageModel({ run }).doGenerate({
      prompt: [],
      tools,
    });
    expect(result.content).toEqual([
      { type: "text", text: "You have 3 posters." },
    ]);
    expect(result.finishReason.unified).toBe("stop");
  });

  it("streams the same reply", async () => {
    const run = vi.fn<typeof runAppleHelper>(async () => ({
      ok: true,
      content: { text: "Hi." },
    }));
    const { stream } = await createAppleLanguageModel({ run }).doStream({
      prompt: [],
      tools,
    });
    const parts = [];
    for await (const part of stream) {
      parts.push(part.type);
    }
    expect(parts).toEqual([
      "stream-start",
      "text-start",
      "text-delta",
      "text-end",
      "finish",
    ]);
  });

  it("refuses an unknown tool or an empty reply", async () => {
    const unknownTool = vi.fn<typeof runAppleHelper>(async () => ({
      ok: true,
      content: { text: "", call: { tool: "shell", arguments: {} } },
    }));
    await expect(
      createAppleLanguageModel({ run: unknownTool }).doGenerate({
        prompt: [],
        tools,
      }),
    ).rejects.toThrow("Apple Intelligence couldn't reply. Try again.");
    const empty = vi.fn<typeof runAppleHelper>(async () => ({
      ok: true,
      content: { text: " " },
    }));
    await expect(
      createAppleLanguageModel({ run: empty }).doGenerate({
        prompt: [],
        tools,
      }),
    ).rejects.toThrow("Apple Intelligence couldn't reply. Try again.");
  });

  it("maps helper errors to user copy", async () => {
    const run = vi.fn<typeof runAppleHelper>(async () => ({
      ok: false,
      error: "contextSizeExceeded",
    }));
    await expect(
      createAppleLanguageModel({ run }).doGenerate({ prompt: [], tools }),
    ).rejects.toThrow("This chat is too long for Apple Intelligence.");
  });

  it("refuses file attachments", async () => {
    const run = vi.fn<typeof runAppleHelper>();
    await expect(
      createAppleLanguageModel({ run }).doGenerate({
        prompt: [
          {
            role: "user",
            content: [
              {
                type: "file",
                mediaType: "image/png",
                data: { type: "data", data: "" },
              },
            ],
          },
        ],
        tools,
      }),
    ).rejects.toThrow(
      "Apple Intelligence reads text only. Choose a vision model for attachments.",
    );
    expect(run).not.toHaveBeenCalled();
  });
});
