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
import {
  closeSnoozeDialog,
  useSnoozeDialog,
} from "@/features/saves/state/snooze-dialog";
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

interface EditInput {
  ids?: readonly string[];
  operation?: { kind: string; state?: string | null };
}

function SnoozeProbe() {
  const dialog = useSnoozeDialog();
  return <output data-snooze={dialog?.saveIds.join(",") ?? ""} />;
}

describe("Inbox hotkeys", () => {
  let host: HTMLDivElement;
  let root: Root;
  const edits: EditInput[] = [];

  function snoozing(): string | null {
    return (
      host.querySelector("[data-snooze]")?.getAttribute("data-snooze") ?? null
    );
  }

  async function press(key: string) {
    const target = host.querySelector<HTMLElement>("[data-save-collection]");
    if (!target) throw new Error("Missing collection");
    target.focus();
    await act(async () => {
      target.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          code: `Key${key.toUpperCase()}`,
          bubbles: true,
          cancelable: true,
        }),
      );
      await Promise.resolve();
    });
  }

  beforeEach(async () => {
    edits.length = 0;
    configureShortcuts({ profile: "pond", overrides: {} });
    vi.stubGlobal("pond", {
      query: async (name: string, input: EditInput) => {
        if (name === "saves.bulkEdit") edits.push(input);
        return { changed: input.ids?.length ?? 0 };
      },
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    pool.clear();
    clearSaveSelection();
    pool.upsert(save("waiting", [image("a.jpg")], { inboxState: "review" }));
    pool.upsert(save("library", [image("b.jpg")]));
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
          <SnoozeProbe />
        </HotkeysProvider>,
      );
    });
  });

  afterEach(async () => {
    closeSnoozeDialog();
    await act(async () => root.unmount());
    host.remove();
    pool.clear();
    clearSaveSelection();
    vi.unstubAllGlobals();
  });

  it("binds P and H without colliding in either profile", () => {
    expect(shortcutGlyphs("save.mark-processed")).toEqual(["P"]);
    expect(shortcutGlyphs("save.snooze")).toEqual(["H"]);
    for (const profile of ["pond", "eagle"] as const) {
      const preferences = { profile, overrides: {} };
      expect(
        shortcutConflict("save.mark-processed", "P", preferences),
      ).toBeNull();
      expect(shortcutConflict("save.snooze", "H", preferences)).toBeNull();
    }
  });

  it("marks only Saves waiting in the Inbox processed", async () => {
    await act(async () => selectOnlySave("library"));
    await press("p");
    expect(edits).toEqual([]);

    await act(async () => {
      selection.set(["waiting", "library"]);
      primarySelection.set("waiting");
    });
    await press("p");
    expect(edits).toEqual([
      { ids: ["waiting"], operation: { kind: "inbox", state: "processed" } },
    ]);
  });

  it("follows the primary Save when the viewer has moved past the selection", async () => {
    await act(async () => {
      selection.set(["library"]);
      primarySelection.set("waiting");
    });
    await press("p");
    expect(edits).toEqual([
      { ids: ["waiting"], operation: { kind: "inbox", state: "processed" } },
    ]);
  });

  it("opens the snooze picker for a waiting Save", async () => {
    await act(async () => selectOnlySave("library"));
    await press("h");
    expect(snoozing()).toBe("");

    await act(async () => selectOnlySave("waiting"));
    await press("h");
    expect(snoozing()).toBe("waiting");
  });
});
