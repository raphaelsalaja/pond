import { isElement } from "@pond/ui/dom";
import type { AssistantChange } from "@shared/assistant";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AssistantState } from "@/features/agent/state/assistant";
import { toUIMessage } from "@/features/agent/state/pond-messages";
import { review } from "@/features/agent/state/review";
import { bridge } from "@/shared/test/pond-bridge";
import { AgentMessage } from "./index";
import { ResponseContent } from "./response-content";

beforeEach(() => {
  bridge.use({
    query: {
      "saves.getMany": () => [],
      "agent.review": () => ({ changes: [] }),
      "folders.list": () => [],
      "folders.memberships": () => [],
      "clipboard.writeText": () => ({ ok: true }),
    },
  });
});

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
  const copy = button.cloneNode(true);
  if (!isElement(copy)) {
    throw new Error("Cloned button is not an element");
  }
  for (const hidden of copy.querySelectorAll("[aria-hidden]")) {
    hidden.remove();
  }
  return copy.textContent;
}

/** The confirmation is labelled by its own heading, so find it from the question it asks. */
function questionCard(title: string) {
  return [...host.querySelectorAll("section h3")]
    .find((heading) => heading.textContent === title)
    ?.closest("section");
}

/** Clicks the first button whose words match, ignoring decorative hints. */
async function press(label: string) {
  const button = [...host.querySelectorAll("button")].find((item) =>
    buttonLabel(item)?.includes(label),
  );
  await act(async () => button?.click());
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
  expect(questionCard("Apply 1 change to your library?")).not.toBeNull();
  expect(host.textContent).toContain("I'll tag Clock 1 with Clock.");
  expect(host.textContent).not.toContain("Design");
  expect(host.querySelector('[aria-label="Open Clock 1"]')).not.toBeNull();
  expect(
    [...host.querySelectorAll('[aria-label^="Preview Clock"]')].map((node) =>
      node.getAttribute("aria-label"),
    ),
  ).toEqual(["Preview Clock 2", "Preview Clock 3"]);
});

const tagChange = (
  index: number,
  status: AssistantChange["status"],
  tag = "Clock",
): AssistantChange => ({
  id: `save-${index}:tags`,
  saveId: `save-${index}`,
  title: `Clock ${index}`,
  reason: "",
  status,
  field: "tags",
  before: [],
  after: [tag],
});

it("says the proposal as prose, citing each Save and folding the rest into a count", async () => {
  await renderReview([
    tagChange(1, "pending"),
    tagChange(2, "pending"),
    tagChange(3, "pending"),
    tagChange(4, "pending"),
    {
      ...tagChange(5, "pending"),
      id: "save-5:trash",
      field: "trash",
      before: "active",
      after: "trashed",
    },
  ]);
  expect(host.textContent).toContain(
    "I'll tag Clock 1, Clock 2, Clock 3 and 1 more with Clock and move Clock 5 to Trash.",
  );
  const more = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "1 more",
  );
  await act(async () => more?.click());
  expect(host.querySelector('[aria-label="Open Clock 4"]')).not.toBeNull();
});

it("sends a longer proposal as a lead and one bubble per change", async () => {
  await renderReview([
    tagChange(1, "pending"),
    tagChange(2, "pending", "Wood"),
    tagChange(3, "pending", "Glass"),
  ]);
  const bubbles = [
    ...host.querySelectorAll('[data-slot="message-bubble"]'),
  ].map((bubble) => bubble.textContent);
  expect(bubbles).toEqual([
    "Here's how I'll tag them:",
    "Clock 1 with Clock",
    "Clock 2 with Wood",
    "Clock 3 with Glass",
  ]);
});

it("approves the whole proposal", async () => {
  const run = vi.spyOn(review, "run").mockResolvedValue();
  const changes = [tagChange(1, "pending"), tagChange(2, "pending", "Wood")];
  await renderReview(changes);
  await press("Approve");
  expect(run).toHaveBeenCalledWith("reply", changes, "apply", undefined);
});

it("denies the whole proposal", async () => {
  const run = vi.spyOn(review, "run").mockResolvedValue();
  const changes = [tagChange(1, "pending")];
  await renderReview(changes);
  await press("Deny");
  expect(run).toHaveBeenCalledWith("reply", changes, "dismiss", undefined);
});

it("settles a decided proposal into a receipt", async () => {
  await renderReview([tagChange(0, "applied"), tagChange(1, "dismissed")]);
  const card = host.querySelector('[aria-label="Applied 1, dismissed 1"]');
  expect(card?.textContent).toContain("Applied 1, dismissed 1");
  expect(
    host.querySelector('[aria-label="What to change instead"]'),
  ).toBeNull();
});

it("undoes every applied change from the receipt", async () => {
  const run = vi.spyOn(review, "run");
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
  expect(window.pond.query).toHaveBeenCalledWith("agent.review", {
    messageId: "reply",
    changeIds: ["save-0:tags", "save-1:tags"],
    action: "undo",
  });
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
  const run = vi.spyOn(review, "run");
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
  const card = questionCard("Apply 1 change to your library?");
  const key = (init: KeyboardEventInit) =>
    act(async () =>
      card?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, ...init }),
      ),
    );
  await key({ key: "Enter", metaKey: true });
  expect(run).toHaveBeenLastCalledWith("reply", [change], "apply", undefined);
  await key({ key: "Escape" });
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
    runChatId: null,
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
  runChatId: null,
  focusRequest: 0,
};

async function renderReply(content: string, messages?: Array<string>) {
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
  const messages = ["Hey!", "Here's the second."];
  await renderReply(messages.join("\n\n"), messages);
  const copy = host.querySelector<HTMLButtonElement>('[aria-label="Copy"]');
  const last = [...host.querySelectorAll('[data-slot="message-bubble"]')].at(
    -1,
  );
  expect(copy && last?.compareDocumentPosition(copy)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
  await act(async () => copy?.click());
  expect(window.pond.query).toHaveBeenCalledWith("clipboard.writeText", {
    text: "Hey!\n\nHere's the second.",
  });
});
