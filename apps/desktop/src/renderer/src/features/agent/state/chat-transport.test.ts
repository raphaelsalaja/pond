import { expect, it, vi } from "vitest";
import { bridge } from "@/shared/test/pond-bridge";
import { ipcChatFetch, parseBody } from "./chat-transport";
import { fromUIMessage, toUIMessage } from "./pond-messages";

it("parses a JSON body for the Pond ChatTransport", () => {
  expect(
    parseBody({
      body: JSON.stringify({
        chatId: "chat",
        requestId: "request",
        messages: [{ id: "user-1", role: "user" }],
      }),
    }),
  ).toEqual({
    chatId: "chat",
    requestId: "request",
    messages: [{ id: "user-1", role: "user" }],
  });
  expect(parseBody({ body: "not-json" })).toEqual({});
});

it("reads reply bytes through a bridge that only accepts data and callbacks", async () => {
  const close = vi.fn();
  bridge.use({
    agentStream: (_body, receive) => {
      queueMicrotask(() => {
        receive({
          type: "data",
          data: Array.from(new TextEncoder().encode("Hello")),
        });
        receive({ type: "end" });
      });
      return close;
    },
  });
  const abort = new AbortController();
  const response = await ipcChatFetch("pond://agent", {
    body: JSON.stringify({ chatId: "chat" }),
    signal: abort.signal,
  });
  expect(await response.text()).toBe("Hello");
  expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
  expect(window.pond.agentStream).toHaveBeenCalledWith(
    { chatId: "chat" },
    expect.any(Function),
  );
  expect(close).toHaveBeenCalledOnce();
  abort.abort();
  expect(close).toHaveBeenCalledOnce();
});

it("round-trips Pond data parts on UIMessages", () => {
  const saved = toUIMessage({
    id: "assistant-1",
    chatId: "chat",
    role: "assistant",
    content: "A lighting study.",
    metadata: {
      question: { question: "Which topic?", options: ["Film"] },
      sources: [
        {
          id: "save",
          title: "Film",
          source: "arena",
          url: "https://example.com/film",
        },
      ],
    },
  });
  const restored = fromUIMessage(saved, "chat");
  expect(restored.content).toBe("A lighting study.");
  expect(restored.metadata?.question?.question).toBe("Which topic?");
  expect(restored.metadata?.sources?.[0]?.id).toBe("save");
});

it("cancels the port and rejects a pending read when stopped", async () => {
  const close = vi.fn();
  bridge.use({ agentStream: () => close });
  const abort = new AbortController();
  const response = await ipcChatFetch("pond://agent", { signal: abort.signal });
  const read = response.text();
  abort.abort();
  await expect(read).rejects.toMatchObject({ name: "AbortError" });
  expect(close).toHaveBeenCalledOnce();
});

it("does not open a port for an already stopped request", async () => {
  const abort = new AbortController();
  abort.abort();
  await expect(
    ipcChatFetch("pond://agent", { signal: abort.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(window.pond.agentStream).not.toHaveBeenCalled();
});

it("closes the port when the response reader cancels", async () => {
  const close = vi.fn();
  bridge.use({ agentStream: () => close });
  const response = await ipcChatFetch("pond://agent");
  await response.body?.cancel();
  expect(close).toHaveBeenCalledOnce();
});

it("surfaces stream failures and ignores late chunks", async () => {
  const close = vi.fn();
  bridge.use({
    agentStream: (_body, receive) => {
      queueMicrotask(() => {
        receive({ type: "error", error: "Reply failed" });
        receive({ type: "data", data: [65] });
        receive({ type: "end" });
      });
      return close;
    },
  });
  const response = await ipcChatFetch("pond://agent");
  await expect(response.text()).rejects.toThrow("Reply failed");
  expect(close).toHaveBeenCalledOnce();
});

it("surfaces a bridge setup failure without leaving abort listeners", async () => {
  bridge.use({
    agentStream: () => {
      throw new Error("Bridge unavailable");
    },
  });
  const abort = new AbortController();
  const response = await ipcChatFetch("pond://agent", { signal: abort.signal });
  await expect(response.text()).rejects.toThrow("Bridge unavailable");
  expect(() => abort.abort()).not.toThrow();
});
