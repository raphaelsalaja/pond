import { EMPTY_QUERY } from "@pond/schema/filters/types";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { libraryChrome } from "@/features/library";
import {
  getViewState,
  resetFilters,
  setQuery,
} from "@/features/library/state/view-store";
import { tagCreation } from "@/features/tags/state/creation";
import type { TagGroupRow } from "@/features/tags/state/tag-groups";
import type { TagRow } from "@/features/tags/state/tags";
import { setAppRouter } from "@/shared/lib/app-router";
import { TagsPage } from "./";

const fixtures = {
  tags: ["Animation", "Typography"].map((name, index) => ({
    id: String(index),
    name,
    starred: index === 0,
    description: null,
    lastUsedAt: null,
    usageCount: 0,
    createdAt: null,
  })) satisfies TagRow[],
  groups: [
    {
      id: "design",
      name: "Design",
      description: "Visual references",
      color: null,
      sortOrder: 0,
      collapsed: false,
      tagIds: ["0"],
      tagNames: ["Animation"],
    },
  ] satisfies TagGroupRow[],
  saves: [],
};

describe("library Tags page", () => {
  let host: HTMLDivElement;
  let root: Root;
  const query = vi.fn(async (name: string) => {
    if (name === "tags.list") return fixtures.tags;
    if (name === "tagGroups.list") return fixtures.groups;
    return { ok: true };
  });

  beforeEach(() => {
    vi.stubGlobal("scrollTo", vi.fn());
    vi.stubGlobal("pond", { query, onSyncAction: () => () => {} });
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }));
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(900);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(800);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    query.mockClear();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    libraryChrome.setNav({ kind: "all" });
    resetFilters();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function mount() {
    const rootRoute = createRootRoute();
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => null,
    });
    const tagsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/tags",
      component: TagsPage,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, tagsRoute]),
      history: createMemoryHistory({ initialEntries: ["/tags"] }),
    });
    setAppRouter(router);
    await act(async () => {
      await router.load();
      root.render(<RouterProvider router={router} />);
    });
    return router;
  }

  async function fill(input: HTMLInputElement, value: string) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, value);
      input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
  }

  it("renders tag navigation and rows from the real stores", async () => {
    await mount();
    expect(host.querySelector('[aria-current="page"]')?.textContent).toContain(
      "All",
    );
    expect(host.textContent).toContain("Animation");
    expect(host.textContent).toContain("Typography");
    expect(host.textContent).toContain("Starred");
    expect(host.querySelector('[aria-label="New Group"]')).not.toBeNull();
    expect(host.textContent).not.toContain("New Tag");
  });

  it("filters tags using the existing manager", async () => {
    await mount();
    const search = host.querySelector('input[placeholder="Search tags…"]');
    if (!(search instanceof HTMLInputElement))
      throw new Error("Missing search");
    await fill(search, "animation");
    expect(host.textContent).toContain("Animation");
    expect(host.textContent).not.toContain("Typography");
  });

  it("filters to starred tags from the Eagle-style rail", async () => {
    await mount();
    const starred = [...host.querySelectorAll("button")].find((node) =>
      node.textContent?.includes("Starred"),
    );
    if (!starred) throw new Error("Missing Starred collection");
    await act(async () => starred.click());
    expect(host.textContent).toContain("Animation");
    expect(host.textContent).not.toContain("Typography");
  });

  it("shows group details and its add-tags picker trigger", async () => {
    await mount();
    const group = [...host.querySelectorAll("button")].find(
      (node) => node.textContent?.trim() === "Design1",
    );
    if (!group) throw new Error("Missing Design group");
    await act(async () => group.click());
    expect(host.querySelector("h1")?.textContent).toContain("Design");
    expect(
      host.querySelector('[aria-label="Add Tags to Design"]'),
    ).not.toBeNull();
    const description = host.querySelector('[aria-label="Design description"]');
    if (!(description instanceof HTMLInputElement)) {
      throw new Error("Missing group description");
    }
    await act(async () => description.focus());
    await fill(description, "Changed");
    await act(async () => {
      description.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(query).not.toHaveBeenCalledWith(
      "tagGroups.update",
      expect.anything(),
    );
    await act(async () => description.focus());
    await fill(description, "Updated");
    await act(async () => {
      description.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(query).toHaveBeenCalledWith("tagGroups.update", {
      name: "Design",
      patch: { description: "Updated" },
    });
  });

  it("opens tagged saves from a tag click", async () => {
    const router = await mount();
    libraryChrome.setNav({ kind: "all" });
    setQuery({
      combinator: "and",
      rules: [{ field: "tags", operator: "some", value: ["Other"] }],
    });
    const row = host.querySelector('[role="option"][title="Typography"]');
    const more = row?.querySelector('[aria-label="More Actions"]');
    if (!(row instanceof HTMLElement) || !(more instanceof HTMLElement)) {
      throw new Error("Missing Typography");
    }

    await act(async () => more.click());
    expect(libraryChrome.getState().nav).toEqual({ kind: "all" });
    expect(router.state.location.pathname).toBe("/tags");

    await act(async () => row.click());
    expect(row.getAttribute("aria-selected")).toBe("false");
    expect(libraryChrome.getState().nav).toEqual({
      kind: "tag",
      name: "Typography",
    });
    expect(router.state.location.pathname).toBe("/");
    expect(getViewState().query).toEqual(EMPTY_QUERY);
  });

  it("opens tagged saves from the keyboard", async () => {
    const router = await mount();
    libraryChrome.setNav({ kind: "all" });
    const row = host.querySelector('[role="option"][title="Animation"]');
    if (!(row instanceof HTMLElement)) throw new Error("Missing Animation");
    await act(async () => {
      row.focus();
      row.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(libraryChrome.getState().nav).toEqual({
      kind: "tag",
      name: "Animation",
    });
    expect(router.state.location.pathname).toBe("/");
  });

  it("selects a tag only with Shift-click and shows no checkbox", async () => {
    await mount();
    const row = host.querySelector('[role="option"]');
    const checkbox = host.querySelector('[aria-label="Select Animation"]');
    if (!(row instanceof HTMLDivElement)) throw new Error("Missing tag row");

    expect(checkbox).toBeNull();
    expect(row.firstElementChild?.textContent).toContain("Animation");
    libraryChrome.setNav({ kind: "all" });
    await act(async () => {
      row.dispatchEvent(
        new MouseEvent("click", { bubbles: true, shiftKey: true }),
      );
    });
    expect(row.getAttribute("aria-selected")).toBe("true");
    expect(libraryChrome.getState().nav).toEqual({ kind: "all" });
    expect(host.querySelector('[role="option"][title="Animation"]')).toBe(row);
  });

  it("supports New Group on the library page", async () => {
    await mount();
    const button = [...host.querySelectorAll("button")].find(
      (node) =>
        node.textContent === "New Group" ||
        node.getAttribute("aria-label") === "New Group",
    );
    if (!button) throw new Error("Missing New Group");
    await act(async () => button.click());
    const draft = host.querySelector('input[placeholder="Group name"]');
    if (!(draft instanceof HTMLInputElement)) throw new Error("Missing draft");
    await fill(draft, "Design");
    await act(async () => {
      draft.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(query).toHaveBeenCalledWith("tagGroups.create", { name: "Design" });
  });

  it("opens the inline draft requested from global New Tag actions", async () => {
    tagCreation.request("tag");
    await mount();
    expect(host.querySelector('input[aria-label="Tag name"]')).not.toBeNull();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
});
