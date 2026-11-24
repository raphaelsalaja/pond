import type { AgentStreamRequest } from "@shared/assistant";
import type { QueryResults } from "@shared/query-contracts";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { assistant } from "./assistant";
import {
  agentStreamBridge,
  createAssistantHarness,
} from "./assistant.test-harness";
import type { StreamReply } from "./assistant.test-harness";

afterEach(() => {
  assistant.newChat();
  vi.unstubAllGlobals();
});

const lastText = (request: AgentStreamRequest | undefined) =>
  JSON.stringify(request?.messages.at(-1)?.parts ?? []);

interface QueryParams {
  chatId?: string;
}

type QueryReply = QueryResults["agent.regenerate"] | Array<never>;

function stubPond(
  reply: (request: AgentStreamRequest) => StreamReply | Promise<StreamReply>,
  query: (name: string, params?: QueryParams) => QueryReply = () => [],
) {
  const requests: Array<AgentStreamRequest> = [];
  const queryMock = vi.fn(async (name: string, params?: QueryParams) =>
    query(name, params),
  );
  vi.stubGlobal("pond", {
    query: queryMock,
    agentStream: agentStreamBridge((request) => {
      requests.push(request);
      return reply(request);
    }),
    onAgentChunk: () => () => {},
  });
  return { requests, query: queryMock };
}

const createHarness = () =>
  createAssistantHarness((state) => ({
    busy: state.busy,
    draft: state.draft,
    queued: state.queued?.content ?? null,
    error: state.error,
  }));

/** Wraps the send so awaiting this helper doesn't adopt it and wait for the reply. */
async function startReply(chatId: string) {
  let pending: Promise<void> = Promise.resolve();
  await act(async () => {
    await assistant.openChat(chatId);
    assistant.setDraft("First");
    pending = assistant.send("openai");
  });
  return { pending };
}

it("queues messages sent mid-reply and sends them together once it settles", async () => {
  const first = Promise.withResolvers<StreamReply>();
  const { requests } = stubPond((request) =>
    lastText(request).includes("First") ? first.promise : { text: "Next." },
  );
  const harness = createHarness();
  await harness.mount();
  try {
    const { pending } = await startReply("queue-chat");
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    await act(async () => {
      assistant.setDraft("Second");
      await assistant.queue("openai");
      assistant.setDraft("Third");
      await assistant.queue("openai");
    });
    expect(harness.host.textContent).toContain('"draft":""');
    expect(harness.host.textContent).toContain(
      String.raw`"queued":"Second\n\nThird"`,
    );
    expect(requests).toHaveLength(1);

    await act(async () => {
      first.resolve({ text: "Done." });
      await pending;
    });
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(lastText(requests[1])).toContain(String.raw`Second\n\nThird`);
    await vi.waitFor(() =>
      expect(harness.host.textContent).toContain('"busy":false'),
    );
    expect(harness.host.textContent).toContain('"queued":null');
  } finally {
    first.resolve({});
    await harness.unmount();
  }
});

it("drops a removed queued message", async () => {
  const first = Promise.withResolvers<StreamReply>();
  const { requests } = stubPond(() => first.promise);
  const harness = createHarness();
  await harness.mount();
  try {
    const { pending } = await startReply("unqueue-chat");
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    await act(async () => {
      assistant.setDraft("Never mind");
      await assistant.queue("openai");
      assistant.unqueue();
    });
    expect(harness.host.textContent).toContain('"queued":null');
    await act(async () => {
      first.resolve({ text: "Done." });
      await pending;
    });
    expect(requests).toHaveLength(1);
  } finally {
    first.resolve({});
    await harness.unmount();
  }
});

it("stops the running reply when you send the queued message now", async () => {
  const first = Promise.withResolvers<StreamReply>();
  const { requests, query } = stubPond(() => first.promise);
  const harness = createHarness();
  await harness.mount();
  try {
    const { pending } = await startReply("send-now-chat");
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    await act(async () => {
      assistant.setDraft("Go now");
      await assistant.queue("openai");
      assistant.sendQueuedNow();
    });
    expect(query).toHaveBeenCalledWith(
      "agent.stop",
      expect.objectContaining({ chatId: "send-now-chat" }),
    );
    await act(async () => {
      first.resolve({});
      await pending;
    });
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(lastText(requests[1])).toContain("Go now");
    await vi.waitFor(() =>
      expect(harness.host.textContent).toContain('"busy":false'),
    );
  } finally {
    first.resolve({});
    await harness.unmount();
  }
});

it("regenerates the latest reply from its request and keeps your draft", async () => {
  const { requests, query } = stubPond(
    () => ({ text: "A fresh reply." }),
    (name) =>
      name === "agent.regenerate"
        ? { ok: true, content: "Again please", attachments: [], files: [] }
        : [],
  );
  const harness = createHarness();
  await harness.mount();
  try {
    await act(async () => {
      await assistant.openChat("regenerate-chat");
      assistant.setDraft("Unsent thought");
      await assistant.regenerate("openai");
    });
    expect(query).toHaveBeenCalledWith("agent.regenerate", {
      chatId: "regenerate-chat",
    });
    expect(requests).toHaveLength(1);
    expect(lastText(requests[0])).toContain("Again please");
    expect(harness.host.textContent).toContain('"draft":"Unsent thought"');
  } finally {
    await harness.unmount();
  }
});

it("shows why a reply can't be regenerated", async () => {
  const { requests } = stubPond(
    () => ({ text: "Unused." }),
    (name) =>
      name === "agent.regenerate"
        ? {
            ok: false,
            error:
              "This reply has applied changes. Undo them before running it again.",
          }
        : [],
  );
  const harness = createHarness();
  await harness.mount();
  try {
    await act(async () => {
      await assistant.openChat("regenerate-blocked");
      await assistant.regenerate("openai");
    });
    expect(requests).toHaveLength(0);
    expect(harness.host.textContent).toContain(
      '"error":"This reply has applied changes. Undo them before running it again."',
    );
  } finally {
    await harness.unmount();
  }
});
