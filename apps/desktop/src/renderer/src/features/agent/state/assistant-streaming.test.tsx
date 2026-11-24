import { useChat } from "@ai-sdk/react";
import type { AgentStreamRequest, AssistantMessage } from "@shared/assistant";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { openLibraryAt } from "@/app/test/library-router";
import { pathForLibraryNav } from "@/shared/lib/library-nav";
import { selection } from "../../saves/state/selection";
import { assistant, useAssistant } from "./assistant";
import {
  agentStreamBridge,
  createAssistantHarness,
  type StreamReply,
} from "./assistant.test-harness";
import { pondChatSession } from "./pond-chat";
import { messageText } from "./pond-messages";

interface RenderSnapshot {
  busy: boolean;
  status: string;
  text: string;
}

function Probe({ snapshots }: { snapshots: RenderSnapshot[] }) {
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
  const snapshots: RenderSnapshot[] = [];
  vi.stubGlobal("pond", {
    query: vi.fn(() => Promise.resolve([])),
    agentStream: agentStreamBridge(() => ({
      text: ["One two three four five ", "six seven eight nine ten."],
      waitForTextChunk: () => nextChunk.promise,
    })),
    onAgentChunk: () => () => {},
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
    vi.unstubAllGlobals();
  }
});

it("keeps the singleton run across pane unmount and waits for saved metadata after stop", async () => {
  const response = Promise.withResolvers<StreamReply>();
  let persisted: AssistantMessage[] = [];
  let requestId = "";
  const query = vi.fn((name: string) => {
    if (name === "agent.messages") return Promise.resolve(persisted);
    if (name === "agent.stop") return Promise.resolve({});
    return Promise.resolve([]);
  });
  const agentStream = agentStreamBridge(async (request) => {
    requestId = request.requestId;
    return response.promise;
  });
  vi.stubGlobal("pond", {
    query,
    agentStream,
    onAgentChunk: () => () => {},
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
    await vi.waitFor(() => expect(requestId).not.toBe(""));
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
    expect(agentStream).toHaveBeenCalledOnce();
    expect(query.mock.calls.some(([name]) => name === "agent.send")).toBe(
      false,
    );
    expect(query.mock.calls.some(([name]) => name === "agent.stop")).toBe(true);
    persisted = [
      {
        id: `${requestId}:assistant`,
        chatId: "chat",
        role: "assistant",
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
      },
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
    vi.unstubAllGlobals();
  }
});

it("cancels before a new chat finishes creating without dispatching a model request", async () => {
  const created = Promise.withResolvers<{ id: string }>();
  const query = vi.fn((name: string) =>
    name === "agent.newChat" ? created.promise : Promise.resolve([]),
  );
  const agentStream = agentStreamBridge(() => ({}));
  vi.stubGlobal("pond", {
    query,
    agentStream,
    onAgentChunk: () => () => {},
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
      created.resolve({ id: "new-chat" });
      await pending;
    });
    expect(agentStream).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([name]) => name === "agent.send")).toBe(
      false,
    );
    expect(harness.host.textContent).toContain('"busy":false');
    expect(harness.host.textContent).toContain("Do not send this");
  } finally {
    created.resolve({ id: "new-chat" });
    await harness.unmount(async () => pending);
    assistant.newChat();
    vi.unstubAllGlobals();
  }
});

it("streams normal submissions without inferring context from selection pronouns", async () => {
  const created = Promise.withResolvers<{ id: string }>();
  const query = vi.fn((name: string) =>
    name === "agent.newChat" ? created.promise : Promise.resolve([]),
  );
  const requests: AgentStreamRequest[] = [];
  const agentStream = agentStreamBridge((request) => {
    requests.push(request);
    return {};
  });
  vi.stubGlobal("pond", {
    query,
    agentStream,
    onAgentChunk: () => () => {},
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
      created.resolve({ id: "snapshot-created" });
      await pending;
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      scope: { kind: "library" },
      attachmentIds: [],
    });
    expect(agentStream).toHaveBeenCalledOnce();
    expect(query.mock.calls.some(([name]) => name === "agent.send")).toBe(
      false,
    );
  } finally {
    created.resolve({ id: "snapshot-created" });
    await harness.unmount(async () => pending);
    selection.clear();
    vi.unstubAllGlobals();
  }
});

it("sends attached Saves as context while searching the entire library", async () => {
  const response = Promise.withResolvers<StreamReply>();
  const query = vi.fn(() => Promise.resolve([]));
  const requests: AgentStreamRequest[] = [];
  const agentStream = agentStreamBridge(async (request) => {
    requests.push(request);
    return response.promise;
  });
  vi.stubGlobal("pond", {
    query,
    agentStream,
    onAgentChunk: () => () => {},
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
    vi.unstubAllGlobals();
  }
});
