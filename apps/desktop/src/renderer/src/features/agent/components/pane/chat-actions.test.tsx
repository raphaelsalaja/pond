import { Dialog } from "@pond/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChatActions } from "./chat-actions";

let host: HTMLDivElement;
let root: Root;
const query = vi.fn(async () => ({ ok: true }));
beforeEach(() => {
  vi.stubGlobal("pond", { query });
  query.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render(disabled = false, chatId: string | null = "chat") {
  await act(async () =>
    root.render(
      <>
        <ChatActions
          chatId={chatId}
          title="Notes"
          disabled={disabled}
          messages={
            chatId
              ? [
                  {
                    id: "message",
                    chatId,
                    role: "user",
                    content: "**Hello**",
                    metadata: null,
                  },
                ]
              : []
          }
        />
        <Dialog.Host />
      </>,
    ),
  );
}
async function openMenu() {
  const trigger = item("Fish Actions");
  if (!trigger) {
    throw new Error("Missing Fish Actions");
  }
  await act(async () => trigger.click());
}
function item(label: string) {
  return [
    ...document.querySelectorAll<HTMLButtonElement>("button[aria-label]"),
  ].find((element) => element.getAttribute("aria-label") === label);
}
function menuItem(label: string) {
  return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (element) => element.textContent === label,
  );
}
it("places every chat action in one menu", async () => {
  await render();
  expect(host.querySelectorAll("button[aria-label]")).toHaveLength(1);
  await openMenu();
  expect(
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].map(
      (element) => element.textContent,
    ),
  ).toEqual(["Copy Conversation", "Export Markdown", "Clear Conversation"]);
});
it("copies Markdown through the desktop clipboard operation", async () => {
  await render();
  await openMenu();
  await act(async () => menuItem("Copy Conversation")?.click());
  expect(query).toHaveBeenCalledWith("clipboard.writeText", {
    text: "# Notes\n\n## You\n\n**Hello**\n\n",
  });
});
it.each([true, false])(
  "disables conversation actions while busy or before the first message (%s)",
  async (busy) => {
    await render(busy, busy ? "chat" : null);
    await openMenu();
    for (const label of [
      "Copy Conversation",
      "Export Markdown",
      "Clear Conversation",
    ]) {
      expect(menuItem(label)?.hasAttribute("data-disabled")).toBe(true);
    }
  },
);
it("requires confirmation before deleting and supports cancellation", async () => {
  await render();
  await openMenu();
  await act(async () => menuItem("Clear Conversation")?.click());
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
    "permanently deletes",
  );
  expect(query).not.toHaveBeenCalled();
  await act(async () => item("Close")?.click());
  expect(query).not.toHaveBeenCalled();
});
