import { isHTMLTag } from "@pond/ui/dom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AddMenu } from "./add-menu";

const query = vi.fn();
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("pond", { query });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  query.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function choose(label: string) {
  const trigger = host.querySelector('button[aria-label="Add"]');
  if (!isHTMLTag(trigger, "button")) {
    throw new Error("Missing Add button");
  }
  await act(async () => trigger.click());
  const item = [
    ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ].find((node) => node.textContent?.includes(label));
  if (!item) {
    throw new Error(`Missing ${label} item`);
  }
  await act(async () => item.click());
}

it("attaches selected local files without importing Saves", async () => {
  const file = {
    id: "file-1",
    name: "reference.pdf",
    mediaType: "application/pdf",
    size: 1024,
  };
  query.mockResolvedValueOnce({ ok: true, files: [file] });
  const attach = vi.fn();
  await act(async () =>
    root.render(<AddMenu onAttach={attach} onAddSaves={vi.fn()} />),
  );

  await choose("Add Files");

  expect(query).toHaveBeenCalledExactlyOnceWith("agent.pickAttachments", {});
  expect(attach).toHaveBeenCalledExactlyOnceWith([file]);
});

it("does nothing when the file picker is cancelled", async () => {
  query.mockResolvedValue({ ok: true, files: [] });
  const attach = vi.fn();
  await act(async () =>
    root.render(<AddMenu onAttach={attach} onAddSaves={vi.fn()} />),
  );

  await choose("Add Files");

  expect(query).toHaveBeenCalledExactlyOnceWith("agent.pickAttachments", {});
  expect(attach).not.toHaveBeenCalled();
});

it("opens the Save search from Add Saves", async () => {
  const addSaves = vi.fn();
  await act(async () =>
    root.render(<AddMenu onAttach={vi.fn()} onAddSaves={addSaves} />),
  );

  await choose("Add Saves");

  expect(addSaves).toHaveBeenCalledOnce();
  expect(query).not.toHaveBeenCalled();
});
