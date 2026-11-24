import type { QueryResult } from "@shared/query-contracts";
import { act } from "react";
import { expect, it } from "vitest";
import { bridge } from "@/shared/test/pond-bridge";
import { assistant } from "./assistant";
import {
  chatRow,
  createAssistantHarness,
  messageRow,
} from "./assistant.test-harness";

type Messages = QueryResult<"agent.messages">;

it("keeps the current conversation visible until the next chat is ready", async () => {
  const next = Promise.withResolvers<Messages>();
  bridge.use({
    query: {
      "agent.chats": () => [],
      "agent.messages": ({ chatId }) =>
        chatId === "current"
          ? [
              messageRow({
                id: "current-message",
                chatId: "current",
                content: "Keep this conversation visible",
              }),
            ]
          : next.promise,
    },
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
        messageRow({
          id: "next-message",
          chatId: "next",
          content: "The next conversation",
        }),
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
  }
});

it("ignores old history that arrives after switching chats", async () => {
  const first = Promise.withResolvers<Messages>();
  const second = Promise.withResolvers<Messages>();
  bridge.use({
    query: {
      "agent.chats": () => [],
      "agent.messages": ({ chatId }) =>
        chatId === "first" ? first.promise : second.promise,
    },
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
        messageRow({
          id: "new",
          chatId: "second",
          content: "Current conversation",
        }),
      ]);
      await newLoad;
    });
    await act(async () => {
      first.resolve([
        messageRow({
          id: "old",
          chatId: "first",
          content: "Stale conversation",
        }),
      ]);
      await oldLoad;
    });
    expect(harness.host.textContent).toContain("Current conversation");
    expect(harness.host.textContent).not.toContain("Stale conversation");
    expect(harness.host.textContent).toContain('"loading":false');
  } finally {
    await harness.unmount();
    assistant.newChat();
  }
});

it("restores each chat's draft, visible attachments, and the unstarted composer", async () => {
  bridge.use({
    query: {
      "agent.chats": () => [],
      "agent.messages": () => [],
    },
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
  }
});

it("deletes chats while preserving another chat's draft", async () => {
  let chats = [chatRow("managed", "Original"), chatRow("other", "Other")];
  bridge.use({
    query: {
      "agent.chats": () => chats,
      "agent.messages": () => [],
      "agent.deleteChat": ({ chatId }) => {
        chats = chats.filter((chat) => chat.id !== chatId);
        return { ok: true };
      },
    },
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
  }
});
