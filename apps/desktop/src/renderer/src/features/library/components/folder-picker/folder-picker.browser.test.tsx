import "@/app/effects/save-library-bridge";
import type { QueryInput } from "@shared/query-contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { bridge } from "@/shared/test/pond-bridge";
import { FolderPickerHost } from ".";
import { closeFolderPicker, openFolderPicker } from "../../state/folder-picker";
import { folders } from "../../state/folders";
import {
  createFolderSidebarHarness,
  folder,
} from "../folder-sidebar/test-harness";

const RECENT_KEY = "pond:recent-folder-destinations";
const harness = createFolderSidebarHarness();
let host: HTMLDivElement;
let root: Root;
let assigned: Array<QueryInput<"folders.assign">>;
beforeEach(async () => {
  await harness.setup();
  harness.set({
    folders: [folder("Alpha"), folder("Beta"), folder("Child", "Alpha")],
  });
  assigned = [];
  bridge.use({
    query: {
      "folders.assign": (input) => {
        assigned.push(input);
        return { ok: true, undoId: null };
      },
    },
  });
  await folders.refresh();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    openFolderPicker(["save-1"]);
    root.render(<FolderPickerHost />);
  });
});
afterEach(async () => {
  await act(async () => {
    closeFolderPicker();
    root.unmount();
  });
  host.remove();
  localStorage.removeItem(RECENT_KEY);
  await harness.cleanup();
});
function control(label: string) {
  const element = document.querySelector<HTMLElement>(
    `[aria-label="${label}"]`,
  );
  if (!element) {
    throw new Error(`Missing control ${label}`);
  }
  return element;
}

it("shows the folder tree and assigns a folder as soon as it is picked", async () => {
  expect(control("Add to Folders").getAttribute("role")).toBe("dialog");
  expect(control("Child").getAttribute("aria-level")).toBe("2");
  await act(async () => control("Beta").click());
  expect(window.pond.query).toHaveBeenCalledWith("folders.assign", {
    saveIds: ["save-1"],
    addIds: ["Beta"],
    removeIds: [],
  });
});

it("creates a folder from the search", async () => {
  const created = Promise.withResolvers<QueryInput<"folders.create">>();
  bridge.use({
    query: {
      "folders.create": (input) => {
        created.resolve(input);
        return folder(input.name, input.parentId ?? null);
      },
    },
  });
  const search = document.querySelector<HTMLInputElement>(
    'input[aria-label="Search Folders"]',
  );
  if (!search) {
    throw new Error("Missing search");
  }
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setValue?.call(search, "Moodboards");
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const create = [
    ...document.querySelectorAll<HTMLElement>('[role="option"]'),
  ].find((node) => node.textContent?.includes("Moodboards"));
  if (!create) {
    throw new Error("Missing Create row");
  }
  await act(async () => create.click());
  expect(await created.promise).toEqual({ name: "Moodboards" });
});

async function reopen(mode: "multiple" | "recent") {
  await act(async () => closeFolderPicker());
  await act(async () => openFolderPicker(["save-1"], mode));
}

function search() {
  const input = document.querySelector<HTMLInputElement>(
    'input[aria-label="Search Folders"]',
  );
  if (!input) {
    throw new Error("Missing search");
  }
  return input;
}

async function key(target: Element, init: KeyboardEventInit) {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
  });
}

it("adds to a recent folder by its number", async () => {
  localStorage.setItem(RECENT_KEY, "Beta\nAlpha");
  await reopen("recent");
  expect(control("Add to Recent Folder").getAttribute("role")).toBe("dialog");
  await key(control("Recent Folders"), { key: "2" });
  expect(window.pond.query).toHaveBeenCalledWith("folders.assign", {
    saveIds: ["save-1"],
    addIds: ["Alpha"],
    removeIds: [],
  });
});

it("opens every folder from the recent picker", async () => {
  await reopen("recent");
  const all = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "All Folders",
  );
  if (!all) {
    throw new Error("Missing All Folders");
  }
  await act(async () => all.click());
  expect(control("Add to Folders").getAttribute("role")).toBe("dialog");
});

it("stages folders and applies them together from the keyboard", async () => {
  await reopen("multiple");
  expect(control("Add to Multiple Folders").getAttribute("role")).toBe(
    "dialog",
  );
  await act(async () => control("Alpha").click());
  await act(async () => control("Beta").click());
  expect(assigned).toEqual([]);
  const apply = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Add to 2 Folders",
  );
  expect(apply?.tabIndex).toBe(0);
  await key(search(), { key: "Enter", metaKey: true });
  expect(assigned).toEqual([
    { saveIds: ["save-1"], addIds: ["Alpha", "Beta"], removeIds: [] },
  ]);
});

it("leaves staging on Escape without closing the picker", async () => {
  const start = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Select Multiple",
  );
  if (!start) {
    throw new Error("Missing Select Multiple");
  }
  await act(async () => start.click());
  expect(control("Add to Multiple Folders").getAttribute("role")).toBe(
    "dialog",
  );
  await act(async () => control("Beta").click());
  await key(search(), { key: "Escape" });
  expect(control("Add to Folders").getAttribute("role")).toBe("dialog");
  expect(assigned).toEqual([]);
});
