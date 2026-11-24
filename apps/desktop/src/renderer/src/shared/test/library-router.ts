import {
  type AnyRoute,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type RouteComponent,
} from "@tanstack/react-router";
import { librarySearchSchema } from "@/features/search/lib/schemas";
import { Route as FolderRoute } from "@/routes/_library/_grid/folders.$folderId";
import { Route as InboxRoute } from "@/routes/_library/_grid/inbox";
import { Route as SnoozedRoute } from "@/routes/_library/_grid/inbox.snoozed";
import { Route as IndexRoute } from "@/routes/_library/_grid/index";
import { Route as RandomRoute } from "@/routes/_library/_grid/random";
import { Route as RecentlyAddedRoute } from "@/routes/_library/_grid/recently-added";
import { Route as RecentsRoute } from "@/routes/_library/_grid/recents";
import { Route as SplitPostRoute } from "@/routes/_library/_grid/split-posts.$postKey";
import { Route as TagRoute } from "@/routes/_library/_grid/tags.$tag";
import { Route as TrashRoute } from "@/routes/_library/_grid/trash";
import { Route as UncategorizedRoute } from "@/routes/_library/_grid/uncategorized";
import { Route as UntaggedRoute } from "@/routes/_library/_grid/untagged";
import { Route as ViewRoute } from "@/routes/_library/_grid/views.$viewId";
import { Route as DownloadsRoute } from "@/routes/_library/downloads";
import { Route as SourcesRoute } from "@/routes/_library/sources";
import { Route as TagsRoute } from "@/routes/_library/tags";
import { setAppRouter } from "@/shared/lib/app-router";

const GRID_ROUTES = [
  ["/", IndexRoute],
  ["folders/$folderId", FolderRoute],
  ["inbox", InboxRoute],
  ["inbox/snoozed", SnoozedRoute],
  ["random", RandomRoute],
  ["recently-added", RecentlyAddedRoute],
  ["recents", RecentsRoute],
  ["split-posts/$postKey", SplitPostRoute],
  ["tags/$tag", TagRoute],
  ["trash", TrashRoute],
  ["uncategorized", UncategorizedRoute],
  ["untagged", UntaggedRoute],
  ["views/$viewId", ViewRoute],
] as const;

const RAIL_ROUTES = [
  ["tags", TagsRoute],
  ["sources", SourcesRoute],
  ["downloads", DownloadsRoute],
] as const;

export interface LibraryTestRouterOptions {
  /** Extra page routes a test needs under `_library`, such as `settings/$section`. */
  routes?: (library: AnyRoute) => AnyRoute[];
  /** Rendered as the root, standing in for the shell; no page component mounts. */
  component?: RouteComponent;
}

/**
 * The app's Library route ids and `staticData` without its page components.
 * @remarks Leaf options come from the real route files, so collection and surface metadata cannot drift.
 */
export function createLibraryTestRouter(
  path = "/",
  { routes = () => [], component }: LibraryTestRouterOptions = {},
) {
  const root = createRootRoute({ component });
  const library = createRoute({
    getParentRoute: () => root,
    id: "_library",
    validateSearch: librarySearchSchema,
  });
  const grid = createRoute({
    getParentRoute: () => library,
    id: "_grid",
    staticData: { surface: "grid" },
  });
  /** SAFETY: each child takes the options of its own route file, whose union `createRoute` can't infer. */
  const gridChildren = GRID_ROUTES.map(([childPath, file]) =>
    createRoute({
      getParentRoute: () => grid,
      path: childPath,
      staticData: file.options.staticData,
      validateSearch: file.options.validateSearch,
      beforeLoad: file.options.beforeLoad,
    } as never),
  );
  const railChildren = RAIL_ROUTES.map(([childPath, file]) =>
    createRoute({
      getParentRoute: () => library,
      path: childPath,
      staticData: file.options.staticData,
    }),
  );
  const router = createRouter({
    routeTree: root.addChildren([
      library.addChildren([
        grid.addChildren(gridChildren),
        ...railChildren,
        ...routes(library),
      ]),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  setAppRouter(router);
  return router;
}

export type LibraryTestRouter = ReturnType<typeof createLibraryTestRouter>;

/** Loads the initial entry so `router.state.location` and route metadata are settled. */
export async function openLibraryAt(
  path = "/",
  options?: LibraryTestRouterOptions,
): Promise<LibraryTestRouter> {
  const router = createLibraryTestRouter(path, options);
  await router.load();
  return router;
}

/** The committed or pending location, whichever a navigation last wrote. */
export function currentLocation(router: LibraryTestRouter) {
  return router.parseLocation(router.history.location);
}
