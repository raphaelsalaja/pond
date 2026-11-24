import type { Query } from "@pond/schema/filters/types";
import type { JsonValue } from "@pond/schema/json";
import { getAppHistory, getAppRouter } from "@/shared/lib/app-router";

/** The router JSON-parses each search param, and filter queries are written back as objects. */
export type SearchValue = JsonValue | Query;
export type RouteSearch = Readonly<Record<string, SearchValue>>;
export type SearchPatch = Readonly<Record<string, SearchValue | undefined>>;

function isRouteSearch(value: unknown): value is RouteSearch {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The latest location's search, which already reflects a write made earlier in the same tick. */
export function latestSearch(): RouteSearch {
  const search: unknown = getAppRouter()?.latestLocation.search;
  return isRouteSearch(search) ? search : {};
}

/** Applies `patch` to `search`; an `undefined` value drops the key. */
export function patchSearch(
  search: RouteSearch,
  patch: SearchPatch,
): RouteSearch {
  const next = new Map(Object.entries(search));
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
  }
  return Object.fromEntries(next);
}

/** Applies `patch` to the latest location; an `undefined` value drops the key. */
export function hrefWithSearch(
  patch: SearchPatch,
  pathname?: string,
): string | null {
  const router = getAppRouter();
  if (!router) {
    return null;
  }
  const location = router.latestLocation;
  const current: unknown = location.search;
  const search = patchSearch(isRouteSearch(current) ? current : {}, patch);
  return `${pathname ?? location.pathname}${router.options.stringifySearch(search)}`;
}

/** Writes through history directly so subscribers see the new location before this returns. */
export function writeSearch(
  patch: SearchPatch,
  options: { replace?: boolean } = {},
): void {
  const router = getAppRouter();
  const history = getAppHistory();
  const href = hrefWithSearch(patch);
  if (!router || !history || !href || href === router.latestLocation.href) {
    return;
  }
  if (options.replace) {
    history.replace(href);
  } else {
    history.push(href);
  }
}
