import { expect, it } from "vitest";
import { agentStreamRequest } from "../../../shared/assistant";
import {
  latestUserText,
  streamAgentTurn,
  uiMessageErrorResponse,
} from "./stream";
import type { StreamTurnDependencies } from "./stream";

const user = {
  id: "user-1",
  role: "user" as const,
  parts: [{ type: "text" as const, text: "Find film references" }],
};

it("rejects a payload that is not a stream request", () => {
  const parsed = agentStreamRequest.safeParse({
    chatId: "chat",
    messages: "not-messages",
  });
  expect(parsed.success).toBe(false);
});

it("reads the latest user text from UIMessage parts", () => {
  expect(
    latestUserText([
      { id: "a", role: "assistant", parts: [{ type: "text", text: "Hi" }] },
      user,
    ]),
  ).toBe("Find film references");
});

async function finishedReplyBody(reply: {
  stopped: boolean;
  error: string | undefined;
  status: "stopped" | "error";
}) {
  const response = await streamAgentTurn(
    {
      chatId: "chat",
      requestId: "request",
      attachmentIds: [],
      fileAttachmentIds: [],
      scope: { kind: "library" },
      provider: "openai",
      messages: [user],
    },
    {
      sendMessage: async () => ({
        chatId: "chat",
        accepted: true,
        stopped: reply.stopped,
        error: reply.error,
      }),
      listMessages: async () => [
        {
          id: "reply",
          chatId: "chat",
          role: "assistant",
          content: "",
          createdAt: new Date(),
          metadata: {
            elapsedMs: 2500,
            stopped: reply.stopped,
            steps: [{ id: "read", label: "Read Save", status: reply.status }],
            error: reply.error,
          },
        },
      ],
    },
  );
  return response.text();
}

it.each([
  { outcome: "stopped", stopped: true, error: undefined, status: "stopped" },
  {
    outcome: "failed",
    stopped: false,
    error: "Provider unavailable",
    status: "error",
  },
] as const)(
  "preserves timing and final activity for a $outcome reply",
  async ({ stopped, error, status }) => {
    const body = await finishedReplyBody({ stopped, error, status });
    expect(body).toContain('"elapsedMs":2500');
    expect(body).toContain('"data-pond-steps"');
    expect(body).toContain(`"status":"${status}"`);
  },
);

it("writes a failed reply's metadata before its error", async () => {
  const body = await finishedReplyBody({
    stopped: false,
    error: "Provider unavailable",
    status: "error",
  });
  expect(body.indexOf('"message-metadata"')).toBeLessThan(
    body.indexOf('"type":"error"'),
  );
});

it("writes a UIMessage SSE round-trip for validated text and Pond data parts", async () => {
  let sends = 0;
  const send: StreamTurnDependencies["sendMessage"] = async (
    _input,
    _deps,
    onEvent,
  ) => {
    sends += 1;
    onEvent?.({ type: "activity", activity: "searching" });
    onEvent?.({ type: "text", text: "A " });
    onEvent?.({ type: "text", text: "lighting study." });
    return { chatId: "chat", accepted: true };
  };
  const response = await streamAgentTurn(
    {
      chatId: "chat",
      requestId: "request",
      attachmentIds: [],
      fileAttachmentIds: [],
      scope: { kind: "library" },
      provider: "openai",
      messages: [user],
    },
    {
      sendMessage: send,
      listMessages: async () => [
        {
          id: "assistant-1",
          chatId: "chat",
          role: "assistant",
          content: "A lighting study.",
          metadata: {
            elapsedMs: 90_000,
            question: {
              question: "Which topic?",
              options: ["Film", "Architecture"],
            },
          },
          createdAt: new Date(),
        },
      ],
    },
  );
  expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
  const body = await response.text();
  expect(body).toContain('"delta":"A "');
  expect(body).toContain('"delta":"lighting study."');
  expect(body.match(/"type":"text-start"/g)).toHaveLength(1);
  expect(body.match(/"type":"text-delta"/g)).toHaveLength(2);
  expect(body.match(/"type":"text-end"/g)).toHaveLength(1);
  expect(body).toContain("data-pond-question");
  expect(body).toContain('"type":"message-metadata"');
  expect(body).toContain('"elapsedMs":90000');
  expect(body).toContain('"id":"current-activity"');
  expect(body).toContain('"activity":"searching"');
  expect(body).not.toContain('"transient":true');
  expect(sends).toBe(1);
});

it("surfaces send errors as UI stream error chunks", async () => {
  const response = await streamAgentTurn(
    {
      chatId: "chat",
      requestId: "request",
      attachmentIds: [],
      fileAttachmentIds: [],
      scope: { kind: "library" },
      provider: "openai",
      messages: [user],
    },
    {
      sendMessage: async () => ({
        chatId: "chat",
        accepted: false,
        error: "Add an enabled provider key in Settings.",
      }),
      listMessages: async () => [],
    },
  );
  expect(await response.text()).toContain(
    "Add an enabled provider key in Settings.",
  );
});

it("writes an error SSE when the stream payload is rejected", async () => {
  const response = uiMessageErrorResponse("Invalid request.");
  expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
  expect(await response.text()).toContain("Invalid request.");
});

it("rejects a turn with no user text", async () => {
  await expect(
    streamAgentTurn(
      {
        chatId: "chat",
        requestId: "request",
        attachmentIds: [],
        fileAttachmentIds: [],
        scope: { kind: "library" },
        provider: "openai",
        messages: [
          { id: "a", role: "assistant", parts: [{ type: "text", text: "Hi" }] },
        ],
      },
      {
        sendMessage: async () => {
          throw new Error("should not send");
        },
        listMessages: async () => [],
      },
    ),
  ).rejects.toThrow("Write a message before sending.");
});
