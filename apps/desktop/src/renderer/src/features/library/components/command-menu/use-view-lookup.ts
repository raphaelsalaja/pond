import { EMPTY_QUERY } from "@pond/schema/filters/types";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { keywordScopesFromPrefs } from "@/features/search";
import { usePrefs } from "@/shared/state/prefs";
import type { ViewScope } from "./use-view-scope";

const LIMIT = 8;
const DELAY_MS = 60;

const PageSchema = z
  .object({ ids: z.array(z.string()).catch([]) })
  .catch({ ids: [] });

interface ViewLookup {
  ids: readonly string[];
  searching: boolean;
}

interface LookupState {
  key: string;
  query: string;
  ids: readonly string[];
}

const IDLE: ViewLookup = { ids: [], searching: false };

/** Keyword matches inside the current view, so its Saves show up even when they miss the Library's top hits. */
export function useViewLookup(
  query: string,
  scope: ViewScope | null,
): ViewLookup {
  const [searchPrefs] = usePrefs("search");
  const trimmed = query.trim();
  const request = scope ? JSON.stringify(scope.request) : "";
  const keywordScopes = useMemo(
    () => keywordScopesFromPrefs(searchPrefs.scopes),
    [searchPrefs.scopes],
  );
  const scopes = keywordScopes?.join(",") ?? "";
  const key = trimmed && request ? `${request}\n${scopes}\n${trimmed}` : "";
  const [state, setState] = useState<LookupState | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void window.pond
        .query("saves.queryPage", {
          query: EMPTY_QUERY,
          keywords: trimmed,
          keywordScopes,
          scope: JSON.parse(request),
          limit: LIMIT,
        })
        .then((page) => PageSchema.parse(page).ids)
        .catch((error) => {
          console.warn("[pond search] view lookup failed", error);
          return [];
        })
        .then((ids) => {
          if (!cancelled) setState({ key, query: trimmed, ids });
        });
    }, DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, trimmed, request, keywordScopes]);

  if (!key) return IDLE;
  if (state?.key === key) return { ids: state.ids, searching: false };
  if (
    state?.key.startsWith(`${request}\n${scopes}\n`) &&
    (trimmed.startsWith(state.query) || state.query.startsWith(trimmed))
  )
    return { ids: state.ids, searching: true };
  return { ids: [], searching: true };
}
