import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentLocation, openLibraryAt } from "@/app/test/library-router";
import { filterToolbar } from "@/features/library/components/filter-menu/toolbar-state";
import { searchViewKey } from "@/features/library/lib/search-view";
import { libraryHeader } from "@/features/library/state/library-header";
import {
  getViewState,
  resetFilters,
  setSearchDraft,
  setSort,
} from "@/features/library/state/view-store";
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
  beforeEach(() => {
    resetFilters();
  });

  it("widens a folder search in place", async () => {
    setSearchDraft("poster");
    const router = await openLibraryAt("/folders/design");

    handleNativeMenuAction("find.search-all");

    expect(getViewState()).toMatchObject({
      q: "poster",
      searchAllView: searchViewKey({ kind: "folder", id: "design" }),
    });
    expect(currentLocation(router).pathname).toBe("/folders/design");

    handleNativeMenuAction("find.search");
    expect(getViewState().searchAllView).toBeNull();
  });

  it("leaves Trash for the Library instead of mixing deleted Saves in", async () => {
    setSearchDraft("poster");
    const router = await openLibraryAt("/trash");

    handleNativeMenuAction("find.search-all");

    expect(getViewState().searchAllView).toBeNull();
    expect(currentLocation(router).pathname).toBe("/");
    expect(currentLocation(router).search).toMatchObject({ q: "poster" });
  });
});

function runGridCommands() {
  const focusSearch = vi.spyOn(libraryHeader, "focusSearch");
  const subfolders = getViewState().includeSubfolders;
  handleNativeMenuAction("find.search");
  handleNativeMenuAction("find.filters.toggle");
  handleNativeMenuAction("view.random");
  handleNativeMenuAction("view.subfolders.toggle");
  const result = {
    searched: focusSearch.mock.calls.length > 0,
    filtersOpen: filterToolbar.isOpen(),
    sortKey: getViewState().sortKey,
    subfoldersChanged: getViewState().includeSubfolders !== subfolders,
  };
  focusSearch.mockRestore();
  return result;
}

describe("grid-only commands", () => {
  beforeEach(() => {
    resetFilters();
    filterToolbar.setOpen(false);
    setSort({ key: "savedAt", dir: "desc" });
  });

  it("apply on a Library grid", async () => {
    await openLibraryAt("/folders/design");

    expect(runGridCommands()).toEqual({
      searched: true,
      filtersOpen: true,
      sortKey: "random",
      subfoldersChanged: true,
    });
  });

  it.each(["/downloads", "/tags", "/sources"])(
    "leave hidden view state alone on %s",
    async (path) => {
      await openLibraryAt(path);

      expect(runGridCommands()).toEqual({
        searched: false,
        filtersOpen: false,
        sortKey: "savedAt",
        subfoldersChanged: false,
      });
    },
  );

  it("leave the grid under an open Save alone", async () => {
    await openLibraryAt("/folders/design?save=demo");

    expect(runGridCommands()).toEqual({
      searched: false,
      filtersOpen: false,
      sortKey: "savedAt",
      subfoldersChanged: false,
    });
  });

  it("keep search and filters in Inbox review but not view options", async () => {
    await openLibraryAt("/inbox");

    expect(runGridCommands()).toEqual({
      searched: true,
      filtersOpen: true,
      sortKey: "savedAt",
      subfoldersChanged: false,
    });
  });

  it("still lets Search All Saves leave a page for All", async () => {
    setSearchDraft("poster");
    const router = await openLibraryAt("/downloads");

    handleNativeMenuAction("find.search-all");

    expect(currentLocation(router).pathname).toBe("/");
  });
});
