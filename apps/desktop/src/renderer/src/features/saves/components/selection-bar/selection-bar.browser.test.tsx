import { Tooltip } from "@pond/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearSaveSelection,
  clickSave,
  pickSave,
  selectOnlySave,
} from "@/features/saves/lib/select";
import { pool } from "@/features/saves/state/pool";
import { resultNavigation } from "@/features/saves/state/result-navigation";
import { selection } from "@/features/saves/state/selection";
import { libraryViewContext } from "@/features/saves/state/view-context";
import type { Save } from "@/features/saves/types";
import { configureShortcuts } from "@/shared/lib/shortcuts";
import { bridge } from "@/shared/test/pond-bridge";
import { SaveSelectionBar } from "./";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function save(id: string): Save {
  return {
    id,
    source: "local",
    sourceId: id,
    url: `https://example.test/${id}`,
    title: id,
    description: null,
    author: null,
    notes: null,
    mediaUrl: null,
    mediaType: "image",
    files: [],
    tags: [],
    savedAt: 1,
    createdAt: 1,
    deletedAt: null,
    status: "complete",
  };
}

const IDS = ["a", "b", "c"];

async function settle() {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

describe("Library selection toolbar", () => {
  let host: HTMLDivElement;
  let root: Root;

  function toolbar(): HTMLElement | null {
    return host.querySelector('[role="toolbar"][aria-label="Selected Saves"]');
  }

  function action(label: string): HTMLButtonElement {
    const button = toolbar()?.querySelector<HTMLButtonElement>(
      `button[aria-label="${label}"]`,
    );
    if (!button) {
      throw new Error(`Missing toolbar action ${label}`);
    }
    return button;
  }

  beforeEach(async () => {
    configureShortcuts({ profile: "pond", overrides: {} });
    document.documentElement.setAttribute("data-reduce-motion", "true");
    bridge.use({
      query: {
        "saves.bulkEdit": () => ({ changed: 0, undoId: null }),
      },
    });
    for (const id of IDS) {
      pool.upsert(save(id));
    }
    resultNavigation.setSource({ key: "selection-bar", ids: IDS });
    libraryViewContext.set(IDS, "library");
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () =>
      root.render(
        <Tooltip.Provider>
          <SaveSelectionBar />
        </Tooltip.Provider>,
      ),
    );
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    clearSaveSelection();
    resultNavigation.setSource({ key: "empty", ids: [] });
    libraryViewContext.set([], "library");
    document.documentElement.removeAttribute("data-reduce-motion");
  });

  it("stays hidden for a plain click and appears once a second Save is selected", async () => {
    await act(async () => selectOnlySave("a"));
    expect(toolbar()).toBeNull();

    await act(async () => clickSave("b", { meta: true, shift: false }, IDS));
    expect(toolbar()?.textContent).toContain("2 selected");
  });

  it("appears for one Save picked with its circle and offers the batch actions", async () => {
    await act(async () => pickSave("a", { shift: false }, IDS));

    expect(toolbar()?.textContent).toContain("1 selected");
    for (const label of [
      "Select All",
      "Add to Folders",
      "Add Tags",
      "Rate",
      "Add to Canvas",
      "Export",
      "Move to Trash",
      "More Actions",
      "Clear Selection",
    ]) {
      expect(action(label)).toBeTruthy();
    }
  });

  it("selects every result with Select All", async () => {
    await act(async () => pickSave("a", { shift: false }, IDS));
    await act(async () => action("Select All").click());
    await settle();

    expect(selection.size()).toBe(3);
    expect(toolbar()?.textContent).toContain("3 selected");
  });

  it("rates every selected Save from the Rate menu", async () => {
    await act(async () => {
      pickSave("a", { shift: false }, IDS);
      pickSave("b", { shift: false }, IDS);
    });
    await act(async () => action("Rate").click());
    const item = [
      ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((element) => element.textContent?.includes("Rate 3 Stars"));
    if (!item) {
      throw new Error("Missing Rate 3 Stars");
    }
    await act(async () => item.click());
    await settle();

    expect(window.pond.query).toHaveBeenCalledWith("saves.bulkEdit", {
      ids: ["a", "b"],
      operation: { kind: "rating", rating: 3 },
    });
  });

  it("moves the selection to Trash and clears it", async () => {
    await act(async () => {
      pickSave("a", { shift: false }, IDS);
      pickSave("c", { shift: false }, IDS);
    });
    await act(async () => action("Move to Trash").click());
    await settle();

    expect(window.pond.query).toHaveBeenCalledWith("saves.bulkEdit", {
      ids: ["a", "c"],
      operation: { kind: "trash" },
    });
    expect(selection.size()).toBe(0);
  });

  it("offers Restore and Delete Forever in Trash instead of organizing", async () => {
    await act(async () => {
      libraryViewContext.set(IDS, "trash");
      pickSave("a", { shift: false }, IDS);
    });

    expect(action("Restore from Trash")).toBeTruthy();
    expect(action("Delete Forever")).toBeTruthy();
    expect(
      toolbar()?.querySelector('button[aria-label="Move to Trash"]'),
    ).toBeNull();
    expect(
      toolbar()?.querySelector('button[aria-label="Add Tags"]'),
    ).toBeNull();
  });
});
