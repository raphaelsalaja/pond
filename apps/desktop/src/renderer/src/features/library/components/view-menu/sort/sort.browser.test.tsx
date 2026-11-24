import { RouterContextProvider } from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openLibraryAt } from "@/app/test/library-router";
import {
  getViewState,
  restoreDefaults,
  setSort,
} from "@/features/library/state/view-store";
import { SortSection } from "./";

function control(label: string) {
  const match = [
    ...document.querySelectorAll<HTMLElement>(
      "button, label, [role='combobox'], [role='option']",
    ),
  ].find((node) => {
    const text = (node.textContent ?? "").replaceAll(/\s+/g, " ").trim();
    return node.getAttribute("aria-label") === label || text === label;
  });
  if (!match) {
    throw new Error(`Missing control ${label}`);
  }
  return match;
}

describe("sort section", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    restoreDefaults();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    restoreDefaults();
    vi.unstubAllGlobals();
  });

  async function render() {
    const router = await openLibraryAt("/");
    await act(async () =>
      root.render(
        <RouterContextProvider router={router}>
          <SortSection />
        </RouterContextProvider>,
      ),
    );
  }

  it("picks a sort key from the select", async () => {
    await render();
    await act(async () => {
      const trigger = document.querySelector<HTMLElement>("[role='combobox']");
      if (!trigger) {
        throw new Error(document.body.innerHTML);
      }
      trigger.click();
    });
    expect(control("Date Published").textContent).toContain("Date Published");
    expect(document.body.textContent).toContain("Random");
    expect(document.body.textContent).not.toContain("Manual");
    await act(async () => control("Title").click());
    expect(getViewState().sortKey).toBe("title");
    expect(getViewState().sortDir).toBe("desc");
  });

  it("changes sort direction without resetting the key", async () => {
    setSort({ key: "title", dir: "desc" });
    await render();
    const controls = document.querySelectorAll<HTMLElement>(
      "[aria-label='Toggle Sort Direction'], [role='combobox']",
    );
    expect(controls[0]?.getAttribute("aria-label")).toBe(
      "Toggle Sort Direction",
    );
    expect(controls[1]?.getAttribute("role")).toBe("combobox");
    await act(async () => control("Toggle Sort Direction").click());
    expect(getViewState().sortKey).toBe("title");
    expect(getViewState().sortDir).toBe("asc");
  });

  it("creates a new stable seed when random order is reshuffled", async () => {
    setSort({ key: "random", dir: "asc" });
    const before = getViewState().randomSeed;
    await render();
    await act(async () => control("Reshuffle").click());
    expect(getViewState().randomSeed).not.toBe(before);
    expect(getViewState().sortKey).toBe("random");
  });
});
