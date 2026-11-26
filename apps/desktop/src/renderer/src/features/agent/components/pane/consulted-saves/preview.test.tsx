import { Popover } from "@pond/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { SavePreview } from ".";

function previewButton(label: string) {
  return [...document.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === label,
  );
}

it("closes the preview after choosing Open Save", async () => {
  const onOpenSave = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <Popover.Root defaultOpen>
          <Popover.Trigger>Preview</Popover.Trigger>
          <SavePreview
            item={{ id: "one", title: "One" }}
            sources={[]}
            attachedIds={[]}
            onOpenSave={onOpenSave}
            onAttach={vi.fn()}
          />
        </Popover.Root>,
      ),
    );
    const open = await vi.waitFor(() => {
      const button = previewButton("Open Save");
      if (!button) throw new Error("Missing Open Save");
      return button;
    });
    await act(async () => open.click());
    expect(onOpenSave).toHaveBeenCalledExactlyOnceWith("one");
    expect(previewButton("Open Save")).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("closes the preview after choosing Add to message", async () => {
  const onAttach = vi.fn();
  const source = {
    id: "one",
    title: "One",
    url: "https://example.com/one",
    source: "web",
  };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <Popover.Root defaultOpen>
          <Popover.Trigger>Preview</Popover.Trigger>
          <SavePreview
            item={{ id: "one", title: "One" }}
            sources={[source]}
            attachedIds={[]}
            onOpenSave={vi.fn()}
            onAttach={onAttach}
          />
        </Popover.Root>,
      ),
    );
    const add = await vi.waitFor(() => {
      const button = previewButton("Add to message");
      if (!button) throw new Error("Missing Add to message");
      return button;
    });
    await act(async () => add.click());
    expect(onAttach).toHaveBeenCalledExactlyOnceWith([source]);
    expect(previewButton("Add to message")).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
