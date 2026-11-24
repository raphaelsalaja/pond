import "@/app/effects/save-library-bridge";
import { PrefsSchema } from "@pond/schema";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { SaveHotkeys } from "@/features/saves/effects/save-hotkeys";
import { openTagPicker } from "@/features/saves/lib/actions";
import { normalise, SavePatchSchema } from "@/features/saves/lib/reconcile";
import { selectOnlySave } from "@/features/saves/lib/select";
import { pool } from "@/features/saves/state/pool";
import { primarySelection, selection } from "@/features/saves/state/selection";
import { closeSaveTagPicker } from "@/features/saves/state/tag-picker";
import type { Save } from "@/features/saves/types";
import { bridge } from "@/shared/test/pond-bridge";
import { SaveTagPickerHost } from ".";
import { SaveContextMenu } from "../context-menu";

function save(id: string, tags: Array<string> = []): Save {
  const row = normalise(
    SavePatchSchema.parse({
      id,
      source: "local",
      title: "Reference",
      url: "https://example.test",
      tags,
    }),
  );
  if (!row) {
    throw new Error("Invalid Save fixture");
  }
  return row;
}

function tagSearch(): HTMLElement | null {
  return document.querySelector("[aria-label='Search Tags']");
}

function tagOption(name: string): HTMLElement {
  const option = document.querySelector<HTMLElement>(`[aria-label="${name}"]`);
  if (!option) {
    throw new Error(`Missing tag ${name}`);
  }
  return option;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  });
}

async function waitFor(read: () => HTMLElement | null, label: string) {
  const start = Date.now();
  let node = read();
  while (!node) {
    if (Date.now() - start > 2000) {
      throw new Error(`Missing ${label}`);
    }
    await settle();
    node = read();
  }
  return node;
}

async function openMenu(target: HTMLElement) {
  await act(async () => {
    target.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: 24,
        clientY: 24,
      }),
    );
  });
}

function menuItem(label: string): HTMLElement {
  const item = [
    ...document.querySelectorAll<HTMLElement>("[role='menuitem']"),
  ].find((node) => node.textContent?.includes(label));
  if (!item) {
    throw new Error(`Missing menu item ${label}`);
  }
  return item;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  bridge.use({
    query: {
      "tags.list": () => [
        {
          id: "design",
          name: "Design",
          starred: false,
          archived: false,
          description: null,
          lastUsedAt: null,
          usageCount: 2,
          createdAt: new Date(0),
        },
      ],
      "tagGroups.list": () => [],
      "settings.getPrefs": () => PrefsSchema.parse({}),
      "saves.listOpenWith": () => ({ apps: [] }),
      "saves.bulkEdit": () => ({ changed: 1, undoId: null }),
    },
  });
  pool.clear();
  selection.clear();
  primarySelection.set(null);
  closeSaveTagPicker();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  closeSaveTagPicker();
  selection.clear();
  primarySelection.set(null);
  pool.clear();
});

async function mount(row: Save) {
  pool.upsert(row);
  selectOnlySave(row.id);
  await act(async () => {
    root.render(
      <HotkeysProvider
        defaultOptions={{
          hotkey: { ignoreInputs: true },
          hotkeySequence: { ignoreInputs: true },
        }}
      >
        <SaveHotkeys />
        <SaveTagPickerHost />
        <div data-save-collection="">
          <button type="button" aria-label="Library">
            Library
          </button>
          <SaveContextMenu save={row}>
            <div data-save-id={row.id}>Reference</div>
          </SaveContextMenu>
        </div>
      </HotkeysProvider>,
    );
  });
}

function collection(): HTMLElement {
  const node = host.querySelector<HTMLElement>("[data-save-collection] button");
  if (!node) {
    throw new Error("Missing save collection");
  }
  return node;
}

it("opens a tag picker from Add Tags and assigns the chosen tag", async () => {
  const row = save("save-1");
  await mount(row);
  const card = host.querySelector<HTMLElement>("[data-save-id='save-1']");
  if (!card) {
    throw new Error("Missing save");
  }
  await openMenu(card);
  await act(async () => menuItem("Add Tags").click());
  await waitFor(tagSearch, "tag picker");
  await waitFor(
    () => document.querySelector("[aria-label='Design']"),
    "Design",
  );

  await act(async () => tagOption("Design").click());
  await settle();
  expect(pool.get("save-1")?.tags).toEqual(["Design"]);
  expect(window.pond.query).toHaveBeenCalledWith("saves.bulkEdit", {
    ids: ["save-1"],
    operation: { kind: "tags", tags: ["Design"], mode: "add" },
  });
  expect(tagSearch()).not.toBeNull();

  await act(async () => tagOption("Design").click());
  await settle();
  expect(pool.get("save-1")?.tags).toEqual([]);
  expect(window.pond.query).toHaveBeenCalledWith("saves.bulkEdit", {
    ids: ["save-1"],
    operation: { kind: "tags", tags: ["Design"], mode: "remove" },
  });
});

it("opens the same tag picker from the A shortcut", async () => {
  await mount(save("save-1"));
  const grid = collection();
  grid.focus();
  await act(async () => {
    grid.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "a",
        code: "KeyA",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await waitFor(tagSearch, "tag picker");
  await waitFor(
    () => document.querySelector("[aria-label='Design']"),
    "Design",
  );
});

it("does not open a tag picker when nothing is selected", async () => {
  await mount(save("save-1"));
  selection.clear();
  primarySelection.set(null);
  await act(async () => openTagPicker());
  await settle();
  expect(tagSearch()).toBeNull();
});
