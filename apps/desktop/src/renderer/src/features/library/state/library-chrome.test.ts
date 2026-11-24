import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("library chrome", () => {
  beforeEach(() => {
    vi.resetModules();
    const memory = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("raises old sidebar widths to the tab-safe minimum", async () => {
    localStorage.setItem("pond.sidebarWidth", "180");
    const { libraryChrome, SIDEBAR_WIDTH_MIN } =
      await import("./library-chrome");
    expect(libraryChrome.getState().sidebarWidth).toBe(SIDEBAR_WIDTH_MIN);
    libraryChrome.setSidebarWidth(200);
    expect(libraryChrome.getState().sidebarWidth).toBe(SIDEBAR_WIDTH_MIN);
    expect(localStorage.getItem("pond.sidebarWidth")).toBe(
      String(SIDEBAR_WIDTH_MIN),
    );
  });

  it("preserves the saved sidebar width through closing and reopening", async () => {
    const { libraryChrome } = await import("./library-chrome");
    libraryChrome.setSidebarWidth(300);
    libraryChrome.toggleSidebar();
    expect(libraryChrome.getState().sidebarOpen).toBe(false);
    libraryChrome.toggleSidebar();
    expect(libraryChrome.getState().sidebarOpen).toBe(true);
    expect(libraryChrome.getState().sidebarWidth).toBe(300);
    expect(localStorage.getItem("pond.sidebar")).toBe("1");
  });
});
