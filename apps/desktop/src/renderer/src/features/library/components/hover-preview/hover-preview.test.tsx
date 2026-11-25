import { PrefsSchema } from "@pond/schema";
import type { WireSave } from "@shared/wire";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { currentLocation, openLibraryAt } from "@/app/test/library-router";
import { normalise } from "@/features/saves";
import { resultNavigation, selection } from "@/features/saves/navigation";
import { pool } from "@/features/saves/pool";
import { requestQuickPreview } from "@/features/saves/state/quick-preview";
import { bridge } from "@/shared/test/pond-bridge";
import { HoverPreview } from "./";

/** SAFETY: ensureSaves parses rows through SavePatchesSchema, which reads only these fields. */
function wire(row: Partial<WireSave>): WireSave {
  return row as WireSave;
}

it("hydrates and previews the next logical save beyond loaded grid rows", async () => {
  const first = normalise({
    id: "quick-first",
    source: "web",
    sourceId: "first",
    url: "https://fixture.test/one",
    title: "First reference",
    files: [],
  });
  if (!first) {
    throw new Error("Invalid fixture");
  }
  pool.upsert(first);
  const next = [
    wire({
      id: "quick-next",
      source: "web",
      sourceId: "next",
      url: "https://fixture.test/two",
      title: "Next reference",
      files: [],
    }),
  ];
  bridge.use({
    query: {
      "settings.getPrefs": () => PrefsSchema.parse({}),
      "saves.getMany": () => next,
    },
  });
  selection.setAnchor("range-start");
  selection.setCursor(first.id);
  resultNavigation.setSource({
    ids: [first.id],
    allIds: async () => [first.id, "quick-next"],
  });
  const host = document.createElement("div");
  host.setAttribute("data-save-collection", "");
  host.tabIndex = 0;
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<HoverPreview />));
    host.focus();
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: " ",
          code: "Space",
          bubbles: true,
        }),
      ),
    );
    expect(document.body.textContent).toContain("First reference");
    expect(
      document.querySelector("[data-quick-preview][data-open]"),
    ).not.toBeNull();
    expect(
      document.querySelector("[data-quick-preview] [aria-label='Close']"),
    ).not.toBeNull();
    await act(async () =>
      document.querySelector("[data-quick-preview]")?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowRight",
          code: "ArrowRight",
          bubbles: true,
        }),
      ),
    );
    expect(selection.getAnchor()).toBe("quick-next");
    expect(window.pond.query).toHaveBeenCalledWith("saves.getMany", {
      ids: ["quick-next"],
    });
    expect(document.body.textContent).toContain("Next reference");
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: " ",
          code: "Space",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(
      document.querySelector("[data-quick-preview][data-open]"),
    ).toBeNull();
  } finally {
    await act(async () => root.unmount());
    resultNavigation.setSource({ ids: [] });
    selection.clear();
    host.remove();
  }
});

it("dims the grid for a peek and closes on a click outside", async () => {
  const save = normalise({
    id: "peek-save",
    source: "web",
    sourceId: "peek",
    url: "https://fixture.test/peek",
    title: "Peeked reference",
    files: [],
  });
  if (!save) {
    throw new Error("Invalid fixture");
  }
  pool.upsert(save);
  bridge.use({
    query: { "settings.getPrefs": () => PrefsSchema.parse({}) },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<HoverPreview />));
    await act(async () => requestQuickPreview(save.id, { peek: true }));
    expect(
      document.querySelector("[data-quick-preview][data-open]"),
    ).not.toBeNull();
    const backdrop = document.querySelector<HTMLElement>(
      "[data-peek-backdrop]",
    );
    expect(backdrop).not.toBeNull();
    await act(async () => {
      backdrop?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      backdrop?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 }),
      );
      backdrop?.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, button: 0 }),
      );
      backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(
      document.querySelector("[data-quick-preview][data-open]"),
    ).toBeNull();
  } finally {
    await act(async () => root.unmount());
    selection.clear();
    host.remove();
  }
});

it("opens the save details from the expand button and closes the preview", async () => {
  const save = normalise({
    id: "quick-expand",
    source: "web",
    sourceId: "expand",
    url: "https://fixture.test/expand",
    title: "Expand reference",
    files: [],
  });
  if (!save) {
    throw new Error("Invalid fixture");
  }
  pool.upsert(save);
  bridge.use({
    query: { "settings.getPrefs": () => PrefsSchema.parse({}) },
  });
  const router = await openLibraryAt("/");
  selection.setAnchor(save.id);
  selection.setCursor(save.id);
  resultNavigation.setSource({ ids: [save.id] });
  const host = document.createElement("div");
  host.setAttribute("data-save-collection", "");
  host.tabIndex = 0;
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<HoverPreview />));
    host.focus();
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: " ",
          code: "Space",
          bubbles: true,
        }),
      ),
    );
    const expand = document.querySelector(
      "[data-quick-preview] [aria-label='Open Save']",
    );
    expect(expand).not.toBeNull();
    await act(async () =>
      expand?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    expect(currentLocation(router).search.save).toBe(save.id);
    expect(
      document.querySelector("[data-quick-preview][data-open]"),
    ).toBeNull();
  } finally {
    await act(async () => root.unmount());
    resultNavigation.setSource({ ids: [] });
    selection.clear();
    host.remove();
  }
});
