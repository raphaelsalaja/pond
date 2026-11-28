import { PrefsSchema } from "@pond/schema";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { currentLocation, openLibraryAt } from "@/app/test/library-router";
import { libraryChrome } from "@/features/library/state/library-chrome";
import { getViewState } from "@/features/library/state/view-store";
import { selectOnlySave } from "@/features/saves";
import { primarySelection, selection } from "@/features/saves/state/selection";
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

describe("menu bridge Save commands", () => {
  let host: HTMLDivElement;
  let root: Root;
  const revealed: Array<string> = [];

  beforeEach(() => {
    revealed.length = 0;
    bridge.use({
      query: { "settings.getPrefs": () => PrefsSchema.parse({}) },
      revealSave: async (id) => {
        revealed.push(id);
        return { ok: true };
      },
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    selectOnlySave("picked");
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    selection.clear();
    primarySelection.set(null);
  });

  it.each([
    ["the grid's selection", "/", ["picked"]],
    ["the Save open over Downloads", "/downloads?save=open", ["open"]],
    ["nothing on Downloads without an open Save", "/downloads", []],
    ["nothing on Tags without an open Save", "/tags", []],
  ])("reveals %s", async (_label, path, expected) => {
    await openLibraryAt(path);
    await act(async () => {
      root.render(<MenuBridge />);
    });
    await act(async () => {
      bridge.emit("onMenuAction", { id: "save.reveal", source: "menu" });
    });
    expect(revealed).toEqual(expected);
  });
});
