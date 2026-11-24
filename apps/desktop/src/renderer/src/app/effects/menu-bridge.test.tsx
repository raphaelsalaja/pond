import { PrefsSchema } from "@pond/schema";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { currentLocation, openLibraryAt } from "@/app/test/library-router";
import { libraryChrome } from "@/features/library/state/library-chrome";
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
});
