import { expect, it, vi } from "vitest";
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

it.each(["stopped", "failed"] as const)(
  "preserves timing and final activity for a %s reply",
  async (outcome) => {
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
          stopped: outcome === "stopped",
          error: outcome === "failed" ? "Provider unavailable" : undefined,
        }),
        listMessages: async () => {
          const metadata = {
            elapsedMs: 2500,
            stopped: outcome === "stopped",
            steps: [
              {
                id: "read",
                label: "Read Save",
                status: outcome === "stopped" ? "stopped" : "error",
              },
            ],
          };
          return [
            {
              id: "reply",
              chatId: "chat",
              role: "assistant",
              content: "",
              createdAt: new Date(),
              metadata:
                outcome === "failed"
                  ? { ...metadata, error: "Provider unavailable" }
                  : metadata,
            },
          ];
        },
      },
    );
    const body = await response.text();
    expect(body).toContain('"elapsedMs":2500');
    expect(body).toContain('"data-pond-steps"');
    expect(body).toContain(
      outcome === "stopped" ? '"status":"stopped"' : '"status":"error"',
    );
    if (outcome === "failed") {
      expect(body.indexOf('"message-metadata"')).toBeLessThan(
        body.indexOf('"type":"error"'),
      );
    }
  },
);

it("writes a UIMessage SSE round-trip for validated text and Pond data parts", async () => {
  const send = vi.fn<StreamTurnDependencies["sendMessage"]>(
    async (_input, _deps, onEvent) => {
      onEvent?.({ type: "activity", activity: "searching" });
      onEvent?.({ type: "text", text: "A " });
      onEvent?.({ type: "text", text: "lighting study." });
      return { chatId: "chat", accepted: true };
    },
  );
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
  expect(send).toHaveBeenCalledOnce();
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
