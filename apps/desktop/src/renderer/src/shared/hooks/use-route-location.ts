import { useRouter } from "@tanstack/react-router";
import type { AnyRouter, ParsedLocation } from "@tanstack/react-router";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import type { RouteSearch } from "@/shared/lib/route-search";

export type RouteLocation = ParsedLocation<RouteSearch>;

const committed = new WeakMap<AnyRouter, Store<RouteLocation>>();

function committedLocation(router: AnyRouter): Store<RouteLocation> {
  const existing = committed.get(router);
  if (existing) return existing;
  const store = new Store<RouteLocation>(
    router.state.resolvedLocation ?? router.state.location,
  );
  /** `onLoad` fires inside the commit that publishes the new matches, so this store updates in the same render as the page. */
  router.subscribe("onLoad", (event) => {
    store.setState(() => event.toLocation);
  });
  committed.set(router, store);
  return store;
}

/** Router `location` moves when a navigation starts, before the page renders; chrome reads this one so it swaps in the same frame as the page. */
export function useRouteLocation<T>(select: (location: RouteLocation) => T): T {
  return useSelector(committedLocation(useRouter()), select);
}
