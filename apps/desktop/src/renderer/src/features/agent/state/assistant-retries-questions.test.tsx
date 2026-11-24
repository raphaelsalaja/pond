import type { AgentStreamRequest } from "@shared/assistant";
import { act } from "react";
import { expect, it, vi } from "vitest";
import { openLibraryAt } from "@/app/test/library-router";
import { pathForLibraryNav } from "@/shared/lib/library-nav";
import { assistant } from "./assistant";
import {
  agentStreamBridge,
  createAssistantHarness,
} from "./assistant.test-harness";
import type { StreamReply } from "./assistant.test-harness";

it("keeps the composer draft and attachments and streams question answers", async () => {
  const question = {
    id: "question",
    chatId: "chat",
    role: "assistant",
    content: "",
    metadata: {
      question: { question: "Which topic?", options: ["Film", "Architecture"] },
    },
  };
  const query = vi.fn(
    async (
      name: string,
      _params?: { content?: string; allowCloudOnce?: boolean },
    ) => {
      if (name === "agent.messages") {
        return [question];
      }
      if (name === "agent.chats") {
        return [{ id: "chat", title: "Topics" }];
      }
      return {};
    },
  );
  const requests: Array<AgentStreamRequest> = [];
  const agentStream = agentStreamBridge((request) => {
    requests.push(request);
    return {};
  });
  vi.stubGlobal("pond", {
    query,
    agentStream,
    onAgentChunk: () => () => {},
  });
  const harness = createAssistantHarness((state) => ({
    draft: state.draft,
    attached: state.attachments.length,
  }));
  await harness.mount();
  try {
    await act(async () => assistant.openChat("chat"));
    await act(async () => {
      assistant.setDraft("Keep this draft");
      assistant.attach([
        {
          id: "film",
          title: "Film",
          source: "arena",
          url: "https://example.com",
        },
      ]);
      await assistant.answerQuestion("question", "Architecture", "openai", {
        modelId: "gpt-test",
        controls: {
          fast: true,
          contextTokens: 64_000,
          reasoning: "high",
        },
      });
    });
    expect(harness.host.textContent).toContain('"draft":"Keep this draft"');
    expect(harness.host.textContent).toContain('"attached":1');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      chatId: "chat",
      provider: "openai",
      modelId: "gpt-test",
      controls: {
        fast: true,
        contextTokens: 64_000,
        reasoning: "high",
      },
      replyToQuestion: "question",
    });
    expect(requests[0]?.messages.at(-1)).toMatchObject({
      role: "user",
      parts: [{ type: "text", text: "Architecture" }],
    });
    expect(requests[0]).not.toHaveProperty("allowCloudOnce");
    expect(agentStream).toHaveBeenCalledOnce();
    expect(query.mock.calls.some(([name]) => name === "agent.send")).toBe(
      false,
    );
    expect(harness.host.textContent).toContain('"draft":"Keep this draft"');
    expect(harness.host.textContent).toContain('"attached":1');
    await act(async () => assistant.quote("A paragraph.\n\nSecond paragraph."));
    expect(harness.host.textContent).toContain(
      String.raw`Keep this draft\n\n> A paragraph.\n> \n> Second paragraph.\n\n`,
    );
    expect(harness.host.textContent).toContain('"attached":1');
  } finally {
    await harness.unmount();
    vi.unstubAllGlobals();
  }
});

it("preserves new attachments and retries through the shared stream session", async () => {
  const failed = Promise.withResolvers<StreamReply>();
  const requests: Array<AgentStreamRequest> = [];
  const query = vi.fn((_name: string) => Promise.resolve([]));
  const agentStream = agentStreamBridge(async (request) => {
    requests.push(request);
    return requests.length === 1 ? failed.promise : {};
  });
  vi.stubGlobal("pond", {
    query,
    agentStream,
    onAgentChunk: () => () => {},
  });
  const harness = createAssistantHarness((state) => ({
    draft: state.draft,
    attachments: state.attachments.map((save) => save.id),
    failed: !!state.failed,
  }));
  const original = {
    id: "original",
    title: "Original",
    source: "arena",
    url: "https://example.com/original",
  };
  const next = { ...original, id: "next" };
  let pending = Promise.resolve();
  await harness.mount();
  try {
    await act(async () => {
      await assistant.openChat("retry-context");
      assistant.setDraft("Compare these Saves");
      assistant.attach([original]);
      pending = assistant.send("openai", {
        modelId: "gpt-retry",
        controls: {
          fast: false,
          contextTokens: 256_000,
          reasoning: "medium",
        },
      });
    });
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    await act(async () => {
      assistant.attach([next]);
      failed.resolve({ error: "Unavailable" });
      await pending;
    });
    expect(JSON.parse(harness.host.textContent || "{}")).toEqual({
      draft: "",
      attachments: ["next"],
      failed: true,
    });
    await act(async () => {
      await assistant.openChat("retry-other");
      await openLibraryAt(
        pathForLibraryNav({ kind: "folder", id: "different-folder" }),
      );
      await assistant.openChat("retry-context");
      await assistant.retry();
    });
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.scope).toEqual({ kind: "library" });
      expect(request.attachmentIds).toEqual(["original"]);
      expect(request.modelId).toBe("gpt-retry");
      expect(request.controls).toEqual({
        fast: false,
        contextTokens: 256_000,
        reasoning: "medium",
      });
    }
    expect(agentStream).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.some(([name]) => name === "agent.send")).toBe(
      false,
    );
    expect(JSON.parse(harness.host.textContent || "{}")).toEqual({
      draft: "",
      attachments: ["next"],
      failed: false,
    });
  } finally {
    failed.resolve({ error: "Unavailable" });
    await harness.unmount(async () => pending);
    vi.unstubAllGlobals();
  }
});
