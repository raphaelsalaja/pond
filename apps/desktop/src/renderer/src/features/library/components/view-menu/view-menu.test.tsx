import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLibrarySaveGap } from "@/features/library/components/layouts/save-gap";
import { libraryHeader } from "@/features/library/state/library-header";
import {
  currentSort,
  getViewState,
  setLayout,
  setSort,
  setZoom,
} from "@/features/library/state/view-store";
import { setDisplayPref } from "@/features/saves";
import { ViewMenu } from "./";

function query<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
}

function button(label: string): HTMLButtonElement {
  const match = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
  ).find(
    (node) =>
      node.getAttribute("aria-label") === label ||
      node.textContent?.trim() === label,
  );
  if (!match) throw new Error(`Missing button ${label}`);
  return match;
}

function toggle(label: string): HTMLElement {
  return query<HTMLElement>(
    `[role="dialog"] [role="switch"][aria-label="${label}"]`,
  );
}

describe("view menu", () => {
  let root: Root;
  let host: HTMLDivElement;

  function reset() {
    libraryHeader.closePopover();
    setLayout("justified");
    setZoom(130);
    setLibrarySaveGap(16);
    setSort({ key: "savedAt", dir: "desc" });
    setDisplayPref("source", true);
    setDisplayPref("fileCount", true);
  }

  async function open() {
    await act(async () => root.render(<ViewMenu />));
    await act(async () =>
      query<HTMLButtonElement>('button[aria-label="View Options"]').click(),
    );
  }

  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    reset();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    reset();
    vi.unstubAllGlobals();
  });

  it("opens a popup with every group", async () => {
    await open();

    const dialog = query<HTMLElement>(
      '[role="dialog"][aria-label="View Options"]',
    );
    const groups = Array.from(dialog.querySelectorAll("fieldset")).map((node) =>
      node.getAttribute("aria-label"),
    );
    expect(groups).toEqual([
      "Layout",
      "Presets",
      "Sorting and Size",
      "Folders",
      "Card Options",
      "Display Properties",
    ]);
  });

  it("switches layouts from the pills", async () => {
    await open();

    const grid = button("Grid");
    expect(button("Justified").getAttribute("aria-pressed")).toBe("true");

    await act(async () => grid.click());

    expect(getViewState().layout).toBe("grid");
    expect(grid.getAttribute("aria-pressed")).toBe("true");
  });

  it("applies a preset", async () => {
    await open();

    await act(async () => button("Dense").click());

    expect(getViewState().layout).toBe("grid");
    expect(getViewState().zoom).toBe(110);
  });

  it("flips the sort direction", async () => {
    await open();

    await act(async () => button("Toggle Sort Direction").click());

    expect(currentSort()).toEqual({ key: "savedAt", dir: "asc" });
  });

  it("toggles card details independently", async () => {
    await open();

    const source = toggle("Source");
    const name = toggle("Name");
    const nameBefore = name.getAttribute("aria-checked");
    expect(source.getAttribute("aria-checked")).toBe("true");

    await act(async () => source.click());

    expect(source.getAttribute("aria-checked")).toBe("false");
    expect(window.localStorage.getItem("pond.display.source")).toBe("0");
    expect(name.getAttribute("aria-checked")).toBe(nameBefore);
  });

  it("hides the file count on cards", async () => {
    await open();

    const count = toggle("File Count");
    expect(count.getAttribute("aria-checked")).toBe("true");

    await act(async () => count.click());

    expect(count.getAttribute("aria-checked")).toBe("false");
    expect(window.localStorage.getItem("pond.display.fileCount")).toBe("0");
  });
});
