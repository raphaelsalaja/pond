import type { JsonObject, JsonValue } from "@pond/schema/json";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

const usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};

type MockChunk =
  | { type: "stream-start"; warnings: Array<never> }
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | { type: "text-end"; id: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: string }
  | { type: "error"; error: unknown }
  | {
      type: "finish";
      finishReason: { unified: "stop" | "tool-calls"; raw: string };
      usage: typeof usage;
    };

export function textChunks(text: string | Array<string>): Array<MockChunk> {
  const deltas = Array.isArray(text) ? text : [text];
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "text-1" },
    ...deltas.map((delta): MockChunk => ({
      type: "text-delta",
      id: "text-1",
      delta,
    })),
    { type: "text-end", id: "text-1" },
    {
      type: "finish",
      finishReason: { unified: "stop", raw: "stop" },
      usage,
    },
  ];
}

export function toolCallChunks(
  toolCallId: string,
  toolName: string,
  input: JsonObject,
): Array<MockChunk> {
  return [
    { type: "stream-start", warnings: [] },
    {
      type: "tool-call",
      toolCallId,
      toolName,
      input: JSON.stringify(input),
    },
    {
      type: "finish",
      finishReason: { unified: "tool-calls", raw: "tool-calls" },
      usage,
    },
  ];
}

export function textModel(text: string | Array<string>) {
  return new MockLanguageModelV4({
    doStream: {
      stream: simulateReadableStream({ chunks: textChunks(text) }),
    },
  });
}

export function errorModel(error: JsonValue | Error) {
  return new MockLanguageModelV4({
    doStream: {
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "error", error },
        ],
      }),
    },
  });
}

export function promptDump(model: MockLanguageModelV4) {
  return JSON.stringify(model.doStreamCalls);
}
