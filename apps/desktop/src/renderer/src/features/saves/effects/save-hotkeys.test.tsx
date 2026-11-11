import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSaveSelection,
  selectOnlySave,
} from "@/features/saves/lib/select";
import { pool } from "@/features/saves/state/pool";
import { primarySelection, selection } from "@/features/saves/state/selection";
import type { Save, SaveFile } from "@/features/saves/types";
import {
  configureShortcuts,
  SHORTCUTS,
  shortcutConflict,
  shortcutGlyphs,
} from "@/shared/lib/shortcuts";
import { SaveHotkeys } from "./save-hotkeys";

function image(path: string): SaveFile {
  return {
    kind: "image",
    path,
    mimeType: "image/jpeg",
    sha256: path,
    size: 10,
  };
}

function save(
  id: string,
  files: SaveFile[],
  overrides: Partial<Save> = {},
): Save {
  return {
    id,
    source: "instagram",
    sourceId: id,
    url: `https://example.test/${id}`,
    title: id,
    description: null,
    author: null,
    notes: null,
    mediaUrl: null,
    mediaType: "image",
    files,
    tags: [],
    savedAt: 1,
    createdAt: 1,
    deletedAt: null,
    status: "complete",
    ...overrides,
  };
}

const carousel = save("carousel", [image("one.jpg"), image("two.jpg")]);
const single = save("single", [image("only.jpg")]);

describe("Split Into Saves hotkey", () => {
  let host: HTMLDivElement;
  let root: Root;
  const calls: Array<{ name: string; ids: readonly string[] }> = [];

  function collection(): HTMLElement {
    const element = host.querySelector<HTMLElement>("[data-save-collection]");
    if (!element) throw new Error("Missing collection");
    return element;
  }

  async function press(key: string, target: EventTarget = collection()) {
    await act(async () => {
      target.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
          bubbles: true,
          cancelable: true,
        }),
      );
      await Promise.resolve();
    });
  }

  beforeEach(() => {
    calls.length = 0;
    configureShortcuts({ profile: "pond", overrides: {} });
    vi.stubGlobal("pond", {
      query: async (name: string, input: { ids?: readonly string[] }) => {
        calls.push({ name, ids: input.ids ?? [] });
        return { ok: true, split: 1, created: 1 };
      },
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    pool.clear();
    clearSaveSelection();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    pool.clear();
    clearSaveSelection();
    vi.unstubAllGlobals();
  });

  async function mount() {
    await act(async () => {
      root.render(
        <HotkeysProvider>
          <div
            tabIndex={0}
            data-save-collection=""
            role="listbox"
            aria-label="Saves"
          >
            <SaveHotkeys />
          </div>
        </HotkeysProvider>,
      );
    });
    collection().focus();
  }

  it("registers S and splits the selection only when the command applies", async () => {
    expect(SHORTCUTS["save.split"]).toEqual({
      keys: "S",
      label: "Split Into Saves",
      group: "Saves",
    });
    expect(shortcutGlyphs("save.split")).toEqual(["S"]);
    for (const profile of ["pond", "eagle"] as const) {
      expect(
        shortcutConflict("save.split", "S", { profile, overrides: {} }),
      ).toBeNull();
    }

    pool.upsert(carousel);
    pool.upsert(single);
    await mount();

    await press("s");
    expect(calls).toEqual([]);

    await act(async () => selectOnlySave(single.id));
    await press("s");
    expect(calls).toEqual([]);

    await act(async () => {
      selection.set([carousel.id, single.id]);
      primarySelection.set(carousel.id);
    });
    await press("s");
    expect(calls).toEqual([
      { name: "saves.split", ids: [carousel.id, single.id] },
    ]);

    calls.length = 0;
    await act(async () => selectOnlySave(carousel.id));
    const field = document.createElement("input");
    collection().append(field);
    field.focus();
    await press("s", field);
    expect(calls).toEqual([]);

    field.remove();
    collection().focus();
    const outside = document.createElement("button");
    host.append(outside);
    outside.focus();
    await press("s", outside);
    expect(calls).toEqual([]);

    collection().focus();
    await act(async () => {
      pool.upsert(save(carousel.id, carousel.files, { deletedAt: 5 }));
    });
    await press("s");
    expect(calls).toEqual([]);

    await act(async () => {
      pool.upsert(save(carousel.id, carousel.files, { status: "ingesting" }));
    });
    await press("s");
    expect(calls).toEqual([]);

    await act(async () => {
      pool.upsert(carousel);
    });
    await press("s");
    expect(calls).toEqual([{ name: "saves.split", ids: [carousel.id] }]);
  });
});
