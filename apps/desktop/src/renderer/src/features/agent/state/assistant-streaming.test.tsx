import { useChat } from "@ai-sdk/react";
import type { AgentStreamRequest } from "@shared/assistant";
import type { QueryResult } from "@shared/query-contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { openLibraryAt } from "@/app/test/library-router";
import { pathForLibraryNav } from "@/shared/lib/library-nav";
import { bridge } from "@/shared/test/pond-bridge";
import { selection } from "../../saves/state/selection";
import { assistant, useAssistant } from "./assistant";
import {
  agentStreamBridge,
  chatRow,
  createAssistantHarness,
  messageRow,
} from "./assistant.test-harness";
import type { StreamReply } from "./assistant.test-harness";
import { pondChatSession } from "./pond-chat";
import { messageText } from "./pond-messages";

interface RenderSnapshot {
  busy: boolean;
  status: string;
  text: string;
}

function Probe({ snapshots }: { snapshots: Array<RenderSnapshot> }) {
  const state = useAssistant();
  const chat = pondChatSession(state.chatId ?? "draft");
  const { messages, status } = useChat({ chat });
  const last = messages.at(-1);
  snapshots.push({
    busy: state.busy,
    status,
    text: last?.role === "assistant" ? messageText(last) : "",
  });
  return null;
}

it("renders a multi-chunk reply progressively", async () => {
  const chatId = "multi-chunk-render";
  const nextChunk = Promise.withResolvers<void>();
  const snapshots: Array<RenderSnapshot> = [];
  bridge.use({
    query: {
      "agent.chats": () => [],
      "agent.messages": () => [],
    },
    agentStream: agentStreamBridge(() => ({
      text: ["One two three four five ", "six seven eight nine ten."],
      waitForTextChunk: () => nextChunk.promise,
    })),
  });
  assistant.newChat();
  const host = document.createElement("div");
  const root = createRoot(host);
  let pending: Promise<void> = Promise.resolve();
  try {
    await act(async () => root.render(<Probe snapshots={snapshots} />));
    await act(async () => {
      await assistant.openChat(chatId);
      assistant.setDraft("Use the fixed reply");
      pending = assistant.send("openai");
    });
    await vi.waitFor(() =>
      expect(
        snapshots.some(
          (snapshot) =>
            snapshot.text === "One two three four five " &&
            snapshot.status === "streaming",
        ),
      ).toBe(true),
    );
    expect(
      snapshots.some(
        (snapshot) =>
          snapshot.text === "One two three four five six seven eight nine ten.",
      ),
    ).toBe(false);
    await act(async () => {
      nextChunk.resolve();
      await pending;
    });
    expect(
      snapshots.some(
        (snapshot) =>
          snapshot.text === "One two three four five six seven eight nine ten.",
      ),
    ).toBe(true);
  } finally {
    nextChunk.resolve();
    await act(async () => root.unmount());
    assistant.newChat();
  }
});

it("keeps the singleton run across pane unmount and waits for saved metadata after stop", async () => {
  const response = Promise.withResolvers<StreamReply>();
  const started = Promise.withResolvers<string>();
  let persisted: QueryResult<"agent.messages"> = [];
  bridge.use({
    query: {
      "agent.chats": () => [],
      "agent.messages": () => persisted,
      "agent.stop": () => ({ ok: true }),
    },
    agentStream: agentStreamBridge(async (request) => {
      started.resolve(request.requestId);
      return response.promise;
    }),
  });
  assistant.newChat();
  const harness = createAssistantHarness((state) => ({
    chatId: state.chatId,
    busy: state.busy,
    draft: state.draft,
    messages: state.messages,
  }));
  let pending: Promise<void> = Promise.resolve();
  await harness.mount();
  try {
    await act(async () => {
      await assistant.openChat("chat");
      assistant.setDraft("Find a film");
      pending = assistant.send("openai");
    });
    const requestId = await started.promise;
    expect(requestId).not.toBe("");
    await harness.hide();
    await harness.mount();
    await act(async () => {
      assistant.stop();
      assistant.newChat();
      await assistant.openChat("other");
      assistant.setDraft("Another request");
      await assistant.send("openai");
    });
    expect(harness.host.textContent).toContain('"busy":true');
    expect(harness.host.textContent).toContain('"chatId":"chat"');
    expect(window.pond.agentStream).toHaveBeenCalledOnce();
    expect(window.pond.query).not.toHaveBeenCalledWith(
      "agent.send",
      expect.anything(),
    );
    expect(window.pond.query).toHaveBeenCalledWith(
      "agent.stop",
      expect.anything(),
    );
    persisted = [
      messageRow({
        id: `${requestId}:assistant`,
        chatId: "chat",
        content: "A film",
        metadata: {
          stopped: true,
          sources: [
            {
              id: "film",
              title: "Saved film",
              source: "arena",
              url: "https://example.com/film",
            },
          ],
        },
      }),
    ];
    await act(async () => {
      response.resolve({});
      await pending;
    });
    expect(harness.host.textContent).toContain('"busy":false');
    expect(harness.host.textContent).toContain('"draft":"Another request"');
    expect(harness.host.textContent).toContain('"stopped":true');
    expect(harness.host.textContent).toContain("Saved film");
  } finally {
    response.resolve({});
    await harness.unmount(async () => pending);
    assistant.newChat();
  }
});

it("cancels before a new chat finishes creating without dispatching a model request", async () => {
  const created = Promise.withResolvers<QueryResult<"agent.newChat">>();
  bridge.use({
    query: {
      "agent.chats": () => [],
      "agent.messages": () => [],
      "agent.newChat": () => created.promise,
    },
    agentStream: agentStreamBridge(() => ({})),
  });
  assistant.newChat();
  const harness = createAssistantHarness((state) => ({
    busy: state.busy,
    draft: state.draft,
  }));
  let pending: Promise<void> = Promise.resolve();
  await harness.mount();
  try {
    await act(async () => {
      assistant.setDraft("Do not send this");
      pending = assistant.send("openai");
    });
    await act(async () => assistant.stop());
    await act(async () => {
      created.resolve(chatRow("new-chat"));
      await pending;
    });
    expect(window.pond.agentStream).not.toHaveBeenCalled();
    expect(window.pond.query).not.toHaveBeenCalledWith(
      "agent.send",
      expect.anything(),
    );
    expect(harness.host.textContent).toContain('"busy":false');
    expect(harness.host.textContent).toContain("Do not send this");
  } finally {
    created.resolve(chatRow("new-chat"));
    await harness.unmount(async () => pending);
    assistant.newChat();
  }
});

it("streams normal submissions without inferring context from selection pronouns", async () => {
  const created = Promise.withResolvers<QueryResult<"agent.newChat">>();
  const requests: Array<AgentStreamRequest> = [];
  bridge.use({
    query: {
      "agent.chats": () => [],
      "agent.messages": () => [],
      "agent.newChat": () => created.promise,
    },
    agentStream: agentStreamBridge((request) => {
      requests.push(request);
      return {};
    }),
  });
  const harness = createAssistantHarness(() => null);
  let pending = Promise.resolve();
  const router = await openLibraryAt(
    pathForLibraryNav({ kind: "folder", id: "original-folder" }),
  );
  await harness.mount();
  try {
    await act(async () => {
      assistant.newChat();
      assistant.setDraft("Summarize these selected Saves");
      selection.set(["invisible-selection"]);
      pending = assistant.send("openai");
      await router.navigate({
        href: pathForLibraryNav({ kind: "folder", id: "later-folder" }),
      });
      created.resolve(chatRow("snapshot-created"));
      await pending;
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      scope: { kind: "library" },
      attachmentIds: [],
    });
    expect(window.pond.agentStream).toHaveBeenCalledOnce();
    expect(window.pond.query).not.toHaveBeenCalledWith(
      "agent.send",
      expect.anything(),
    );
  } finally {
    created.resolve(chatRow("snapshot-created"));
    await harness.unmount(async () => pending);
    selection.clear();
  }
});

it("sends attached Saves as context while searching the entire library", async () => {
  const response = Promise.withResolvers<StreamReply>();
  const requests: Array<AgentStreamRequest> = [];
  bridge.use({
    query: {
      "agent.chats": () => [],
      "agent.messages": () => [],
    },
    agentStream: agentStreamBridge(async (request) => {
      requests.push(request);
      return response.promise;
    }),
  });
  const harness = createAssistantHarness((state) => ({
    draft: state.draft,
    attachments: state.attachments.map((save) => save.id),
    files: state.files.map((file) => file.id),
  }));
  const source = {
    id: "scope-save",
    title: "Save",
    source: "arena",
    url: "https://example.com/save",
  };
  const file = {
    id: "local-file",
    name: "reference.pdf",
    mediaType: "application/pdf",
    size: 1024,
  };
  let pending = Promise.resolve();
  await harness.mount();
  try {
    await act(async () => {
      await assistant.openChat("scope-reset");
      assistant.attach([source, { ...source, id: "second-save" }]);
      assistant.removeAttachment("second-save");
    });
    expect(JSON.parse(harness.host.textContent || "{}").attachments).toEqual([
      source.id,
    ]);
    await act(async () => assistant.removeAttachment(source.id));
    expect(JSON.parse(harness.host.textContent || "{}").attachments).toEqual(
      [],
    );
    await act(async () => {
      assistant.attach([source]);
      assistant.attachFiles([file]);
      assistant.setDraft("Summarize this Save");
      pending = assistant.send("openai");
    });
    expect(JSON.parse(harness.host.textContent || "{}")).toEqual({
      draft: "",
      attachments: [],
      files: [],
    });
    await act(async () => {
      response.resolve({ error: "Unavailable" });
      await pending;
    });
    expect(JSON.parse(harness.host.textContent || "{}")).toEqual({
      draft: "Summarize this Save",
      attachments: [source.id],
      files: [file.id],
    });
    expect(requests[0]).toMatchObject({
      attachmentIds: [source.id],
      fileAttachmentIds: [file.id],
      scope: { kind: "library" },
    });
  } finally {
    response.resolve({ error: "Unavailable" });
    await harness.unmount(async () => pending);
  }
});
