import { isHTMLTag } from "@pond/ui/dom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { bridge } from "@/shared/test/pond-bridge";
import { AddMenu } from "./add-menu";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
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
  bridge.use({
    query: { "agent.pickAttachments": () => ({ ok: true, files: [file] }) },
  });
  const attach = vi.fn();
  await act(async () =>
    root.render(<AddMenu onAttach={attach} onAddSaves={vi.fn()} />),
  );

  await choose("Add Files");

  expect(window.pond.query).toHaveBeenCalledExactlyOnceWith(
    "agent.pickAttachments",
    {},
  );
  expect(attach).toHaveBeenCalledExactlyOnceWith([file]);
});

it("does nothing when the file picker is cancelled", async () => {
  bridge.use({
    query: { "agent.pickAttachments": () => ({ ok: true, files: [] }) },
  });
  const attach = vi.fn();
  await act(async () =>
    root.render(<AddMenu onAttach={attach} onAddSaves={vi.fn()} />),
  );

  await choose("Add Files");

  expect(window.pond.query).toHaveBeenCalledExactlyOnceWith(
    "agent.pickAttachments",
    {},
  );
  expect(attach).not.toHaveBeenCalled();
});

it("opens the Save search from Add Saves", async () => {
  const addSaves = vi.fn();
  await act(async () =>
    root.render(<AddMenu onAttach={vi.fn()} onAddSaves={addSaves} />),
  );

  await choose("Add Saves");

  expect(addSaves).toHaveBeenCalledOnce();
  expect(window.pond.query).not.toHaveBeenCalled();
});
