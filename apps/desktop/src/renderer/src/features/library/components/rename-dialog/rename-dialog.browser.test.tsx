import { isHTMLTag } from "@pond/ui/dom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  closeRenameDialog,
  openRenameDialog,
} from "@/features/library/state/rename-dialog";
import { RenameDialogHost } from "./host";

let root: Root;
let host: HTMLDivElement;
const query = vi.fn(async (name: string) => {
  if (name === "saves.batchRename") {
    return { ok: true, renamed: 2 };
  }
  if (name === "saves.getMany") {
    return ["IMG_2041", "IMG_2042"].map((title) => ({
      id: `save-${title}`,
      source: "local",
      sourceId: title,
      url: `file:///${title}.png`,
      title,
      status: "complete",
    }));
  }
  return [];
});

beforeEach(() => {
  query.mockClear();
  vi.stubGlobal("pond", { query });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    closeRenameDialog();
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
});

async function openDialog() {
  await act(async () => {
    openRenameDialog(["save-IMG_2041", "save-IMG_2042"]);
    root.render(<RenameDialogHost />);
  });
  await vi.waitFor(
    () => {
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
        "IMG_2042",
      );
    },
    { timeout: 5000 },
  );
}

function button(label: string) {
  const match = [...document.querySelectorAll("button")].find(
    (node) => node.textContent === label || node.ariaLabel === label,
  );
  if (!match) {
    throw new Error(`Missing ${label} button`);
  }
  return match;
}

function previewNames() {
  return [...document.querySelectorAll("tbody tr")].map(
    (row) => row.lastElementChild?.textContent,
  );
}

async function fill(label: string, value: string) {
  const labelNode = [...document.querySelectorAll("label")].find(
    (node) => node.textContent === label,
  );
  const input = labelNode?.htmlFor
    ? document.getElementById(labelNode.htmlFor)
    : null;
  if (!isHTMLTag(input, "input")) {
    throw new Error(`Missing ${label}`);
  }
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("previews and applies a numbered format", async () => {
  await openDialog();
  expect(document.querySelector("h2")?.textContent).toBe("Rename 2 Saves");
  expect(previewNames()).toEqual(["IMG_2041 1", "IMG_2042 2"]);

  await fill("Start Numbering At", "7");
  expect(previewNames()).toEqual(["IMG_2041 7", "IMG_2042 8"]);

  await act(async () => button("Rename").click());

  expect(query).toHaveBeenCalledWith("saves.batchRename", {
    ids: ["save-IMG_2041", "save-IMG_2042"],
    pattern: "{title} {n}",
    start: 7,
    replacement: null,
    textCase: null,
  });
  await vi.waitFor(() => {
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});

it("replaces literal text and changes case", async () => {
  await openDialog();
  await act(async () => button("Replace Text").click());
  await fill("Find", "IMG_");
  await fill("Replace With", "Trip-");
  expect(previewNames()).toEqual(["Trip-2041", "Trip-2042"]);

  await act(async () => button("Lowercase").click());
  expect(previewNames()).toEqual(["trip-2041", "trip-2042"]);

  await act(async () => button("Rename").click());
  expect(query).toHaveBeenCalledWith("saves.batchRename", {
    ids: ["save-IMG_2041", "save-IMG_2042"],
    pattern: "{title}",
    start: undefined,
    replacement: { find: "IMG_", replace: "Trip-", flags: "g" },
    textCase: "lower",
  });
});
