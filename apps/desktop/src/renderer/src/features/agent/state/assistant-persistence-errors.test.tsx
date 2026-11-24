import type { AssistantMessage } from "@shared/assistant";
import { act } from "react";
import { expect, it, vi } from "vitest";
import { assistant } from "./assistant";
import { createAssistantHarness } from "./assistant.test-harness";

it("keeps the current conversation visible until the next chat is ready", async () => {
  const next = Promise.withResolvers<Array<AssistantMessage>>();
  vi.stubGlobal("pond", {
    query: (name: string, args: { chatId?: string }) => {
      if (name !== "agent.messages") {
        return Promise.resolve([]);
      }
      if (args.chatId === "current") {
        return Promise.resolve([
          {
            id: "current-message",
            chatId: "current",
            role: "assistant",
            content: "Keep this conversation visible",
            metadata: null,
          },
        ] satisfies Array<AssistantMessage>);
      }
      return next.promise;
    },
    onAgentChunk: () => () => {},
  });
  assistant.newChat();
  const harness = createAssistantHarness((state) => ({
    chatId: state.chatId,
    loading: state.loading,
    messages: state.messages.map((message) => message.content),
  }));
  await harness.mount();
  try {
    await act(async () => assistant.openChat("current"));
    let switching: Promise<void> = Promise.resolve();
    await act(async () => {
      switching = assistant.openChat("next");
    });
    expect(JSON.parse(harness.host.textContent || "{}")).toEqual({
      chatId: "current",
      loading: true,
      messages: ["Keep this conversation visible"],
    });
    await act(async () => {
      next.resolve([
        {
          id: "next-message",
          chatId: "next",
          role: "assistant",
          content: "The next conversation",
          metadata: null,
        },
      ]);
      await switching;
    });
    expect(JSON.parse(harness.host.textContent || "{}")).toEqual({
      chatId: "next",
      loading: false,
      messages: ["The next conversation"],
    });
  } finally {
    next.resolve([]);
    await harness.unmount();
    assistant.newChat();
    vi.unstubAllGlobals();
  }
});

it("ignores old history that arrives after switching chats", async () => {
  const first = Promise.withResolvers<Array<AssistantMessage>>();
  const second = Promise.withResolvers<Array<AssistantMessage>>();
  vi.stubGlobal("pond", {
    query: (name: string, args: { chatId?: string }) =>
      name === "agent.messages"
        ? args.chatId === "first"
          ? first.promise
          : second.promise
        : Promise.resolve([]),
    onAgentChunk: () => () => {},
  });
  assistant.newChat();
  const harness = createAssistantHarness((state) => ({
    chatId: state.chatId,
    loading: state.loading,
    messages: state.messages,
  }));
  await harness.mount();
  try {
    let oldLoad: Promise<void> = Promise.resolve();
    let newLoad: Promise<void> = Promise.resolve();
    await act(async () => {
      oldLoad = assistant.openChat("first");
      newLoad = assistant.openChat("second");
    });
    await act(async () => {
      second.resolve([
        {
          id: "new",
          chatId: "second",
          role: "assistant",
          content: "Current conversation",
          metadata: null,
        },
      ]);
      await newLoad;
    });
    await act(async () => {
      first.resolve([
        {
          id: "old",
          chatId: "first",
          role: "assistant",
          content: "Stale conversation",
          metadata: null,
        },
      ]);
      await oldLoad;
    });
    expect(harness.host.textContent).toContain("Current conversation");
    expect(harness.host.textContent).not.toContain("Stale conversation");
    expect(harness.host.textContent).toContain('"loading":false');
  } finally {
    await harness.unmount();
    assistant.newChat();
    vi.unstubAllGlobals();
  }
});

it("restores each chat's draft, visible attachments, and the unstarted composer", async () => {
  vi.stubGlobal("pond", {
    query: async () => [],
    onAgentChunk: () => () => {},
  });
  const harness = createAssistantHarness((state) => ({
    draft: state.draft,
    attachments: state.attachments.map((save) => save.id),
  }));
  const save = {
    id: "draft-save",
    title: "A Save",
    source: "arena",
    url: "https://example.com/save",
  };
  await harness.mount();
  try {
    await act(async () => {
      assistant.newChat();
      assistant.setDraft("Unstarted draft");
      await assistant.openChat("composer-first");
      assistant.setDraft("First draft");
      assistant.attach([save]);
      await assistant.openChat("composer-second");
    });
    expect(JSON.parse(harness.host.textContent || "{}")).toEqual({
      draft: "",
      attachments: [],
    });
    await act(async () => {
      assistant.setDraft("Second draft");
      await assistant.openChat("composer-first");
    });
    expect(JSON.parse(harness.host.textContent || "{}")).toEqual({
      draft: "First draft",
      attachments: [save.id],
    });
    await act(async () => assistant.newChat());
    expect(JSON.parse(harness.host.textContent || "{}").draft).toBe(
      "Unstarted draft",
    );
    await act(async () => assistant.openChat("composer-second"));
    expect(JSON.parse(harness.host.textContent || "{}")).toEqual({
      draft: "Second draft",
      attachments: [],
    });
  } finally {
    await harness.unmount();
    vi.unstubAllGlobals();
  }
});

it("deletes chats while preserving another chat's draft", async () => {
  let chats = [
    { id: "managed", title: "Original" },
    { id: "other", title: "Other" },
  ];
  vi.stubGlobal("pond", {
    query: async (name: string, params?: { chatId?: string }) => {
      if (name === "agent.chats") {
        return chats;
      }
      if (name === "agent.messages") {
        return [];
      }
      if (name === "agent.deleteChat") {
        chats = chats.filter((chat) => chat.id !== params?.chatId);
        return { ok: true };
      }
      return {};
    },
    onAgentChunk: () => () => {},
  });
  const harness = createAssistantHarness((state) => ({
    chatId: state.chatId,
    draft: state.draft,
    chats: state.chats,
  }));
  await harness.mount();
  try {
    await act(async () => {
      await assistant.openChat("other");
      assistant.setDraft("Keep my draft");
    });
    await act(async () => assistant.deleteChat("managed"));
    expect(harness.host.textContent).toContain("Keep my draft");
    expect(harness.host.textContent).toContain('"chatId":"other"');
    expect(harness.host.textContent).not.toContain("managed");
    await act(async () => assistant.deleteChat("other"));
    expect(harness.host.textContent).toContain('"chatId":null');
    await act(async () => assistant.openChat("other"));
    expect(harness.host.textContent).not.toContain("Keep my draft");
  } finally {
    await harness.unmount();
    assistant.newChat();
    vi.unstubAllGlobals();
  }
});
