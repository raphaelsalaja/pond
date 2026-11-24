import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { bridge } from "@/shared/test/pond-bridge";
import { AssistantResponse } from "./assistant-response";
import { ConsultedSaves } from "./consulted-saves";

beforeEach(() => {
  bridge.use({ query: { "saves.getMany": () => [] } });
});

const sources = Array.from({ length: 6 }, (_, i) => ({
  id: `save-${i}`,
  title: `Reference ${i + 1}`,
  url: "https://example.com/ref",
  source: "arena",
  description: "A saved study of light and color.",
}));
const host = document.createElement("div");
document.body.append(host);
let root = createRoot(host);
afterEach(async () => {
  await act(async () => root.unmount());
  root = createRoot(host);
});

it("expands verified results and adds the actual Save to the composer without opening it", async () => {
  const onAttach = vi.fn();
  const onOpenSave = vi.fn();
  await act(async () =>
    root.render(
      <ConsultedSaves
        saveIds={["unknown", "save-0", ...sources.map((source) => source.id)]}
        sources={sources}
        onAttach={onAttach}
        onOpenSave={onOpenSave}
      />,
    ),
  );
  expect(host.querySelectorAll("article")).toHaveLength(3);
  expect(host.textContent).not.toContain("unknown");
  const show = host.querySelector<HTMLButtonElement>(
    'section[aria-label="Consulted Saves"] > div > button[aria-expanded="false"]',
  );
  await act(async () => show?.click());
  expect(host.querySelectorAll("article")).toHaveLength(6);
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Preview Reference 1"]')
      ?.click(),
  );
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="Add Reference 1"]')
      ?.click(),
  );
  expect(onAttach).toHaveBeenCalledExactlyOnceWith([sources[0]]);
  expect(onOpenSave).not.toHaveBeenCalled();
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Preview Reference 6"]')
      ?.click(),
  );
  await act(async () =>
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent === "Open Save")
      ?.click(),
  );
  expect(onOpenSave).toHaveBeenCalledExactlyOnceWith("save-5");
});

it("copies the exact fenced code and does not render it as executable HTML", async () => {
  const writeText = vi.spyOn(navigator.clipboard, "writeText");
  await act(async () =>
    root.render(
      <AssistantResponse
        content={'```html\n<script>alert("no")</script>\n```'}
        onOpenSave={vi.fn()}
      />,
    ),
  );
  expect(host.querySelector("script")).toBeNull();
  expect(host.textContent).toContain("html");
  const copy = host.querySelector<HTMLButtonElement>(
    '[aria-label="Copy Code"]',
  );
  if (!copy) {
    throw new Error("Missing Copy Code");
  }
  await userEvent.click(copy);
  expect(writeText).toHaveBeenCalledExactlyOnceWith(
    '<script>alert("no")</script>\n',
  );
  await vi.waitFor(() => {
    expect(host.textContent).toContain("Copied");
  });
});

it("opens a verified citation directly without an intermediate dialog", async () => {
  const onOpenSave = vi.fn();
  await act(async () =>
    root.render(
      <AssistantResponse
        content="Read [invented](#save-1)."
        sources={sources}
        onOpenSave={onOpenSave}
      />,
    ),
  );
  expect(host.textContent).not.toContain("invented");
  await act(async () =>
    host.querySelector<HTMLButtonElement>("button")?.click(),
  );
  expect(onOpenSave).toHaveBeenCalledExactlyOnceWith("save-0");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("keeps numbered citations compact and opens the corresponding Save", async () => {
  const onOpenSave = vi.fn();
  await act(async () =>
    root.render(
      <AssistantResponse
        content="The references share a palette [1, 2]."
        sources={sources}
        onOpenSave={onOpenSave}
      />,
    ),
  );
  const buttons = [...host.querySelectorAll("button")];
  expect(buttons.map((button) => button.textContent)).toEqual(["1", "2"]);
  await act(async () => buttons[1]?.click());
  expect(onOpenSave).toHaveBeenCalledExactlyOnceWith("save-1");
});

it("uses a bounded text fallback instead of fetching a remote image", async () => {
  await act(async () =>
    root.render(
      <ConsultedSaves
        saveIds={["note"]}
        sources={[
          {
            id: "note",
            title: "Notes",
            url: "https://example.com",
            source: "local",
            notes:
              String.raw`<img src="https://example.com/tracker">A note\nwith texture. ` +
              "x".repeat(500),
          },
        ]}
        onOpenSave={vi.fn()}
        onAttach={vi.fn()}
      />,
    ),
  );
  expect(host.querySelector("img")).toBeNull();
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Preview Notes"]')
      ?.click(),
  );
  const preview = document.querySelector('[role="dialog"]');
  expect(preview?.textContent).toContain("A note with texture.");
  expect(preview?.textContent?.length).toBeLessThan(260);
});
