import "@/app/effects/save-library-bridge";
import "@/features/saves/components/detail/pane";
import { PrefsSchema } from "@pond/schema";
import { RouterProvider } from "@tanstack/react-router";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openLibraryAt } from "@/app/test/library-router";
import { folders } from "@/features/library/state/folders";
import { normalise } from "@/features/saves/lib/reconcile";
import { pool } from "@/features/saves/state/pool";
import { primarySelection, selection } from "@/features/saves/state/selection";
import { bridge } from "@/shared/test/pond-bridge";
import { inspectorSaveIds, SaveDetails } from "./";

function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <SaveDetails />
    </>
  );
}

describe("inspectorSaveIds", () => {
  it("prefers the open save route over library selection", () => {
    expect(
      inspectorSaveIds({
        routeId: "open",
        selected: ["a", "b"],
        primary: "a",
        cursor: "b",
      }),
    ).toEqual(["open"]);
  });

  it("uses the library selection, then primary, then cursor", () => {
    expect(
      inspectorSaveIds({
        routeId: null,
        selected: ["a", "b"],
        primary: "a",
        cursor: "b",
      }),
    ).toEqual(["a", "b"]);
    expect(
      inspectorSaveIds({
        routeId: null,
        selected: [],
        primary: "a",
        cursor: "b",
      }),
    ).toEqual(["a"]);
    expect(
      inspectorSaveIds({
        routeId: null,
        selected: [],
        primary: null,
        cursor: "b",
      }),
    ).toEqual(["b"]);
    expect(
      inspectorSaveIds({
        routeId: null,
        selected: [],
        primary: null,
        cursor: null,
      }),
    ).toEqual([]);
  });
});

describe("SaveDetails", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    bridge.use({
      query: {
        "settings.getPrefs": () => PrefsSchema.parse({}),
        "folders.list": () => [],
        "folders.memberships": () => [],
        "tags.list": () => [],
        "tagGroups.list": () => [],
        "saves.getMany": () => [],
        "saves.rawJson": ({ id }) => ({ id, rawJson: null }),
      },
    });
    await folders.refresh();
    pool.clear();
    selection.clear();
    primarySelection.set(null);
    const save = normalise({
      id: "demo",
      title: "A saved design",
      url: "https://example.com",
      source: "local",
      tags: ["One"],
    });
    if (!save) throw new Error("Invalid save fixture");
    pool.upsert(save);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    selection.clear();
    primarySelection.set(null);
  });

  async function mount(path = "/") {
    const router = await openLibraryAt(path);
    await act(async () =>
      root.render(<RouterProvider router={router} InnerWrap={Shell} />),
    );
    return router;
  }

  it("shows an empty inspector when the library has no selection", async () => {
    await mount("/");
    await vi.waitFor(() =>
      expect(host.textContent).toContain("Nothing Selected"),
    );
  });

  it("inspects the library selection without opening the save", async () => {
    selection.set(["demo"]);
    primarySelection.set("demo");
    await mount("/");
    await vi.waitFor(() => expect(host.textContent).toContain("One"));
  });

  it("inspects a multi-save library selection", async () => {
    const extra = normalise({
      id: "other",
      title: "Second save",
      url: "https://other.example",
      source: "local",
      tags: ["Two"],
    });
    if (!extra) throw new Error("Invalid save fixture");
    pool.upsert(extra);
    selection.set(["demo", "other"]);
    primarySelection.set("demo");
    await mount("/");
    await vi.waitFor(() => {
      expect(host.textContent).toContain("One1/2");
      expect(host.textContent).toContain("Two1/2");
    });
  });

  it("inspects the open Save over the library selection", async () => {
    const extra = normalise({
      id: "other",
      title: "Second save",
      url: "https://other.example",
      source: "local",
      tags: ["Two"],
    });
    if (!extra) throw new Error("Invalid save fixture");
    pool.upsert(extra);
    selection.set(["other"]);
    primarySelection.set("other");
    await mount("/?save=demo");
    await vi.waitFor(() => expect(host.textContent).toContain("One"));
    expect(host.textContent).not.toContain("Two");
  });
});
