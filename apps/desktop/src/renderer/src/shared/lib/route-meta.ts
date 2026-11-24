import type { IconComponent } from "@pond/icons/types";
import { useLocation, useRouter } from "@tanstack/react-router";
import type { AnyRouter } from "@tanstack/react-router";
import { useRouteLocation } from "@/shared/hooks/use-route-location";
import { getAppRouter } from "@/shared/lib/app-router";
import type { LibraryNav } from "@/shared/lib/library-nav";

/** `grid` shows the Library grid, `rail` a rail page kept alive by `RailPages`, `page` renders through the outlet. */
export type Surface = "grid" | "rail" | "page";

export type ShellDetails = "save" | "fish";

export type RailPage = "tags" | "sources" | "downloads";

export type RouteParams = Readonly<Record<string, string>>;

export interface RouteCrumb {
  label: string;
  icon: IconComponent;
}

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /** Set on a layout to cover every route under it; the deepest route that says wins. */
    surface?: Surface;
    /** Which Details column the page offers; `null` removes the column and its toggle. */
    details?: ShellDetails | null;
    /** Kept mounted by `RailPages` across rail switches instead of rendering through the outlet. */
    railPage?: RailPage;
    /** `rail` narrows the Sidebar to its rail, for a page with no list to show beside it; `null` removes the column and its toggle. */
    sidebar?: "rail" | null;
    /** The Library collection this route shows, built from its params. */
    nav?: (params: RouteParams) => LibraryNav;
    /** The root breadcrumb for a page whose label does not depend on data. */
    crumb?: RouteCrumb;
  }
}

export interface RouteMeta {
  surface: Surface;
  details: ShellDetails | null;
  railPage: RailPage | null;
  railOnly: boolean;
  sidebarHidden: boolean;
  nav: LibraryNav | null;
  crumb: RouteCrumb | null;
  params: RouteParams;
  routeId: string | null;
}

function isRouteId(value: unknown): value is string {
  return typeof value === "string";
}

const resolved = new WeakMap<AnyRouter, Map<string, RouteMeta>>();
const CACHE_SIZE = 32;

function resolve(router: AnyRouter, pathname: string): RouteMeta {
  const [branch, params, leaf] = router.getMatchedRoutes(pathname);
  let surface: Surface | undefined;
  let details: ShellDetails | null | undefined;
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const data = branch[index]?.options.staticData;
    if (!data) {
      continue;
    }
    surface ??= data.surface;
    if (details === undefined && data.details !== undefined) {
      details = data.details;
    }
  }
  const data = leaf?.options.staticData;
  const routeId: unknown = leaf?.id;
  return {
    surface: surface ?? (data?.railPage ? "rail" : "page"),
    details: details === undefined ? "save" : details,
    railPage: data?.railPage ?? null,
    railOnly: data?.sidebar === "rail",
    sidebarHidden: data?.sidebar === null,
    nav: data?.nav?.(params) ?? null,
    crumb: data?.crumb ?? null,
    params,
    routeId: isRouteId(routeId) ? routeId : null,
  };
}

/** Memoized per pathname so the `nav` object stays stable while the route does. */
export function routeMeta(router: AnyRouter, pathname: string): RouteMeta {
  let cache = resolved.get(router);
  if (!cache) {
    cache = new Map();
    resolved.set(router, cache);
  }
  const hit = cache.get(pathname);
  if (hit) {
    cache.delete(pathname);
    cache.set(pathname, hit);
    return hit;
  }
  const meta = resolve(router, pathname);
  cache.set(pathname, meta);
  if (cache.size > CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }
  return meta;
}

/** Follows the committed location, so chrome swaps in the same frame as the page. */
export function useRouteMeta(): RouteMeta {
  const router = useRouter();
  const pathname = useRouteLocation((location) => location.pathname);
  return routeMeta(router, pathname);
}

/** Follows the latest location, for chrome that must move before a code-split page loads. */
export function useLatestRouteMeta(): RouteMeta {
  const router = useRouter();
  const pathname = useLocation({ select: (location) => location.pathname });
  return routeMeta(router, pathname);
}

/** The route a navigation is heading to, read synchronously for event handlers and stores. */
export function currentRouteMeta(): RouteMeta | null {
  const router = getAppRouter();
  if (!router) {
    return null;
  }
  return routeMeta(router, router.latestLocation.pathname);
}
