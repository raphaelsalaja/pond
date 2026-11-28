import { PrefsSchema } from "@pond/schema";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { currentLocation, openLibraryAt } from "@/app/test/library-router";
import { libraryChrome } from "@/features/library/state/library-chrome";
import { getViewState } from "@/features/library/state/view-store";
import { selectOnlySave } from "@/features/saves";
import { bridge } from "@/shared/test/pond-bridge";
import { MenuBridge } from "./menu-bridge";

describe("menu bridge inspector", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    bridge.use({
      query: { "settings.getPrefs": () => PrefsSchema.parse({}) },
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it("toggles details on the library without opening a save", async () => {
    const router = await openLibraryAt("/");
    selectOnlySave("demo");
    libraryChrome.setDetailsOpen(true);
    await act(async () => {
      root.render(<MenuBridge />);
    });
    const open = libraryChrome.getState().detailsOpen;
    await act(async () => {
      bridge.emit("onMenuAction", {
        id: "view.inspector.toggle",
        source: "menu",
      });
    });
    expect(libraryChrome.getState().detailsOpen).toBe(!open);
    expect(currentLocation(router).pathname).toBe("/");
    expect(currentLocation(router).search).not.toHaveProperty("save");
  });

  it.each([
    ["Downloads", "/downloads"],
    ["an open Save", "/?save=demo"],
    ["Inbox review", "/inbox"],
  ])("leaves grid layout and zoom alone on %s", async (_label, path) => {
    await openLibraryAt(path);
    await act(async () => {
      root.render(<MenuBridge />);
    });
    const before = getViewState();
    await act(async () => {
      for (const id of [
        "view.zoom-in",
        "view.layout.cycle",
        "view.layout.list",
      ] as const) {
        bridge.emit("onMenuAction", { id, source: "menu" });
      }
    });
    expect(getViewState().zoom).toBe(before.zoom);
    expect(getViewState().layout).toBe(before.layout);
  });

  it("zooms the grid it shows", async () => {
    await openLibraryAt("/");
    await act(async () => {
      root.render(<MenuBridge />);
    });
    const zoom = getViewState().zoom;
    await act(async () => {
      bridge.emit("onMenuAction", { id: "view.zoom-out", source: "menu" });
    });
    expect(getViewState().zoom).not.toBe(zoom);
  });
});
