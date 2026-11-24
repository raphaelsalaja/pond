import { act } from "react";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { bridge } from "@/shared/test/pond-bridge";
import { assistant } from "./assistant";
import {
  chatRow,
  createAssistantHarness,
  messageRow,
} from "./assistant.test-harness";

const ShownSchema = z
  .object({
    chatId: z.string().nullable(),
    draft: z.string(),
    loading: z.boolean(),
  })
  .partial();

const chats = new Map([
  ["koi", [chatRow("koi-latest", "Latest"), chatRow("koi-older", "Older")]],
  ["carp", [chatRow("carp-only", "Only")]],
  ["guppy", []],
]);

it("opens each fish on its one conversation and keeps its draft", async () => {
  bridge.use({
    query: {
      "agent.chats": (input) => chats.get(input?.fishId ?? "") ?? [],
      "agent.messages": ({ chatId }) => [
        messageRow({ id: `${chatId}-reply`, chatId, content: "An answer" }),
      ],
    },
  });
  const harness = createAssistantHarness((state) => ({
    chatId: state.chatId,
    draft: state.draft,
    loading: state.loading,
  }));
  const shown = () =>
    ShownSchema.parse(JSON.parse(harness.host.textContent || "{}"));
  const open = async (fishId: string) => {
    await act(async () => assistant.selectFish(fishId));
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(shown().loading).toBe(false);
    });
  };
  await harness.mount();
  try {
    await open("koi");
    expect(shown().chatId).toBe("koi-latest");

    await act(async () => assistant.openChat("koi-older"));
    await open("carp");
    expect(shown().chatId).toBe("carp-only");
    await open("koi");
    expect(shown().chatId).toBe("koi-latest");

    await open("guppy");
    expect(shown().chatId).toBeNull();

    await act(async () => assistant.setDraft("Keep this"));
    await open("carp");
    await open("guppy");
    expect(shown().chatId).toBeNull();
    expect(shown().draft).toBe("Keep this");
  } finally {
    await harness.unmount();
    assistant.setDraft("");
    assistant.newChat();
  }
});
