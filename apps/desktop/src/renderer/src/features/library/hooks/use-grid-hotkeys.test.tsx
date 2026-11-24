import "@/app/effects/save-library-bridge";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { act, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { selectOnlySave } from "@/features/saves";
import { normalise, SavePatchSchema } from "@/features/saves/lib/reconcile";
import {
  primarySelection,
  resultNavigation,
  selection,
} from "@/features/saves/navigation";
import { pool } from "@/features/saves/pool";
import { useGridHotkeys } from "./use-grid-hotkeys";

const allIds = ["A", "B", "C", "D", "E", "F"];

function Gallery({
  initialIds = allIds,
  resolveIds,
  loadPages = true,
}: {
  initialIds?: Array<string>;
  resolveIds?: () => Promise<Array<string>>;
  loadPages?: boolean;
}) {
  const [ids, setIds] = useState(initialIds);
  const loaded = useRef(ids);
  useLayoutEffect(() => {
    loaded.current = ids;
  });
  const collection = useRef<HTMLDivElement>(null);
  useGridHotkeys(ids);
  useLayoutEffect(() => {
    resultNavigation.setSource({
      key: "test-gallery",
      ids,
      total: allIds.length,
      loadedIds: () => loaded.current,
      allIds: resolveIds ?? (async () => allIds),
      loadMore: async () => {
        if (!loadPages) {
          return;
        }
        loaded.current = allIds;
        setIds(allIds);
      },
    });
    return resultNavigation.setLayout(
      ids.map((id, index) => ({
        id,
        left: (index % 2) * 100,
        top: Math.floor(index / 2) * 100,
        width: 90,
        height: 90,
      })),
    );
  }, [ids, loadPages, resolveIds]);
  useLayoutEffect(
    () =>
      resultNavigation.registerReveal((id) => {
        if (!loaded.current.includes(id)) {
          return;
        }
        if (resultNavigation.shouldFocus()) {
          collection.current?.focus();
        }
        resultNavigation.didReveal(id);
      }),
    [],
  );
  return (
    <div
      ref={collection}
      tabIndex={0}
      data-save-collection=""
      role="listbox"
      aria-label="Test Saves"
    >
      {ids.map((id) => (
        <span
          key={id}
          role="option"
          tabIndex={-1}
          aria-selected={selection.has(id)}
        >
          {id}
        </span>
      ))}
    </div>
  );
}

async function press(key: string, options: KeyboardEventInit = {}) {
  await act(async () => {
    (document.activeElement ?? document).dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        ...options,
      }),
    );
  });
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function lookupNotPending() {
  throw new Error("Lookup is not pending");
}

describe("gallery keyboard interaction", () => {
  let host: HTMLDivElement;
  let root: Root;
  function collection() {
    const element = host.querySelector<HTMLElement>("[data-save-collection]");
    if (!element) {
      throw new Error("Missing collection");
    }
    return element;
  }
  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    selection.clear();
    primarySelection.set(null);
    for (const id of allIds) {
      const save = normalise(
        SavePatchSchema.parse({ id, url: `https://example.com/${id}` }),
      );
      if (!save) {
        throw new Error("Invalid Save fixture");
      }
      pool.upsert(save);
    }
  });
  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    resultNavigation.setSource({ key: "empty", ids: [] });
    selection.clear();
    primarySelection.set(null);
    pool.clear();
  });
  async function mount(initialIds = allIds) {
    await act(async () => {
      root.render(
        <HotkeysProvider>
          <Gallery initialIds={initialIds} />
        </HotkeysProvider>,
      );
    });
    collection().focus();
  }
  it("extends into the next loaded page and opens the range endpoint", async () => {
    await mount(["A", "B"]);
    selectOnlySave("B");
    await press("ArrowDown", { shiftKey: true });
    expect(selection.snapshot()).toEqual(["B", "C", "D"]);
    expect(selection.getAnchor()).toBe("B");
    expect(selection.getCursor()).toBe("D");
    expect(document.activeElement).toBe(collection());
    await press("Enter");
    expect(primarySelection.get()).toBe("D");
    await press("ArrowUp", { shiftKey: true });
    expect(selection.snapshot()).toEqual(["B"]);
    expect(selection.getCursor()).toBe("B");
  });
  it("does not navigate or clear Saves while another pane or a dialog owns focus", async () => {
    await mount();
    selectOnlySave("A");
    const other = document.createElement("button");
    host.append(other);
    other.focus();
    await press("ArrowDown");
    await press("Escape");
    expect(selection.snapshot()).toEqual(["A"]);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    host.append(dialog);
    collection().focus();
    await press("ArrowRight");
    expect(selection.getCursor()).toBe("A");
  });
  it("abandons an asynchronous range lookup after focus moves to another pane", async () => {
    let calls = 0;
    let finish: (ids: Array<string>) => void = lookupNotPending;
    const pending = new Promise<Array<string>>((resolve) => {
      finish = resolve;
    });
    const resolveIds = () =>
      ++calls === 1 ? Promise.resolve(allIds) : pending;
    await act(async () => {
      root.render(
        <HotkeysProvider>
          <Gallery
            initialIds={["A", "B"]}
            resolveIds={resolveIds}
            loadPages={false}
          />
        </HotkeysProvider>,
      );
    });
    collection().focus();
    selectOnlySave("B");
    await press("ArrowRight", { shiftKey: true });
    expect(calls).toBe(2);
    const other = document.createElement("button");
    host.append(other);
    other.focus();
    await act(async () => {
      finish(allIds);
      await pending;
    });
    expect(selection.snapshot()).toEqual(["B"]);
    expect(document.activeElement).toBe(other);
  });
  it("moves the cursor independently and toggles noncontiguous Saves from the keyboard", async () => {
    await mount();
    selectOnlySave("A");
    await press("ArrowRight", { altKey: true });
    expect(selection.snapshot()).toEqual(["A"]);
    expect(selection.getCursor()).toBe("B");
    await press(" ", { shiftKey: true });
    expect(selection.snapshot()).toEqual(["A", "B"]);
    await press("ArrowDown", { altKey: true });
    expect(selection.getCursor()).toBe("D");
    expect(selection.snapshot()).toEqual(["A", "B"]);
    await press(" ", { shiftKey: true });
    expect(selection.snapshot()).toEqual(["A", "B", "D"]);
    await press(" ", { shiftKey: true });
    expect(selection.snapshot()).toEqual(["A", "B"]);
    expect(selection.getCursor()).toBe("D");
  });
  it("does not move the gallery cursor while typing in a field", async () => {
    await mount();
    selectOnlySave("A");
    const input = document.createElement("input");
    host.append(input);
    input.focus();
    await press("ArrowRight");
    await press("Enter");
    expect(selection.getCursor()).toBe("A");
    expect(primarySelection.get()).toBe("A");
  });

  it("selects every matching result from a partially loaded gallery", async () => {
    await mount(["A", "B"]);
    selectOnlySave("B");
    await press("a", { metaKey: true });
    expect(selection.snapshot()).toEqual(allIds);
    expect(selection.getCursor()).toBe("B");
    expect(pool.snapshot()).toHaveLength(6);
  });
});
