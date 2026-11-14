import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSaveSelection,
  selectOnlySave,
} from "@/features/saves/lib/select";
import { pool } from "@/features/saves/state/pool";
import { resultNavigation } from "@/features/saves/state/result-navigation";
import { primarySelection, selection } from "@/features/saves/state/selection";
import type { Save, SaveFile } from "@/features/saves/types";
import {
  bindingKeys,
  configureShortcuts,
  resolveShortcuts,
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

interface TriageInput {
  ids?: readonly string[];
}

describe("Triage hotkeys", () => {
  let host: HTMLDivElement;
  let root: Root;
  const calls: Array<{ name: string; input: TriageInput }> = [];

  function collection(): HTMLElement {
    const element = host.querySelector<HTMLElement>("[data-save-collection]");
    if (!element) throw new Error("Missing collection");
    return element;
  }

  async function press(key: string, init: KeyboardEventInit = {}) {
    await act(async () => {
      collection().dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          code: `Key${key.toUpperCase()}`,
          bubbles: true,
          cancelable: true,
          ...init,
        }),
      );
      await Promise.resolve();
    });
  }

  beforeEach(async () => {
    calls.length = 0;
    configureShortcuts({ profile: "pond", overrides: {} });
    document.documentElement.setAttribute("data-reduce-motion", "true");
    vi.stubGlobal("pond", {
      query: async (name: string, input: TriageInput) => {
        calls.push({ name, input });
        if (name === "saves.bulkEdit")
          return { changed: input.ids?.length ?? 0, undoId: "step-1" };
        return [];
      },
    });
    pool.clear();
    clearSaveSelection();
    for (const id of ["a", "b", "c"]) pool.upsert(save(id, [image(id)]));
    resultNavigation.setSource({ key: "triage", ids: ["a", "b", "c"] });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
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
    await act(async () => selectOnlySave("a"));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    resultNavigation.setSource({ ids: [] });
    document.documentElement.removeAttribute("data-reduce-motion");
    pool.clear();
    clearSaveSelection();
    vi.unstubAllGlobals();
  });

  it("binds triage actions without colliding in either profile", () => {
    const ids = [
      "save.add-to-recent-folder",
      "save.assign-multiple-folders",
      "save.favorite",
      "save.skip",
      "save.skip-back",
    ] as const;
    for (const profile of ["pond", "eagle"] as const) {
      const preferences = { profile, overrides: {} };
      const bindings = resolveShortcuts(preferences);
      for (const id of ids)
        expect(
          shortcutConflict(id, bindingKeys(bindings, id), preferences),
        ).toBeNull();
    }
  });

  it("skips forward and back without editing the Save", async () => {
    const primary = (id: string) =>
      vi.waitFor(() => expect(primarySelection.get()).toBe(id));
    await press("j");
    await primary("b");
    await press("j");
    await primary("c");
    await press("j");
    await primary("c");
    await press("k");
    await primary("b");
    expect(calls.filter((call) => call.name === "saves.bulkEdit")).toEqual([]);
    expect(pool.get("a")).toEqual(save("a", [image("a")]));
  });

  it("toggles Favorite for the selection with one change", async () => {
    await act(async () => {
      selection.set(["a", "b"]);
      primarySelection.set("a");
    });
    await press("F", { shiftKey: true });
    expect(calls).toEqual([
      {
        name: "saves.bulkEdit",
        input: {
          ids: ["a", "b"],
          operation: { kind: "favorite", favorite: true },
        },
      },
    ]);
    expect(pool.get("b")?.favorite).toBe(true);

    calls.length = 0;
    await press("F", { shiftKey: true });
    expect(calls).toEqual([
      {
        name: "saves.bulkEdit",
        input: {
          ids: ["a", "b"],
          operation: { kind: "favorite", favorite: false },
        },
      },
    ]);
  });

  it("moves the open Save to Trash without asking", async () => {
    const edits = () => calls.filter((call) => call.name === "saves.bulkEdit");
    await press("Backspace", { code: "Backspace" });
    await vi.waitFor(() => expect(edits()).toHaveLength(1));
    expect(edits()).toEqual([
      {
        name: "saves.bulkEdit",
        input: { ids: ["a"], operation: { kind: "trash" } },
      },
    ]);
  });
});
