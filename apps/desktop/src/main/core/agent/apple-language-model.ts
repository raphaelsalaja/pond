import { randomUUID } from "node:crypto";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { appleErrorMessage, runAppleHelper } from "./apple-runtime";
import { replySchemaFor } from "./apple-schema";
import type { AppleTool } from "./apple-schema";

type AppleLanguageModel = Extract<
  LanguageModel,
  { specificationVersion: "v4" }
>;
type CallOptions = Parameters<AppleLanguageModel["doGenerate"]>[0];
type GenerateResult = Awaited<ReturnType<AppleLanguageModel["doGenerate"]>>;
type ToolResultPart = Extract<
  Extract<CallOptions["prompt"][number], { role: "tool" }>["content"][number],
  { type: "tool-result" }
>;

const RESULT_CHARS = 2000;

/** The trailing ellipsis marks clipped tool output for the model, not for the user. */
function clip(text: string): string {
  return text.length > RESULT_CHARS ? `${text.slice(0, RESULT_CHARS)}…` : text;
}

function resultText(output: ToolResultPart["output"]): string {
  switch (output.type) {
    case "text":
    case "error-text":
      return output.value;
    case "json":
    case "error-json":
      return JSON.stringify(output.value);
    case "execution-denied":
      return output.reason ?? "The user declined this tool call.";
    case "content":
      return output.value
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("\n");
  }
}

export function renderPrompt(prompt: CallOptions["prompt"]) {
  const system: Array<string> = [];
  const turns: Array<string> = [];
  for (const message of prompt) {
    if (message.role === "system") {
      system.push(message.content);
      continue;
    }
    for (const part of message.content) {
      if (part.type === "text" && part.text.trim()) {
        turns.push(
          `${message.role === "user" ? "User" : "Fish"}: ${part.text}`,
        );
      } else if (part.type === "tool-call") {
        turns.push(
          `Fish called ${part.toolName} with ${JSON.stringify(part.input)}`,
        );
      } else if (part.type === "tool-result") {
        turns.push(
          `Result of ${part.toolName}: ${clip(resultText(part.output))}`,
        );
      }
    }
  }
  return { instructions: system.join("\n\n"), prompt: turns.join("\n\n") };
}

const contentSchema = z.object({
  text: z.string().default(""),
  call: z
    .object({
      tool: z.string(),
      arguments: z.record(z.string(), z.json()),
    })
    .optional(),
});

interface AppleModelDeps {
  run?: typeof runAppleHelper;
}

const USAGE: GenerateResult["usage"] = {
  inputTokens: {
    total: undefined,
    noCache: undefined,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: undefined, text: undefined, reasoning: undefined },
};

export function createAppleLanguageModel(
  deps: AppleModelDeps = {},
): AppleLanguageModel {
  const run = deps.run ?? runAppleHelper;
  const generate = async (options: CallOptions): Promise<GenerateResult> => {
    options.abortSignal?.throwIfAborted();
    if (
      options.prompt.some(
        (message) =>
          Array.isArray(message.content) &&
          message.content.some((part) => part.type === "file"),
      )
    ) {
      throw new Error(
        "Apple Intelligence reads text only. Choose a vision model for attachments.",
      );
    }
    const tools = (options.tools ?? []).flatMap((tool): Array<AppleTool> =>
      tool.type === "function"
        ? [
            {
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
            },
          ]
        : [],
    );
    const { instructions, prompt } = renderPrompt(options.prompt);
    const reply = await run(
      {
        command: "generate",
        instructions,
        prompt,
        schema: replySchemaFor(tools),
      },
      options.abortSignal,
    );
    options.abortSignal?.throwIfAborted();
    if (!reply.ok) {
      throw new Error(appleErrorMessage(reply.error));
    }
    const content = contentSchema.safeParse(reply.content);
    if (!content.success) {
      throw new Error(appleErrorMessage("failed"));
    }
    const { call, text } = content.data;
    if (
      (call && !tools.some((tool) => tool.name === call.tool)) ||
      (!call && !text.trim())
    ) {
      throw new Error(appleErrorMessage("failed"));
    }
    return {
      content: call
        ? [
            {
              type: "tool-call",
              toolCallId: randomUUID(),
              toolName: call.tool,
              input: JSON.stringify(call.arguments),
            },
          ]
        : [{ type: "text", text }],
      finishReason: { unified: call ? "tool-calls" : "stop", raw: "stop" },
      usage: USAGE,
      warnings: [],
    };
  };
  return {
    specificationVersion: "v4",
    provider: "apple",
    modelId: "system",
    supportedUrls: {},
    doGenerate: generate,
    async doStream(options) {
      const result = await generate(options);
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({
              type: "stream-start",
              warnings: result.warnings,
            });
            for (const part of result.content) {
              if (part.type === "text") {
                const id = randomUUID();
                controller.enqueue({ type: "text-start", id });
                controller.enqueue({
                  type: "text-delta",
                  id,
                  delta: part.text,
                });
                controller.enqueue({ type: "text-end", id });
              } else if (part.type === "tool-call") {
                controller.enqueue(part);
              }
            }
            controller.enqueue({
              type: "finish",
              finishReason: result.finishReason,
              usage: result.usage,
            });
            controller.close();
          },
        }),
      };
    },
  };
}
