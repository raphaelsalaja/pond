import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InspectorTextField } from ".";
import type { InspectorDrafts } from ".";

let host: HTMLDivElement;
let root: Root;
let drafts: InspectorDrafts;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  drafts = new Map();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function render(
  key: string,
  value: string | null,
  commit: (value: string) => Promise<void>,
) {
  await act(async () =>
    root.render(
      <InspectorTextField
        key={key}
        drafts={drafts}
        cacheKey={key}
        label="Notes"
        multiline
        value={value}
        commit={commit}
      />,
    ),
  );
}
function field() {
  const node = host.querySelector("textarea");
  if (!node) {
    throw new Error("Missing notes field");
  }
  return node;
}
async function fill(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set?.call(field(), value);
    field().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function blur() {
  await act(async () => {
    field().dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

it("grows multiline inspector fields with their content", async () => {
  await render(
    "a",
    "Notes",
    vi.fn(async (_value: string) => {}),
  );
  expect(field().dataset.sizing).toBe("content");
});

it("does not replace mixed notes until edited, then commits only the bound targets", async () => {
  const first = vi.fn(async (_value: string) => {});
  const second = vi.fn(async (_value: string) => {});
  await render("a,b", null, first);
  expect(field().placeholder).toBe("Multiple notes");
  await blur();
  expect(first).not.toHaveBeenCalled();
  await fill("Shared notes");
  await blur();
  await render("c", "Other note", second);
  expect(first).toHaveBeenCalledExactlyOnceWith("Shared notes");
  expect(second).not.toHaveBeenCalled();
  expect(field().value).toBe("Other note");
});

it("retains failed notes across selection changes and retries the original value", async () => {
  let fail = true;
  const commit = vi.fn(async (_value: string) => {
    if (fail) {
      throw new Error("Disk full");
    }
  });
  await render("a", "Original", commit);
  await fill("Keep this draft");
  await blur();
  expect(host.textContent).toContain("Couldn't save changes. Try again.");
  await render("b", "Different", async () => {});
  await render("a", "Original", commit);
  expect(field().value).toBe("Keep this draft");
  fail = false;
  await act(async () => host.querySelector("button")?.click());
  expect(commit).toHaveBeenCalledTimes(2);
  expect(commit).toHaveBeenLastCalledWith("Keep this draft");
  expect(drafts.size).toBe(0);
});

it("cancels a draft with Escape without writing", async () => {
  const commit = vi.fn(async (_value: string) => {});
  await render("a", "Original", commit);
  await fill("Discard this");
  await act(async () => {
    field().focus();
    field().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect(field().value).toBe("Original");
  expect(commit).not.toHaveBeenCalled();
});

it("keeps a single-line field open on Enter while text is composing", async () => {
  const commit = vi.fn(async (_value: string) => {});
  await act(async () =>
    root.render(
      <InspectorTextField
        drafts={drafts}
        cacheKey="title"
        label="Title"
        value="Trip"
        commit={commit}
      />,
    ),
  );
  const input = host.querySelector("input");
  if (!input) {
    throw new Error("Missing title field");
  }
  const press = (isComposing: boolean) =>
    act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          isComposing,
        }),
      );
    });
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, "旅行");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  await press(true);
  expect(document.activeElement).toBe(input);
  expect(commit).not.toHaveBeenCalled();

  await press(false);
  expect(document.activeElement).not.toBe(input);
  expect(commit).toHaveBeenCalledExactlyOnceWith("旅行");
});

it("clamps long text behind Read More until expanded", async () => {
  const scroll = vi
    .spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get")
    .mockReturnValue(200);
  await act(async () =>
    root.render(
      <InspectorTextField
        drafts={drafts}
        cacheKey="description"
        label="Description"
        multiline
        clamp={4}
        value="A long description"
        commit={async () => {}}
      />,
    ),
  );
  const more = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Read More",
  );
  expect(host.firstElementChild?.hasAttribute("data-clamped")).toBe(true);
  expect(more).toBeDefined();

  await act(async () => more?.click());

  expect(host.firstElementChild?.hasAttribute("data-clamped")).toBe(false);
  expect(host.textContent).not.toContain("Read More");
  scroll.mockRestore();
});
