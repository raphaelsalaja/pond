import type { QueryInput } from "@shared/query-contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { libraryChrome } from "@/features/library/state/library-chrome";
import { bridge } from "@/shared/test/pond-bridge";
import { WorkspaceMenu } from ".";

describe("workspace menu", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    bridge.use({
      query: {
        "library.info": () => ({
          path: "/Users/rafa/Memes.pond",
          name: "Memes",
          icon: null,
          mark: null,
          accent: null,
        }),
        "library.recent": () => [
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
        ],
        "library.pickFolder": () => ({
          ok: true,
          path: "/Users/rafa/Libraries",
        }),
      },
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
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
    const trigger = host.querySelector("button");
    if (!trigger) {
      throw new Error("Missing workspace menu trigger");
    }
    await vi.waitFor(() =>
      expect(trigger.getAttribute("aria-label")).toBe("Memes"),
    );
    await act(async () => trigger.click());
  }

  async function openLibraryMenu() {
    await openMenu();
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Library Settings"),
    );
  }

  function menuItem(label: string): HTMLElement {
    const item = [
      ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((entry) => entry.textContent?.includes(label));
    if (!item) {
      throw new Error(`Missing ${label}`);
    }
    return item;
  }

  it("shows a compact library menu", async () => {
    await openLibraryMenu();
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
    expect(text).not.toContain("Switch Library");
    expect(text).not.toContain("Check for Updates");
    for (const label of ["Create Library", "Open Library", "Merge Library"]) {
      expect(menuItem(label).querySelector("svg")).not.toBeNull();
    }
  });

  it("switches to a recent library", async () => {
    const switched = Promise.withResolvers<QueryInput<"library.switchTo">>();
    bridge.use({
      query: {
        "library.switchTo": (input) => {
          switched.resolve(input);
          return { ok: true, path: input.path };
        },
      },
    });
    await openLibraryMenu();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Work"));
    const work = menuItem("Work");
    await act(async () => work.click());
    await expect(switched.promise).resolves.toEqual({
      path: "/Users/rafa/Work.pond",
    });
  });

  it("creates a new library", async () => {
    const created = Promise.withResolvers<QueryInput<"library.createAt">>();
    bridge.use({
      query: {
        "library.createAt": (input) => {
          created.resolve(input);
          return { ok: true, path: `${input.path}/${input.name}.pond` };
        },
      },
    });
    await openLibraryMenu();
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Create Library"),
    );
    const item = menuItem("Create Library");
    await act(async () => item.click());
    await expect(created.promise).resolves.toEqual({
      path: "/Users/rafa/Libraries",
      name: "My Pond",
    });
  });

  it("merges another library", async () => {
    const merged = Promise.withResolvers<
      QueryInput<"library.mergeFrom"> | undefined
    >();
    bridge.use({
      query: {
        "library.mergeFrom": (input) => {
          merged.resolve(input);
          return { ok: true };
        },
      },
    });
    await openLibraryMenu();
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Merge Library"),
    );
    const item = menuItem("Merge Library");
    await act(async () => item.click());
    await expect(merged.promise).resolves.toEqual({});
  });
});
