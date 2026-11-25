import { act } from "react";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { bridge } from "@/shared/test/pond-bridge";
import { assistant } from "./assistant";
import {
  agentStreamBridge,
  chatRow,
  createAssistantHarness,
  messageRow,
  streamRequests,
} from "./assistant.test-harness";
import type { StreamReply } from "./assistant.test-harness";

const ShownSchema = z.object({
  fishId: z.string().nullable(),
  chatId: z.string().nullable(),
  messages: z.array(z.string()),
  busy: z.boolean(),
  draft: z.string(),
  queued: z.string().nullable(),
});

it("opens a clean chat for a fish spawned while another fish replies", async () => {
  const first = Promise.withResolvers<StreamReply>();
  const { requests, record, request } = streamRequests();
  const koiMessages = [
    messageRow({
      id: "koi-reply",
      chatId: "koi-latest",
      content: "An earlier reply",
    }),
  ];
  bridge.use({
    query: {
      "agent.chats": (input) =>
        input?.fishId === "koi" ? [chatRow("koi-latest", "Latest")] : [],
      "agent.messages": ({ chatId }) =>
        chatId === "koi-latest" ? koiMessages : [],
      "agent.newChat": () => chatRow("guppy-new"),
    },
    agentStream: agentStreamBridge((sent) => {
      record(sent);
      return requests.length === 1 ? first.promise : {};
    }),
  });
  const harness = createAssistantHarness((state) => ({
    fishId: state.fishId,
    chatId: state.chatId,
    messages: state.messages.map((message) => message.content),
    busy: state.busy,
    draft: state.draft,
    queued: state.queued?.content ?? null,
  }));
  const shown = () =>
    ShownSchema.parse(JSON.parse(harness.host.textContent ?? "{}"));
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
    await request(1);
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
      bridge.emit("onAgentChunk", {
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
    await request(2);
    expect(requests[1]).toMatchObject({ chatId: "guppy-new" });
    await vi.waitFor(() => expect(shown().busy).toBe(false));
    expect(shown()).toMatchObject({ chatId: "guppy-new", queued: null });
  } finally {
    first.resolve({});
    await harness.unmount(async () => pending);
    assistant.newChat();
  }
});
