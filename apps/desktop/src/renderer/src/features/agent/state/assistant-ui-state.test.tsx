import { act } from "react";
import { expect, it, vi } from "vitest";
import { assistant } from "./assistant";
import { createAssistantHarness } from "./assistant.test-harness";

it("appends shortcut actions without replacing the draft and rejects oversized insertions", async () => {
  vi.stubGlobal("pond", {
    query: async () => [],
    onAgentChunk: () => () => {},
  });
  assistant.newChat();
  const harness = createAssistantHarness((state) => ({
    draft: state.draft,
    error: state.error,
  }));
  await harness.mount();
  try {
    await act(async () => {
      assistant.setDraft("Keep my notes");
      expect(assistant.appendDraft("Summarize these Saves.")).toBe(true);
    });
    expect(JSON.parse(harness.host.textContent || "{}").draft).toBe(
      "Keep my notes\n\nSummarize these Saves.",
    );
    await act(async () => {
      assistant.setDraft("x".repeat(31_990));
      expect(assistant.appendDraft("This will not fit.")).toBe(false);
      expect(assistant.quote("Neither will this quote.")).toBe(false);
    });
    const result = JSON.parse(harness.host.textContent || "{}");
    expect(result.draft).toBe("x".repeat(31_990));
    expect(result.error).toContain("quote is too long");
  } finally {
    await harness.unmount();
    assistant.newChat();
    vi.unstubAllGlobals();
  }
});

it("keeps reference browsing scoped to a conversation without changing the draft", async () => {
  const source = {
    id: "save",
    title: "Reference",
    source: "arena",
    url: "https://example.com",
  };
  vi.stubGlobal("pond", {
    query: async (name: string, args: { chatId?: string }) =>
      name === "agent.chats"
        ? []
        : name === "agent.messages"
          ? [
              {
                id: `${args.chatId}-reply`,
                chatId: args.chatId,
                role: "assistant",
                content: "An answer",
                metadata: { sources: [source] },
              },
            ]
          : {},
    onAgentChunk: () => () => {},
  });
  assistant.newChat();
  const harness = createAssistantHarness((state) => ({
    reference: state.referenceMessageId,
    draft: state.draft,
  }));
  await harness.mount();
  try {
    await act(async () => assistant.openChat("first"));
    await act(async () => {
      assistant.setDraft("Keep my draft");
      assistant.showReferences("first-reply");
    });
    expect(JSON.parse(harness.host.textContent || "{}")).toEqual({
      reference: "first-reply",
      draft: "Keep my draft",
    });
    await act(async () => assistant.showReferences("unknown"));
    expect(JSON.parse(harness.host.textContent || "{}").reference).toBe(
      "first-reply",
    );
    await act(async () => assistant.openChat("second"));
    expect(JSON.parse(harness.host.textContent || "{}")).toEqual({
      reference: null,
      draft: "",
    });
    await act(async () => assistant.showReferences("first-reply"));
    expect(JSON.parse(harness.host.textContent || "{}").reference).toBeNull();
    await act(async () => {
      assistant.showReferences("second-reply");
      assistant.closeReferences();
    });
    expect(JSON.parse(harness.host.textContent || "{}").draft).toBe("");
    await act(async () => assistant.openChat("first"));
    expect(JSON.parse(harness.host.textContent || "{}").draft).toBe(
      "Keep my draft",
    );
    await act(async () => {
      assistant.showReferences("second-reply");
      assistant.newChat();
    });
    expect(JSON.parse(harness.host.textContent || "{}").reference).toBeNull();
  } finally {
    await harness.unmount();
    vi.unstubAllGlobals();
  }
});
