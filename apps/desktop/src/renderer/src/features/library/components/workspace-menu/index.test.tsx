import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { libraryChrome } from "@/features/library/state/library-chrome";
import { setAppRouter } from "@/shared/lib/app-router";
import { WorkspaceMenu } from ".";

const query = vi.fn(async (name: string) => {
  if (name === "library.info") {
    return {
      path: "/Users/rafa/Memes.pond",
      name: "Memes",
      icon: null,
      accent: null,
    };
  }
  if (name === "library.recent") {
    return [
      {
        path: "/Users/rafa/Memes.pond",
        name: "Memes",
        available: true,
        active: true,
        lastOpened: 2,
        icon: null,
        accent: null,
      },
      {
        path: "/Users/rafa/Work.pond",
        name: "Work",
        available: true,
        active: false,
        lastOpened: 1,
        icon: null,
        accent: null,
      },
    ];
  }
  if (name === "library.pickFolder") {
    return { ok: true, path: "/Users/rafa/Libraries" };
  }
  if (name === "library.createAt") {
    return { ok: true, path: "/Users/rafa/Libraries/My Pond.pond" };
  }
  return { ok: true };
});

const openExternal = vi.fn(async (_url: string) => ({ ok: true }));

describe("workspace menu", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("pond", {
      query,
      openExternal,
      appInfo: async () => ({
        name: "Pond",
        version: "1.0.0",
        platform: "darwin",
        arch: "arm64",
        username: "rafa",
        isPackaged: true,
      }),
    });
    query.mockClear();
    openExternal.mockClear();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  async function openMenu() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <WorkspaceMenu />
        </QueryClientProvider>,
      );
    });
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Memes"),
    );
    const trigger = host.querySelector("button");
    if (!trigger) throw new Error("Missing workspace menu trigger");
    await act(async () => trigger.click());
  }

  async function openSwitchLibrary() {
    await openMenu();
    const submenu = [...document.querySelectorAll('[role="menuitem"]')].find(
      (entry) => entry.textContent?.includes("Switch Library"),
    );
    if (!(submenu instanceof HTMLElement))
      throw new Error("Missing Switch Library submenu");
    await act(async () => submenu.click());
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Library Settings"),
    );
  }

  it("keeps library actions in the Switch Library submenu", async () => {
    await openMenu();
    expect(document.body.textContent).toContain("Switch Library");
    expect(document.body.textContent).not.toContain("Create Library");
  });

  it("shows a compact library menu", async () => {
    await openSwitchLibrary();
    const text = document.body.textContent ?? "";
    expect(host.querySelector("button img")).toBeTruthy();
    expect(
      document
        .querySelector<HTMLElement>('[role="menu"]')
        ?.style.getPropertyValue("--menu-width"),
    ).toBe(`${libraryChrome.getState().sidebarWidth - 30}px`);
    expect(text).toContain("Memes");
    expect(text).toContain("Work");
    expect(text).toContain("Create Library");
    expect(text).toContain("Open Library");
    expect(text).toContain("Merge Library");
    expect(text).toContain("Library Settings");
    expect(text).toContain("Settings");
    expect(text).toContain("Check for Updates");
    expect(text).toContain("Browser Extension");
    expect(text).toContain("Twitter");
    expect(text).toContain("GitHub");
    expect(text).toContain("Email");
    expect(text).not.toContain("Hotkeys");
    for (const label of ["Create Library", "Open Library", "Merge Library"]) {
      const item = [...document.querySelectorAll('[role="menuitem"]')].find(
        (entry) => entry.textContent?.includes(label),
      );
      expect(item?.querySelector("svg")).not.toBeNull();
    }
  });

  it("switches to a recent library", async () => {
    await openSwitchLibrary();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Work"));
    const work = [...document.querySelectorAll('[role="menuitem"]')].find(
      (item) => item.textContent?.includes("Work"),
    );
    if (!(work instanceof HTMLElement)) throw new Error("Missing Work library");
    await act(async () => work.click());
    await vi.waitFor(() =>
      expect(query).toHaveBeenCalledWith("library.switchTo", {
        path: "/Users/rafa/Work.pond",
      }),
    );
  });

  it("creates a new library", async () => {
    await openSwitchLibrary();
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Create Library"),
    );
    const item = [...document.querySelectorAll('[role="menuitem"]')].find(
      (entry) => entry.textContent?.includes("Create Library"),
    );
    if (!(item instanceof HTMLElement))
      throw new Error("Missing Create Library action");
    await act(async () => item.click());
    await vi.waitFor(() =>
      expect(query).toHaveBeenCalledWith("library.createAt", {
        path: "/Users/rafa/Libraries",
        name: "My Pond",
      }),
    );
  });

  it("merges another library", async () => {
    await openSwitchLibrary();
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Merge Library"),
    );
    const item = [...document.querySelectorAll('[role="menuitem"]')].find(
      (entry) => entry.textContent?.includes("Merge Library"),
    );
    if (!(item instanceof HTMLElement))
      throw new Error("Missing Merge Library action");
    await act(async () => item.click());
    await vi.waitFor(() =>
      expect(query).toHaveBeenCalledWith("library.mergeFrom", {}),
    );
  });

  async function openExtensionDialog(): Promise<Element | null> {
    await openMenu();
    const item = [...document.querySelectorAll('[role="menuitem"]')].find(
      (entry) => entry.textContent?.includes("Browser Extension"),
    );
    if (!(item instanceof HTMLElement))
      throw new Error("Missing Browser Extension action");
    await act(async () => item.click());
    await vi.waitFor(() =>
      expect(document.querySelector('[role="dialog"]')).not.toBeNull(),
    );
    return document.querySelector('[role="dialog"]');
  }

  function storeButton(dialog: Element | null, label: string) {
    const button = [...(dialog?.querySelectorAll("button") ?? [])].find(
      (entry) => entry.textContent === label,
    );
    if (!button) throw new Error(`Missing ${label} button`);
    return button;
  }

  it("opens each browser's store listing from the extension dialog", async () => {
    const dialog = await openExtensionDialog();
    await act(async () => storeButton(dialog, "Add to Chrome").click());
    expect(openExternal).toHaveBeenLastCalledWith(
      "https://chromewebstore.google.com/detail/ghigndnldiagchoaifgndleogpkendbc",
    );
    await act(async () => storeButton(dialog, "Add to Firefox").click());
    expect(openExternal).toHaveBeenLastCalledWith(
      "https://addons.mozilla.org/firefox/addon/desktop%40pond.so/",
    );
  });

  it("checks for updates instead of opening Settings", async () => {
    const history = createMemoryHistory({ initialEntries: ["/"] });
    const router = createRouter({
      routeTree: createRootRoute(),
      history,
    });
    setAppRouter(router);
    await openMenu();
    const item = [...document.querySelectorAll('[role="menuitem"]')].find(
      (entry) => entry.textContent?.includes("Check for Updates"),
    );
    if (!(item instanceof HTMLElement))
      throw new Error("Missing Check for Updates action");
    await act(async () => item.click());
    expect(query).toHaveBeenCalledWith("updates.checkNow", {});
    expect(history.location.href).not.toContain("/settings");
  });

  it("says so when a store page doesn't open", async () => {
    openExternal.mockResolvedValueOnce({ ok: false });
    const dialog = await openExtensionDialog();
    await act(async () => storeButton(dialog, "Add to Chrome").click());
    await vi.waitFor(() =>
      expect(dialog?.textContent).toContain(
        "Pond couldn't open the store page. Try again.",
      ),
    );
  });
});
