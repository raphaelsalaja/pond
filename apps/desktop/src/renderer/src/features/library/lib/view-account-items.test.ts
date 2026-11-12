import { EMPTY_QUERY } from "@pond/schema/filters/types";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildBreadcrumbs } from "@/app/components/toolbar/breadcrumbs";
import { libraryChrome } from "@/features/library/state/library-chrome";
import { navigationHistory } from "@/features/library/state/navigation-history";
import {
  applySavedView,
  getViewState,
  resetFilters,
  setQuery,
} from "@/features/library/state/view-store";
import { setAppRouter } from "@/shared/lib/app-router";
import type { LibraryNav } from "@/shared/lib/library-nav";
import { viewAccountItems } from "./view-account-items";

const ACCOUNT = "acct-1";
const FOLDER: LibraryNav = { kind: "folder", id: "Alpha" };
const folders = [{ id: "Alpha", name: "Inspiration", parentId: null }];

const previousDestinations: LibraryNav[] = [
  FOLDER,
  { kind: "uncategorized" },
  { kind: "tag", name: "Design" },
  { kind: "recentlyAdded" },
  { kind: "recents" },
  { kind: "random" },
  { kind: "trash" },
  { kind: "sources" },
];

async function openAt(path: string) {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  setAppRouter(router);
  await router.load();
  return router;
}

function restrictToFolder(): void {
  libraryChrome.setNav(FOLDER);
  applySavedView({
    id: "smart",
    kind: "smart_folder",
    query: {
      combinator: "and",
      rules: [{ field: "folder", operator: "some", value: ["Alpha"] }],
    },
    inheritedQuery: {
      combinator: "and",
      rules: [{ field: "tags", operator: "some", value: ["Design"] }],
    },
  });
}

describe("viewAccountItems", () => {
  beforeEach(() => {
    resetFilters();
    libraryChrome.setNav({ kind: "all" });
    navigationHistory.clear();
  });

  afterEach(() => {
    resetFilters();
    libraryChrome.setNav({ kind: "all" });
    navigationHistory.clear();
  });

  it("shows every save from a source after browsing a folder", async () => {
    restrictToFolder();
    const router = await openAt(`/sources/account/${ACCOUNT}`);

    viewAccountItems(ACCOUNT);

    expect(router.history.location.pathname).toBe("/");
    expect(libraryChrome.getState().nav).toEqual({ kind: "all" });
    expect(getViewState()).toMatchObject({
      activeViewId: null,
      inheritedQuery: EMPTY_QUERY,
      query: {
        combinator: "and",
        rules: [{ field: "account", operator: "eq", value: ACCOUNT }],
      },
    });
    expect(navigationHistory.snapshot().entries.at(-1)).toEqual({
      kind: "all",
    });
    expect(
      buildBreadcrumbs({
        pathname: router.history.location.pathname,
        listPath: "/",
        nav: libraryChrome.getState().nav,
        folders,
        searchResultCount: 12,
      }),
    ).toEqual([
      { label: "All", path: "/", nav: { kind: "all" } },
      { label: "Search results (12)", path: "/" },
    ]);
  });

  it.each(previousDestinations)(
    "clears the $kind destination when showing a source",
    async (nav) => {
      libraryChrome.setNav(nav);
      setQuery({
        combinator: "and",
        rules: [{ field: "folder", operator: "some", value: ["Alpha"] }],
      });
      const router = await openAt("/sources/account/acct-1");

      viewAccountItems(ACCOUNT);

      expect(router.history.location.pathname).toBe("/");
      expect(libraryChrome.getState().nav).toEqual({ kind: "all" });
      expect(getViewState().query.rules).toEqual([
        { field: "account", operator: "eq", value: ACCOUNT },
      ]);
    },
  );

  it("keeps the source filter when All was already open", async () => {
    libraryChrome.setNav({ kind: "all" });
    const router = await openAt("/sources");

    viewAccountItems(ACCOUNT);

    expect(router.history.location.pathname).toBe("/");
    expect(libraryChrome.getState().nav).toEqual({ kind: "all" });
    expect(getViewState().query.rules).toEqual([
      { field: "account", operator: "eq", value: ACCOUNT },
    ]);
    expect(navigationHistory.snapshot().entries).toEqual([{ kind: "all" }]);
  });

  it("filters several sources together on All", async () => {
    libraryChrome.setNav(FOLDER);
    const router = await openAt("/sources");

    viewAccountItems(["acct-1", "acct-2"]);

    expect(router.history.location.pathname).toBe("/");
    expect(libraryChrome.getState().nav).toEqual({ kind: "all" });
    expect(getViewState().query.rules).toEqual([
      { field: "account", operator: "in", value: ["acct-1", "acct-2"] },
    ]);
  });

  it("ignores an empty source id", async () => {
    libraryChrome.setNav(FOLDER);
    setQuery({
      combinator: "and",
      rules: [{ field: "tags", operator: "some", value: ["Design"] }],
    });
    const router = await openAt("/sources/account/acct-1");

    viewAccountItems([]);

    expect(router.history.location.pathname).toBe("/sources/account/acct-1");
    expect(libraryChrome.getState().nav).toEqual(FOLDER);
    expect(getViewState().query.rules).toEqual([
      { field: "tags", operator: "some", value: ["Design"] },
    ]);
  });
});
