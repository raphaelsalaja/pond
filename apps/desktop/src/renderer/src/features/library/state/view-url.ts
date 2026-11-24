import { EMPTY_QUERY, type Query } from "@pond/schema/filters/types";
import type { AnyRouter } from "@tanstack/react-router";
import {
  canSearchAllSaves,
  searchViewFor,
  searchViewKey,
} from "@/features/library/lib/search-view";
import { inheritedQueryFor } from "@/features/library/lib/smart-folders";
import {
  savedViews,
  subscribeSavedViews,
} from "@/features/library/state/saved-views";
import {
  applyLocationView,
  applySavedView,
  clearSavedView,
  getViewState,
  type LocationView,
  subscribeViewStore,
  takeLegacyFilters,
} from "@/features/library/state/view-store";
import { librarySearchSchema } from "@/features/search/lib/schemas";
import type { RouteLocation } from "@/shared/hooks/use-route-location";
import { type RouteMeta, routeMeta } from "@/shared/lib/route-meta";
import {
  patchSearch,
  type RouteSearch,
  type SearchPatch,
} from "@/shared/lib/route-search";

const VIEW_ROUTE = "/_library/_grid/views/$viewId";

interface Context {
  pathname: string;
  /** What the grid shows with no `filters` param: a saved view's rules, else none. */
  base: Query;
}

function sameQuery(a: Query, b: Query): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function stateView(): LocationView {
  const s = getViewState();
  return {
    q: s.q,
    query: s.query,
    semanticQuery: s.semanticQuery,
    searchAllView: s.searchAllView,
    urlSort: s.urlSort,
  };
}

function locationView(
  search: RouteSearch,
  meta: RouteMeta,
  base: Query,
): LocationView {
  const params = librarySearchSchema.parse(search);
  const view = searchViewFor(meta.nav);
  return {
    q: params.q ?? "",
    query: params.filters ?? base,
    semanticQuery: params.semantic ?? null,
    searchAllView:
      params.scope === "all" && canSearchAllSaves(view)
        ? searchViewKey(view)
        : null,
    urlSort: params.sort
      ? { key: params.sort, dir: params.dir ?? "desc" }
      : null,
  };
}

function searchPatch(view: LocationView, base: Query) {
  const unchanged =
    sameQuery(view.query, base) ||
    (view.query.rules.length === 0 && base.rules.length === 0);
  return {
    q: view.q || undefined,
    filters: unchanged ? undefined : view.query,
    semantic: view.semanticQuery ?? undefined,
    scope: view.searchAllView ? "all" : undefined,
    sort: view.urlSort?.key,
    dir: view.urlSort?.dir,
  } satisfies SearchPatch;
}

/** Mirrors the grid's search, filters and sort between the view store and the URL, which wins. */
export function startViewUrlSync(router: AnyRouter): () => void {
  let context: Context | null = null;
  let written = "";
  let applying = false;
  let waitingForViews = false;
  let legacy = takeLegacyFilters();

  const current = (): RouteLocation =>
    router.parseLocation(router.history.location);

  const write = () => {
    if (!context) return;
    const location = current();
    if (location.pathname !== context.pathname) return;
    const view = stateView();
    const key = JSON.stringify(view);
    if (key === written) return;
    written = key;
    const search = patchSearch(
      location.search,
      searchPatch(view, context.base),
    );
    const href = `${location.pathname}${router.options.stringifySearch(search)}`;
    if (href !== location.href) router.history.replace(href);
  };

  const sync = () => {
    const location = current();
    const meta = routeMeta(router, location.pathname);
    if (meta.surface !== "grid") return;
    const fresh = context?.pathname !== location.pathname;
    let base: Query = EMPTY_QUERY;
    applying = true;
    try {
      if (meta.routeId === VIEW_ROUTE) {
        const views = savedViews.snapshot();
        const view = views.find((entry) => entry.id === meta.params.viewId);
        waitingForViews = !view && !savedViews.loaded();
        if (!view) {
          if (!waitingForViews) router.history.replace("/");
          return;
        }
        base = view.query;
        if (fresh)
          applySavedView({
            ...view,
            inheritedQuery: inheritedQueryFor(view, views),
          });
      } else if (fresh) {
        clearSavedView();
      }
      context = { pathname: location.pathname, base };
      const next = locationView(location.search, meta, base);
      const key = JSON.stringify(next);
      if (!fresh && key === written) return;
      applyLocationView(next, fresh);
      written = JSON.stringify(stateView());
    } finally {
      applying = false;
    }
    if (legacy) {
      const seed = legacy;
      legacy = null;
      const params = librarySearchSchema.parse(location.search);
      if (!params.q && !params.filters && !params.semantic)
        applyLocationView(
          {
            ...stateView(),
            query: { combinator: seed.combinator, rules: seed.rows },
            semanticQuery: seed.semanticQuery,
          },
          false,
        );
    }
  };

  const stopStore = subscribeViewStore(() => {
    if (!applying) write();
  });
  const stopHistory = router.history.subscribe(sync);
  const stopViews = subscribeSavedViews(() => {
    if (waitingForViews) sync();
  });
  sync();
  return () => {
    stopStore();
    stopHistory();
    stopViews();
  };
}
