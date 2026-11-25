import type { RouteLocation } from "@/shared/hooks/use-route-location";
import type { RouteSearch } from "@/shared/lib/route-search";

let lastOutsideInbox = "/";

/** Leaving the Inbox, Settings or a Canvas returns here, with the search and filters it had. */
export function lastGridHrefOutsideInbox(): string {
  return lastOutsideInbox;
}

export function rememberGridLocation(
  location: RouteLocation,
  stringifySearch: (search: RouteSearch) => string,
  inbox: boolean,
): void {
  const { save: _save, ...search } = location.search;
  const href = `${location.pathname}${stringifySearch(search)}`;
  if (!inbox) lastOutsideInbox = href;
}
