import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { searchViewKey } from "@/features/library/lib/search-view";
import { libraryChrome } from "@/features/library/state/library-chrome";
import {
  getViewState,
  resetFilters,
  setSearchDraft,
} from "@/features/library/state/view-store";
import { setAppRouter } from "@/shared/lib/app-router";
import {
  handleNativeMenuAction,
  shouldIgnoreMenuAction,
} from "./native-menu-actions";

let editor: HTMLDivElement;

beforeEach(() => {
  editor = document.createElement("div");
  editor.contentEditable = "true";
  editor.tabIndex = 0;
  editor.setAttribute("role", "textbox");
  document.body.append(editor);
});

afterEach(() => {
  editor.remove();
});

it("ignores a native accelerator while the fish composer owns the keyboard", () => {
  editor.focus();
  expect(document.activeElement).toBe(editor);

  expect(shouldIgnoreMenuAction("accelerator", "view.sidebar.toggle")).toBe(
    true,
  );
  expect(shouldIgnoreMenuAction("accelerator", "view.layout.waterfall")).toBe(
    true,
  );
});

it("ignores a native accelerator while a native input is focused", () => {
  const input = document.createElement("input");
  document.body.append(input);
  input.focus();
  expect(shouldIgnoreMenuAction("accelerator", "save.open-with-default")).toBe(
    true,
  );
  input.remove();
});

it("allows Search from a field when the field did not handle it", () => {
  editor.focus();

  expect(shouldIgnoreMenuAction("accelerator", "library.search")).toBe(false);
});

it("allows a native accelerator outside an editor", () => {
  document.body.focus();

  expect(shouldIgnoreMenuAction("accelerator", "view.sidebar.toggle")).toBe(
    false,
  );
});

it("allows an explicit menu command while an editor has focus", () => {
  editor.focus();

  expect(shouldIgnoreMenuAction("menu", "view.sidebar.toggle")).toBe(false);
});

describe("Search All Saves", () => {
  async function openAt(path: string) {
    const rootRoute = createRootRoute();
    const router = createRouter({
      routeTree: rootRoute.addChildren(
        ["/", "/trash"].map((route) =>
          createRoute({ getParentRoute: () => rootRoute, path: route }),
        ),
      ),
      history: createMemoryHistory({ initialEntries: [path] }),
    });
    setAppRouter(router);
    await router.load();
    return router;
  }

  beforeEach(() => {
    resetFilters();
  });

  it("widens a folder search in place", async () => {
    libraryChrome.setNav({ kind: "folder", id: "design" });
    setSearchDraft("poster");
    const router = await openAt("/");

    handleNativeMenuAction("find.search-all");

    expect(getViewState()).toMatchObject({
      q: "poster",
      searchAllView: searchViewKey({ kind: "folder", id: "design" }),
    });
    expect(libraryChrome.getState().nav).toEqual({
      kind: "folder",
      id: "design",
    });
    expect(router.history.location.pathname).toBe("/");

    handleNativeMenuAction("find.search");
    expect(getViewState().searchAllView).toBeNull();
  });

  it("leaves Trash for the Library instead of mixing deleted Saves in", async () => {
    libraryChrome.setNav({ kind: "trash" });
    const router = await openAt("/trash");

    handleNativeMenuAction("find.search-all");

    expect(getViewState().searchAllView).toBeNull();
    expect(libraryChrome.getState().nav).toEqual({ kind: "all" });
    expect(router.history.location.pathname).toBe("/");
  });
});
