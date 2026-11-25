import type {
  AgentStreamRequest,
  AssistantChunk,
  AssistantMessage,
} from "@shared/assistant";
import { act } from "react";
import { expect, it, vi } from "vitest";
import { assistant } from "./assistant";
import {
  agentStreamBridge,
  createAssistantHarness,
} from "./assistant.test-harness";
import type { StreamReply } from "./assistant.test-harness";

it("opens a clean chat for a fish spawned while another fish replies", async () => {
  const first = Promise.withResolvers<StreamReply>();
  const requests: Array<AgentStreamRequest> = [];
  let emit: ((chunk: AssistantChunk) => void) | null = null;
  const koiMessages: Array<AssistantMessage> = [
    {
      id: "koi-reply",
      chatId: "koi-latest",
      role: "assistant",
      content: "An earlier reply",
      metadata: null,
    },
  ];
  const query = vi.fn(
    (name: string, args: { fishId?: string; chatId?: string }) => {
      if (name === "agent.chats") {
        return Promise.resolve(
          args.fishId === "koi" ? [{ id: "koi-latest", title: "Latest" }] : [],
        );
      }
      if (name === "agent.messages") {
        return Promise.resolve(args.chatId === "koi-latest" ? koiMessages : []);
      }
      if (name === "agent.newChat") {
        return Promise.resolve({ id: "guppy-new" });
      }
      return Promise.resolve([]);
    },
  );
  const agentStream = agentStreamBridge((request) => {
    requests.push(request);
    return requests.length === 1 ? first.promise : {};
  });
  vi.stubGlobal("pond", {
    query,
    agentStream,
    onAgentChunk: (listener: (chunk: AssistantChunk) => void) => {
      emit = listener;
      return () => {};
    },
  });
  const harness = createAssistantHarness((state) => ({
    fishId: state.fishId,
    chatId: state.chatId,
    messages: state.messages.map((message) => message.content),
    busy: state.busy,
    draft: state.draft,
    queued: state.queued?.content ?? null,
  }));
  const shown = () => JSON.parse(harness.host.textContent ?? "{}");
  let pending: Promise<void> = Promise.resolve();
  await harness.mount();
  try {
    await act(async () => assistant.selectFish("koi"));
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(shown().chatId).toBe("koi-latest");
    });
    await act(async () => {
      assistant.setDraft("Explore the library");
      pending = assistant.send("openai");
    });
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect(shown().busy).toBe(true);

    await act(async () => assistant.selectFish("guppy"));
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(shown().chatId).toBeNull();
    });
    expect(shown()).toMatchObject({
      fishId: "guppy",
      messages: [],
      busy: false,
      draft: "",
      queued: null,
    });

    /** The reply still running for koi must not drive guppy's status. */
    await act(async () =>
      emit?.({
        type: "activity",
        chatId: "koi-latest",
        requestId: requests[0]?.requestId ?? "",
        activity: "searching",
      }),
    );
    expect(shown().messages).toEqual([]);

    await act(async () => {
      assistant.setDraft("A fresh start");
      await assistant.queue("openai");
    });
    expect(shown().queued).toBe("A fresh start");

    await act(async () => {
      first.resolve({ text: "An earlier reply" });
      await pending;
    });
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toMatchObject({ chatId: "guppy-new" });
    await vi.waitFor(() => expect(shown().busy).toBe(false));
    expect(shown()).toMatchObject({ chatId: "guppy-new", queued: null });
  } finally {
    first.resolve({});
    await harness.unmount(async () => pending);
    assistant.newChat();
    vi.unstubAllGlobals();
  }
});
