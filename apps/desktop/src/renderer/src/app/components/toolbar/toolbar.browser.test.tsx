import { PrefsSchema } from "@pond/schema";
import { isHTMLElement } from "@pond/ui/dom";
import type { NavigationDirection } from "@shared/constants";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoute, RouterProvider } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openLibraryAt } from "@/app/test/library-router";
import { selectLibraryNav } from "@/features/library/components/folder-sidebar/navigation";
import { commandMenu } from "@/features/library/state/command-menu";
import { folders } from "@/features/library/state/folders";
import { libraryChrome } from "@/features/library/state/library-chrome";
import {
  resetFilters,
  setSearchInput,
} from "@/features/library/state/view-store";
import { normalise } from "@/features/saves/lib/reconcile";
import { pool } from "@/features/saves/state/pool";
import { libraryViewContext } from "@/features/saves/state/view-context";
import { bridge } from "@/shared/test/pond-bridge";
import { Toolbar } from "./";

function pages(parent: AnyRoute): Array<AnyRoute> {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: "fish/$fishId",
      staticData: { details: "fish" },
    }),
    createRoute({
      getParentRoute: () => parent,
      path: "settings",
      staticData: { details: null },
    }),
  ];
}

function button(name: string): HTMLButtonElement {
  const match = [...document.querySelectorAll("button")].find(
    (node) =>
      (node.getAttribute("aria-label") ?? node.textContent)?.trim() === name,
  );
  if (!match) {
    throw new Error(`Missing button: ${name}`);
  }
  return match;
}

function sideButton(button: number) {
  return act(async () => {
    window.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        button,
      }),
    );
  });
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toolbar.Root />
    </>
  );
}

const swipe = (direction: NavigationDirection) =>
  act(async () => {
    bridge.emit("onNavigationSwipe", direction);
  });

describe("breadcrumb toolbar", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.clearAllMocks();
    bridge.use({
      query: {
        "settings.getPrefs": () => PrefsSchema.parse({}),
        "folders.list": () =>
          [
            { id: "parent", name: "Design", parentId: null },
            { id: "child", name: "Interfaces", parentId: "parent" },
            { id: "deep", name: "Mobile", parentId: "child" },
          ].map((folder) => ({
            ...folder,
            color: null,
            sortOrder: 0,
            createdAt: new Date(),
          })),
        "folders.memberships": () => [],
      },
    });
    resetFilters();
    await folders.refresh();
    pool.clear();
    const save = normalise({
      id: "demo",
      title: "A saved design",
      url: "https://example.com",
      source: "local",
    });
    if (!save) {
      throw new Error("Invalid save fixture");
    }
    pool.upsert(save);
    libraryViewContext.set([], "library");
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function labels() {
    return [...host.querySelectorAll("button")].map((node) =>
      node.getAttribute("aria-label"),
    );
  }

  async function mount(path = "/") {
    const router = await openLibraryAt(path, { routes: pages });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <RouterProvider router={router} InnerWrap={Shell} />
        </QueryClientProvider>,
      ),
    );
    return router;
  }

  it("opens the command menu from Search Pond", async () => {
    const open = vi.spyOn(commandMenu, "open");
    await mount();
    await act(async () => button("Search Pond").click());
    expect(open).toHaveBeenCalledOnce();
    open.mockRestore();
    commandMenu.close();
  });

  it("leaves the fish page without a breadcrumb", async () => {
    await mount("/fish/default");
    expect(host.querySelector('nav[aria-label="Breadcrumb"]')).toBeNull();
  });

  it.each([
    ["/sources", "Sources"],
    ["/tags", "Tags"],
    ["/untagged", "Untagged"],
    ["/recents", "Recently Used"],
    ["/downloads", "Downloads"],
    ["/trash", "Trash"],
    ["/settings", "Settings"],
  ] as const)("shows %s as a root location", async (path, label) => {
    await mount(path);
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe(
      label,
    );
    expect(host.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(
      host.querySelector('nav[aria-label="Breadcrumb"]')?.textContent,
    ).not.toContain("All");
  });

  it("shows one current location without any tab controls", async () => {
    await mount();
    expect(host.querySelector('nav[aria-label="Breadcrumb"]')).not.toBeNull();
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe(
      "All",
    );
    expect(host.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(host.querySelector('[role="tablist"]')).toBeNull();
    expect(host.querySelector('[aria-label="New Tab"]')).toBeNull();
    expect(host.querySelector('[aria-label="History"]')).toBeNull();
  });

  it("shows and updates the search result count, including zero", async () => {
    setSearchInput([], "design", "design");
    await mount();
    expect(
      host.querySelector('nav[aria-label="Breadcrumb"]')?.textContent,
    ).toBe("All/Search results (0)");
    await act(async () => libraryViewContext.set(["one", "two"], "library"));
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe(
      "Search results (2)",
    );
  });

  it("navigates to parent folders and back to All", async () => {
    const router = await mount("/folders/child");
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe(
      "Interfaces",
    );
    await act(async () => button("Design").click());
    expect(router.state.location.pathname).toBe("/folders/parent");
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe(
      "Design",
    );
    await act(async () => button("All").click());
    expect(router.state.location.pathname).toBe("/");
  });

  it("keeps the breadcrumb on an open Save", async () => {
    await mount("/?save=demo");
    expect(host.querySelector('nav[aria-label="Breadcrumb"]')).not.toBeNull();
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe(
      "A saved design",
    );
  });

  it("keeps hidden ancestors accessible through the overflow menu", async () => {
    const router = await mount("/folders/deep");
    await act(async () => button("Show Parent Folders").click());
    const parent = [...document.querySelectorAll('[role="menuitem"]')].find(
      (node) => node.textContent === "Design",
    );
    if (!isHTMLElement(parent)) {
      throw new Error("Missing parent folder");
    }
    await act(async () => parent.click());
    expect(router.state.location.pathname).toBe("/folders/parent");
  });

  it("opens folder operations from a breadcrumb context-menu event", async () => {
    await mount("/folders/child");
    const crumb = host.querySelector('[aria-current="page"]');
    if (!isHTMLElement(crumb)) {
      throw new Error("Missing current folder breadcrumb");
    }
    await act(async () => {
      crumb.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 24,
          clientY: 24,
        }),
      );
    });
    for (const label of [
      "Open Folder",
      "Quick Access",
      "Icon",
      "Color",
      "Sort By",
      "Customize Folder",
    ]) {
      expect(
        [...document.querySelectorAll('[role^="menuitem"]')].some(
          (item) => item.textContent?.trim() === label,
        ),
      ).toBe(true);
    }
  });

  it("updates back and forward controls using the single router history", async () => {
    const router = await mount();
    expect(button("Back").disabled).toBe(true);
    await act(async () => router.history.push("/sources"));
    expect(button("Back").disabled).toBe(false);
    expect(button("Forward").disabled).toBe(true);
    await act(async () => button("Back").click());
    expect(router.state.location.pathname).toBe("/");
    expect(button("Forward").disabled).toBe(false);
    await act(async () => button("Forward").click());
    expect(router.state.location.pathname).toBe("/sources");
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe(
      "Sources",
    );
  });

  it("follows the mouse back and forward side buttons", async () => {
    const router = await mount("/");
    await act(async () => router.history.push("/folders/parent"));
    await act(async () => router.history.push("/folders/parent?save=demo"));
    await sideButton(3);
    expect(router.state.location.pathname).toBe("/folders/parent");
    expect(router.state.location.search).not.toHaveProperty("save");
    await sideButton(3);
    expect(router.state.location.pathname).toBe("/");
    await sideButton(3);
    expect(router.state.location.pathname).toBe("/");
    await sideButton(4);
    expect(router.state.location.pathname).toBe("/folders/parent");
    await sideButton(4);
    expect(router.state.location.search).toMatchObject({ save: "demo" });
  });

  it("follows back and forward swipes from the main process", async () => {
    const router = await mount("/");
    await act(async () => router.history.push("/sources"));
    await swipe("back");
    expect(router.state.location.pathname).toBe("/");
    await swipe("forward");
    expect(router.state.location.pathname).toBe("/sources");
    act(() => root.unmount());
    expect(bridge.listening("onNavigationSwipe")).toBe(false);
    root = createRoot(host);
  });

  it("leaves an open save before walking folder history", async () => {
    const router = await mount("/");
    await act(async () => router.history.push("/folders/parent"));
    await act(async () => router.history.push("/folders/parent?save=demo"));
    await act(async () => button("Back").click());
    expect(router.state.location.pathname).toBe("/folders/parent");
    expect(router.state.location.search).not.toHaveProperty("save");
    await act(async () => button("Forward").click());
    expect(router.state.location.search).toMatchObject({ save: "demo" });
    await act(async () => button("Back").click());
    await act(async () => button("Back").click());
    expect(router.state.location.pathname).toBe("/");
    await act(async () => button("Forward").click());
    expect(router.state.location.pathname).toBe("/folders/parent");
    await act(async () => button("Forward").click());
    expect(router.state.location.pathname).toBe("/folders/parent");
    expect(router.state.location.search).toMatchObject({ save: "demo" });
  });

  it("does not offer history on a Save opened at launch", async () => {
    await mount("/?save=demo");
    expect(button("Back").disabled).toBe(true);
    expect(button("Forward").disabled).toBe(true);
  });

  it("discards the save-forward branch after fresh folder navigation", async () => {
    const router = await mount("/");
    await act(async () => router.history.push("/folders/parent"));
    await act(async () => router.history.push("/folders/parent?save=demo"));
    await act(async () => button("Back").click());
    await act(async () => button("Back").click());
    await act(async () => selectLibraryNav({ kind: "folder", id: "child" }));
    expect(button("Forward").disabled).toBe(true);
    expect(router.state.location.pathname).toBe("/folders/child");
  });

  it("enables the details toggle only on pages with a Details column", async () => {
    const router = await mount("/");
    expect(button("Toggle Details").disabled).toBe(false);
    await act(async () => router.history.push("/?save=demo"));
    expect(button("Toggle Details").disabled).toBe(false);
    expect(labels()).not.toContain("Fish");
    await act(async () => router.history.push("/tags"));
    expect(button("Toggle Details").disabled).toBe(true);
    await act(async () => router.history.push("/downloads"));
    expect(button("Toggle Details").disabled).toBe(true);
    await act(async () => router.history.push("/settings"));
    expect(button("Toggle Details").disabled).toBe(true);
    expect(button("Toggle Details").getAttribute("aria-pressed")).toBe("false");
    await act(async () => router.history.push("/sources"));
    expect(button("Toggle Details").disabled).toBe(true);
  });

  it("toggles the details column from the library toolbar", async () => {
    libraryChrome.setDetailsOpen(true);
    await mount("/");
    expect(libraryChrome.getState().detailsOpen).toBe(true);
    await act(async () => button("Toggle Details").click());
    expect(libraryChrome.getState().detailsOpen).toBe(false);
    await act(async () => button("Toggle Details").click());
    expect(libraryChrome.getState().detailsOpen).toBe(true);
  });
});
