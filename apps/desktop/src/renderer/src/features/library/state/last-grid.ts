import type { RouteLocation } from "@/shared/hooks/use-route-location";
import type { RouteSearch } from "@/shared/lib/route-search";

let lastHref = "/";
let lastOutsideInbox = "/";

/** Leaving Settings or a Canvas returns here, with the search and filters it had. */
export function lastGridHref(): string {
  return lastHref;
}

/** Leaving the Inbox returns to the collection you came from, never to another Inbox screen. */
export function lastGridHrefOutsideInbox(): string {
  return lastOutsideInbox;
}

export function rememberGridLocation(
  location: RouteLocation,
  stringifySearch: (search: RouteSearch) => string,
  inbox: boolean,
): void {
  const { save: _save, ...search } = location.search;
  lastHref = `${location.pathname}${stringifySearch(search)}`;
  if (!inbox) lastOutsideInbox = lastHref;
}
