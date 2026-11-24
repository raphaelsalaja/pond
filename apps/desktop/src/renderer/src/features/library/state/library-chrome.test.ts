import { beforeAll, describe, expect, it } from "vitest";
import type * as LibraryChrome from "./library-chrome";

describe("library chrome", () => {
  let chrome: typeof LibraryChrome;
  let loadedWidth: number;

  beforeAll(async () => {
    localStorage.clear();
    localStorage.setItem("pond.sidebarWidth", "180");
    chrome = await import("./library-chrome");
    loadedWidth = chrome.libraryChrome.getState().sidebarWidth;
  });

  it("raises old sidebar widths to the tab-safe minimum", () => {
    const { libraryChrome, SIDEBAR_WIDTH_MIN } = chrome;
    expect(loadedWidth).toBe(SIDEBAR_WIDTH_MIN);
    libraryChrome.setSidebarWidth(200);
    expect(libraryChrome.getState().sidebarWidth).toBe(SIDEBAR_WIDTH_MIN);
    expect(localStorage.getItem("pond.sidebarWidth")).toBe(
      String(SIDEBAR_WIDTH_MIN),
    );
  });

  it("preserves the saved sidebar width through closing and reopening", () => {
    const { libraryChrome } = chrome;
    libraryChrome.setSidebarWidth(300);
    libraryChrome.toggleSidebar();
    expect(libraryChrome.getState().sidebarOpen).toBe(false);
    libraryChrome.toggleSidebar();
    expect(libraryChrome.getState().sidebarOpen).toBe(true);
    expect(libraryChrome.getState().sidebarWidth).toBe(300);
    expect(localStorage.getItem("pond.sidebar")).toBe("1");
  });
});
