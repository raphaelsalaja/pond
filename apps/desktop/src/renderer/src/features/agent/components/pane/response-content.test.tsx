import type { AssistantChange } from "@shared/assistant";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AssistantState } from "@/features/agent/state/assistant";
import { toUIMessage } from "@/features/agent/state/pond-messages";
import { review } from "@/features/agent/state/review";
import { AgentMessage } from "./index";
import { ResponseContent } from "./response-content";

beforeEach(() => {
  vi.stubGlobal("pond", { query: async () => [] });
});
afterAll(() => vi.unstubAllGlobals());

const host = document.createElement("div");
document.body.append(host);
let root = createRoot(host);
afterEach(async () => {
  await act(async () => root.unmount());
  root = createRoot(host);
  vi.restoreAllMocks();
});

/** Card buttons carry a decorative shortcut hint; read the words only. */
function buttonLabel(button: Element) {
  /** SAFETY: a deep clone of an Element is an Element. */
  const copy = button.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll("[aria-hidden]")) hidden.remove();
  return copy.textContent;
}

async function renderReview(changes: AssistantChange[]) {
  await act(async () =>
    root.render(
      <ResponseContent
        message={{
          id: "reply",
          chatId: "chat",
          role: "assistant",
          content: "Proposed tags.",
          metadata: { changes },
        }}
        questionDisabled
        provider="openai"
        attachedIds={[]}
        busy={false}
        attach={vi.fn()}
      />,
    ),
  );
}

const purge = (status: AssistantChange["status"]): AssistantChange => ({
  id: "purge",
  saveId: "",
  title: "Trash",
  reason: "",
  status,
  field: "action",
  action: "purgeTrash",
  before: null,
  after: "Empty Trash",
  undoable: false,
});

it("renders a citation-only lookup as visual Saves instead of numbered prose", async () => {
  const sources = Array.from({ length: 3 }, (_, index) => ({
    id: `save-${index + 1}`,
    title: `CRM reference ${index + 1}`,
    url: `https://example.com/${index + 1}`,
    source: "arena",
  }));
  await act(async () =>
    root.render(
      <ResponseContent
        message={{
          id: "reply",
          chatId: "chat",
          role: "assistant",
          content: [
            "1. [1] A resizable sidebar for an AI-native CRM.",
            "2. [2] A customer account side drawer.",
            "3. [3] A loading animation for a CRM.",
          ].join("\n"),
          metadata: { sources },
        }}
        questionDisabled
        provider="openai"
        attachedIds={[]}
        busy={false}
        attach={vi.fn()}
      />,
    ),
  );
  expect(
    host.querySelectorAll('[aria-label^="Preview CRM reference"]'),
  ).toHaveLength(3);
  expect(host.textContent).not.toContain("A resizable sidebar");
  expect(host.textContent).toContain("CRM reference 1");
});

it("shows proposed tags as chips and leaves changed Saves out of the consulted list", async () => {
  const sources = Array.from({ length: 3 }, (_, index) => ({
    id: `save-${index + 1}`,
    title: `Clock ${index + 1}`,
    url: `https://example.com/${index + 1}`,
    source: "twitter",
  }));
  await act(async () =>
    root.render(
      <ResponseContent
        message={{
          id: "reply",
          chatId: "chat",
          role: "assistant",
          content: "Proposed tags.",
          metadata: {
            sources,
            changes: [
              {
                id: "save-1:tags",
                saveId: "save-1",
                title: "Clock 1 https://t.co/abc",
                reason: "A clock interface.",
                status: "pending",
                field: "tags",
                before: ["Design"],
                after: ["Design", "Clock"],
              },
            ],
          },
        }}
        questionDisabled
        provider="openai"
        attachedIds={[]}
        busy={false}
        attach={vi.fn()}
      />,
    ),
  );
  expect(
    host.querySelector('[aria-label="Apply 1 change to your library?"]'),
  ).not.toBeNull();
  const row = host.querySelector('[aria-label="Open Clock 1"]');
  expect(row?.textContent).toContain("+Clock");
  expect(row?.textContent).not.toContain("Design");
  expect(
    [...host.querySelectorAll('[aria-label^="Preview Clock"]')].map((node) =>
      node.getAttribute("aria-label"),
    ),
  ).toEqual(["Preview Clock 2", "Preview Clock 3"]);
});

it("captions resolved rows with their status and leaves a lone pending change to the footer", async () => {
  const change = (
    index: number,
    status: "pending" | "applied" | "dismissed",
  ) => ({
    id: `save-${index}:tags`,
    saveId: `save-${index}`,
    title: `Clock ${index}`,
    reason: "A clock interface.",
    status,
    field: "tags" as const,
    before: [],
    after: ["Clock"],
  });
  await act(async () =>
    root.render(
      <ResponseContent
        message={{
          id: "reply",
          chatId: "chat",
          role: "assistant",
          content: "Proposed tags.",
          metadata: {
            changes: [
              change(1, "pending"),
              change(2, "applied"),
              change(3, "dismissed"),
            ],
          },
        }}
        questionDisabled
        provider="openai"
        attachedIds={[]}
        busy={false}
        attach={vi.fn()}
      />,
    ),
  );
  const tile = (title: string) =>
    host.querySelector(`[aria-label="Open ${title}"]`)?.closest("li");
  const labels = (title: string) =>
    [...(tile(title)?.querySelectorAll("button[aria-label]") ?? [])]
      .map((button) => button.getAttribute("aria-label"))
      .filter((label) => !label?.startsWith("Open"));

  expect(tile("Clock 1")?.textContent).toContain("+Clock");
  expect(labels("Clock 1")).toEqual([]);
  expect(
    [
      ...host.querySelectorAll(
        '[aria-label="Apply 1 change to your library?"] button',
      ),
    ].map(buttonLabel),
  ).toContain("Apply");
  expect(tile("Clock 2")?.textContent).toContain("Applied");
  expect(tile("Clock 2")?.textContent).not.toContain("+Clock");
  expect(labels("Clock 2")).toEqual(["Undo change to Clock 2"]);
  expect(tile("Clock 3")?.textContent).toContain("Dismissed");
  expect(labels("Clock 3")).toEqual([]);
});

it("folds a decided review into a receipt that unfolds to its rows", async () => {
  await renderReview(
    (["applied", "dismissed"] as const).map((status, i) => ({
      id: `save-${i}:tags`,
      saveId: `save-${i}`,
      title: `Clock ${i}`,
      reason: "",
      status,
      field: "tags" as const,
      before: [],
      after: ["Clock"],
    })),
  );
  const card = host.querySelector('[aria-label="Applied 1, dismissed 1"]');
  expect(card?.textContent).toContain("Applied 1, dismissed 1");
  expect(card?.textContent).not.toContain("Clock 0Applied");
  expect(card?.querySelector('[aria-label^="Apply"]')).toBeNull();

  const toggle = card?.querySelector<HTMLButtonElement>(
    "button[aria-expanded]",
  );
  await act(async () => toggle?.click());
  expect(toggle?.getAttribute("aria-expanded")).toBe("true");
  expect(card?.textContent).toContain("Clock 0Applied");
  expect(card?.textContent).toContain("Clock 1Dismissed");
  expect(
    card?.querySelector('[aria-label="Undo change to Clock 0"]'),
  ).not.toBeNull();
});

it("undoes every applied change from the receipt", async () => {
  const run = vi.spyOn(review, "run").mockResolvedValue();
  const changes = (["applied", "applied", "dismissed"] as const).map(
    (status, i) => ({
      id: `save-${i}:tags`,
      saveId: `save-${i}`,
      title: `Clock ${i}`,
      reason: "",
      status,
      field: "tags" as const,
      before: [],
      after: ["Clock"],
    }),
  );
  await renderReview([
    ...changes,
    {
      id: "save-9:tags",
      saveId: "save-0",
      title: "Fixed",
      reason: "",
      status: "applied" as const,
      field: "tags" as const,
      before: [],
      after: ["Clock"],
      undoable: false,
    },
  ]);
  const undo = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Undo",
  );
  await act(async () => undo?.click());
  expect(run).toHaveBeenCalledWith(
    "reply",
    [changes[0], changes[1]],
    "undo",
    undefined,
  );
});

it("asks for Empty Trash in its own destructive card", async () => {
  await renderReview([purge("pending")]);
  const card = host.querySelector('[aria-label="Empty Trash?"]');
  expect(card).not.toBeNull();
  expect(
    [...(card?.querySelectorAll("button") ?? [])].map(buttonLabel),
  ).toEqual(["Keep Trash", "Empty Trash"]);
  expect(host.querySelector('[aria-label^="Apply"]')).toBeNull();
});

it("settles the Trash card into a receipt of what happened", async () => {
  await renderReview([purge("applied")]);
  expect(host.querySelector('[aria-label="Empty Trash?"]')).toBeNull();
  expect(host.textContent).toContain("Emptied Trash");
  await renderReview([purge("dismissed")]);
  expect(host.textContent).toContain("Kept Trash");
});

it("applies and dismisses a pending review from the keyboard", async () => {
  const run = vi.spyOn(review, "run").mockResolvedValue();
  const change: AssistantChange = {
    id: "save-1:tags",
    saveId: "save-1",
    title: "Clock 1",
    reason: "",
    status: "pending",
    field: "tags",
    before: [],
    after: ["Clock"],
  };
  await renderReview([change]);
  const card = host.querySelector(
    '[aria-label="Apply 1 change to your library?"]',
  );
  const press = (init: KeyboardEventInit) =>
    act(async () =>
      card?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, ...init }),
      ),
    );
  await press({ key: "Enter", metaKey: true });
  expect(run).toHaveBeenLastCalledWith("reply", [change], "apply", undefined);
  await press({ key: "Escape" });
  expect(run).toHaveBeenLastCalledWith("reply", [change], "dismiss", undefined);
});

it("keeps the tools a finished reply used out of the chat", async () => {
  await act(async () =>
    root.render(
      <ResponseContent
        message={{
          id: "reply",
          chatId: "chat",
          role: "assistant",
          content: "Found it.",
          metadata: {
            steps: [
              {
                id: "a",
                label: "Search library",
                detail: "clocks",
                status: "complete",
                elapsedMs: 1200,
              },
            ],
          },
        }}
        questionDisabled
        provider="openai"
        attachedIds={[]}
        busy={false}
        attach={vi.fn()}
      />,
    ),
  );
  expect(host.textContent).toContain("Found it.");
  expect(host.textContent).not.toContain("Ran 1 tool");
  expect(host.textContent).not.toContain("Search");
});

it("leaves a finished reply without a work summary", async () => {
  const state: AssistantState = {
    fishId: "default",
    chatId: "chat",
    chats: [],
    referenceMessageId: null,
    messages: [],
    draft: "",
    attachments: [],
    files: [],
    busy: false,
    loading: false,
    requestId: null,
    sources: [],
    activity: "thinking",
    results: [],
    steps: [],
    error: null,
    failed: null,
    queued: null,
    focusRequest: 0,
  };
  await act(async () =>
    root.render(
      <AgentMessage
        message={toUIMessage({
          id: "reply",
          chatId: "chat",
          role: "assistant",
          content: "A completed response.",
          metadata: { elapsedMs: 30_000 },
        })}
        state={state}
        provider="openai"
        attachedIds={[]}
        attach={vi.fn()}
        streaming={false}
        latest
        onAnswer={vi.fn()}
      />,
    ),
  );

  expect(host.textContent).toContain("A completed response.");
  expect(host.textContent).not.toContain("Worked for");
});

const idle: AssistantState = {
  fishId: "default",
  chatId: "chat",
  chats: [],
  referenceMessageId: null,
  messages: [],
  draft: "",
  attachments: [],
  files: [],
  busy: false,
  loading: false,
  requestId: null,
  sources: [],
  activity: "thinking",
  results: [],
  steps: [],
  error: null,
  failed: null,
  queued: null,
  focusRequest: 0,
};

async function renderReply(content: string, messages?: string[]) {
  await act(async () =>
    root.render(
      <AgentMessage
        message={toUIMessage({
          id: "reply",
          chatId: "chat",
          role: "assistant",
          content,
          metadata: messages ? { messages } : null,
        })}
        state={idle}
        provider="openai"
        attachedIds={[]}
        attach={vi.fn()}
        streaming={false}
        latest
        onAnswer={vi.fn()}
      />,
    ),
  );
  return [
    ...host.querySelectorAll<HTMLElement>('[data-slot="message-bubble"]'),
  ].map((bubble) => bubble.textContent);
}

it("shows 'send me 3 separate messages' as exactly three bubbles in order", async () => {
  const messages = ["Hey!", "Here's the second.", "And the third."];
  expect(await renderReply(messages.join("\n\n"), messages)).toEqual(messages);
  expect(
    await renderReply(
      "Hey!\n[[next]]\nHere's the second.\n[[next]]\nAnd the third.",
    ),
  ).toEqual(messages);
});

it("keeps a numbered single reply in one bubble", async () => {
  const bubbles = await renderReply(
    "1. Hey!\n2. Here's the second.\n3. And the third.",
  );
  expect(bubbles).toHaveLength(1);
  expect(host.querySelectorAll("li")).toHaveLength(3);
});

it("copies the whole reply through Pond from beside the last bubble", async () => {
  const query = vi.fn(async () => ({ ok: true }));
  vi.stubGlobal("pond", { query });
  const messages = ["Hey!", "Here's the second."];
  await renderReply(messages.join("\n\n"), messages);
  const copy = host.querySelector<HTMLButtonElement>('[aria-label="Copy"]');
  const bubbles = host.querySelectorAll('[data-slot="message-bubble"]');
  const last = bubbles[bubbles.length - 1];
  expect(copy && last?.compareDocumentPosition(copy)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
  await act(async () => copy?.click());
  expect(query).toHaveBeenCalledWith("clipboard.writeText", {
    text: "Hey!\n\nHere's the second.",
  });
});
