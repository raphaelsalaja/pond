import { PrefsSchema } from "@pond/schema";
import type { MenuActionEvent } from "@shared/constants";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentLocation, openLibraryAt } from "@/app/test/library-router";
import { libraryChrome } from "@/features/library/state/library-chrome";
import { selectOnlySave } from "@/features/saves";
import { MenuBridge } from "./menu-bridge";

describe("menu bridge inspector", () => {
  let host: HTMLDivElement;
  let root: Root;
  let menuAction: ((action: MenuActionEvent) => void) | undefined;

  beforeEach(() => {
    vi.stubGlobal("pond", {
      query: async (name: string) =>
        name === "settings.getPrefs" ? PrefsSchema.parse({}) : [],
      onOpenFiles: () => () => {},
      onMenuAction: (callback: (action: MenuActionEvent) => void) => {
        menuAction = callback;
        return () => {
          menuAction = undefined;
        };
      },
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
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
      menuAction?.({ id: "view.inspector.toggle", source: "menu" });
    });
    expect(libraryChrome.getState().detailsOpen).toBe(!open);
    expect(currentLocation(router).pathname).toBe("/");
    expect(currentLocation(router).search).not.toHaveProperty("save");
  });
});
