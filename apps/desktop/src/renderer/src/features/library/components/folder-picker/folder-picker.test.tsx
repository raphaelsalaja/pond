import "@/app/effects/save-library-bridge";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { closeFolderPicker, openFolderPicker } from "../../state/folder-picker";
import { folders } from "../../state/folders";
import {
  createFolderSidebarHarness,
  folder,
  folderList,
  pondQuery,
} from "../folder-sidebar/test-harness";
import { FolderPickerHost } from ".";

const harness = createFolderSidebarHarness();
let host: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  await harness.setup();
  folderList.current = [
    folder("Alpha"),
    folder("Beta"),
    folder("Child", "Alpha"),
  ];
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
  await harness.cleanup();
});
function control(label: string) {
  const element = document.querySelector<HTMLElement>(
    `[aria-label="${label}"]`,
  );
  if (!element) throw new Error(`Missing control ${label}`);
  return element;
}

it("shows the folder tree and assigns a folder as soon as it is picked", async () => {
  expect(control("Add to Folders").getAttribute("role")).toBe("dialog");
  expect(control("Child").getAttribute("aria-level")).toBe("2");
  await act(async () => control("Beta").click());
  expect(pondQuery).toHaveBeenCalledWith("folders.assign", {
    saveIds: ["save-1"],
    addIds: ["Beta"],
    removeIds: [],
  });
});

it("creates a folder from the search", async () => {
  const search = document.querySelector<HTMLInputElement>(
    'input[aria-label="Search Folders"]',
  );
  if (!search) throw new Error("Missing search");
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
  if (!create) throw new Error("Missing Create row");
  await act(async () => create.click());
  await vi.waitFor(() =>
    expect(pondQuery).toHaveBeenCalledWith("folders.create", {
      name: "Moodboards",
    }),
  );
});
