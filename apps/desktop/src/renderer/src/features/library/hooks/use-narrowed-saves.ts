import type { LibraryQueryRequest } from "@shared/library-query";
import { recentlyAddedSince } from "@shared/recently-added";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchViewFor } from "@/features/library/lib/search-view";
import {
  useFolderMemberships,
  useFolders,
} from "@/features/library/state/folders";
import { useLibraryNav } from "@/features/library/state/library-chrome";
import {
  createQuerySession,
  type QuerySessionState,
} from "@/features/library/state/query-session";
import {
  activateFolderPresentation,
  useEffectiveFilterQuery,
  useIncludeSubfolders,
  useRandomSeed,
  useSearchScope,
  useSearchText,
  useSortDir,
  useSortKey,
} from "@/features/library/state/view-store";
import type { SaveListMode } from "@/features/saves";
import { descendantFolderIds, useRecents } from "@/features/saves";
import { reloadSaves, useSaves } from "@/features/saves/pool";
import {
  syncDepartingSaveIds,
  useTagPickerIds,
} from "@/features/saves/tag-picker";
import type { Save } from "@/features/saves/types";
import { keywordScopesFromPrefs, useRetrievalOverlay } from "@/features/search";
import { usePrefs } from "@/shared/state/prefs";
import { useRetainedTagPickerSaves } from "./retain-tag-picker-saves";

/** Long enough to span a pause between keystrokes, so results swap once typing stops. */
const KEYWORD_DEBOUNCE_MS = 250;

export function useNarrowedSaves(mode: SaveListMode, sourceFilter: string) {
  const saves = useSaves();
  const recents = useRecents();
  const query = useEffectiveFilterQuery();
  const keywords = useSearchText();
  const nav = useLibraryNav();
  const searchScope = useSearchScope(searchViewFor(mode, nav));
  const sortKey = useSortKey();
  const sortDir = useSortDir();
  const randomSeed = useRandomSeed();
  const [folderViews, , viewsReady] = usePrefs("folderViews");
  const [searchPrefs] = usePrefs("search");
  const includeSubfolders = useIncludeSubfolders();
  const memberships = useFolderMemberships();
  const folders = useFolders();
  const folderId = nav.kind === "folder" ? nav.id : null;
  const searchEverywhere = searchScope === "all" && keywords.trim().length > 0;
  const recentlyAdded = !searchEverywhere && mode === "recentlyAdded";
  // A visit rewrites recents for every collection. Only Recents queries by those ids.
  const recentSaveIds = useMemo(
    () => (mode === "recents" ? recents.map((entry) => entry.saveId) : null),
    [mode, recents],
  );
  // Hold the 7-day boundary while Recently Added stays open. Sampling the clock
  // again when a Save opens would change the query, clear the page, and the
  // preview would read that empty page as the Save leaving.
  const [addedSince, setAddedSince] = useState<number | null>(null);
  if (recentlyAdded && addedSince === null) setAddedSince(recentlyAddedSince());
  else if (!recentlyAdded && addedSince !== null) setAddedSince(null);
  useEffect(() => {
    if (viewsReady)
      activateFolderPresentation(
        folderId,
        folderId ? folderViews[folderId] : undefined,
      );
  }, [folderId, folderViews, viewsReady]);
  const request = useMemo<LibraryQueryRequest>(
    () => ({
      query,
      keywords,
      keywordScopes: keywordScopesFromPrefs(searchPrefs.scopes),
      sortKey: recentlyAdded ? "savedAt" : sortKey,
      randomSeed,
      orderFolderId: searchEverywhere ? undefined : (folderId ?? undefined),
      sortDir: !recentlyAdded && sortDir === "asc" ? "asc" : "desc",
      scope: {
        savedSince:
          recentlyAdded && addedSince !== null ? addedSince : undefined,
        deletedOnly: mode === "trash",
        source: searchEverywhere ? undefined : sourceFilter || undefined,
        untagged: !searchEverywhere && mode === "untagged",
        uncategorized: !searchEverywhere && nav.kind === "uncategorized",
        folderIds:
          !searchEverywhere && nav.kind === "folder"
            ? [
                ...(includeSubfolders
                  ? descendantFolderIds(nav.id, folders)
                  : [nav.id]),
              ]
            : undefined,
        tag: !searchEverywhere && nav.kind === "tag" ? nav.name : undefined,
        saveIds:
          !searchEverywhere && mode === "recents"
            ? (recentSaveIds ?? [])
            : undefined,
      },
    }),
    [
      query,
      keywords,
      searchPrefs.scopes,
      searchEverywhere,
      recentlyAdded,
      sortKey,
      randomSeed,
      folderId,
      sortDir,
      mode,
      sourceFilter,
      nav,
      includeSubfolders,
      folders,
      recentSaveIds,
      addedSince,
    ],
  );
  const [state, setState] = useState<QuerySessionState>({
    page: null,
    loading: true,
    error: null,
  });
  const [session] = useState(() =>
    createQuerySession(
      {
        page: (request) => window.pond.query("saves.queryPage", request),
        ids: (request) => window.pond.query("saves.queryIds", request),
        refresh: reloadSaves,
      },
      setState,
    ),
  );
  useEffect(() => {
    const retyped = session.setRequest(request);
    const timer = setTimeout(
      () => {
        void session.load();
      },
      retyped && request.keywords?.trim() ? KEYWORD_DEBOUNCE_MS : 0,
    );
    return () => {
      clearTimeout(timer);
      session.cancel();
    };
  }, [request, session]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = window.pond.onSyncAction(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        void session.load();
      }, 100);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [session]);
  const manualOrder = folderId ? folderViews[folderId]?.manualOrder : undefined;
  const previousOrder = useRef(manualOrder);
  useEffect(() => {
    if (previousOrder.current !== manualOrder && sortKey === "manual")
      void session.load();
    previousOrder.current = manualOrder;
  }, [manualOrder, sortKey, session]);
  const { page, loading, error } = state;
  const filtered = useMemo(() => {
    const rows: Save[] = [];
    const byId = new Map(saves.map((save) => [save.id, save]));
    for (const id of page?.ids ?? []) {
      const save = byId.get(id);
      if (save) rows.push({ ...save, folderIds: memberships[id] ?? [] });
    }
    if (mode === "recents") {
      const order = new Map(
        recents.map((entry, index) => [entry.saveId, index]),
      );
      rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    }
    return rows;
  }, [page, saves, memberships, mode, recents]);
  const ranked = useRetrievalOverlay(filtered, request);
  const heldIds = useTagPickerIds();
  const retained = useRetainedTagPickerSaves(ranked, heldIds);
  const departedKey = retained.departedIds.join("\0");
  const departedRef = useRef(retained.departedIds);
  departedRef.current = retained.departedIds;
  useEffect(() => {
    const ids = departedKey.length === 0 ? [] : departedKey.split("\0");
    syncDepartingSaveIds(ids);
    return () => syncDepartingSaveIds([]);
  }, [departedKey]);
  const loadMore = useCallback(() => session.load(true), [session]);
  const allIds = useCallback(
    async () =>
      ranked !== filtered ? ranked.map((save) => save.id) : session.allIds(),
    [ranked, filtered, session],
  );
  return {
    queryKey: JSON.stringify(request),
    loadedIds: () => {
      const pageIds = session.snapshot().page?.ids ?? [];
      const extra = departedRef.current;
      if (extra.length === 0) return pageIds;
      const seen = new Set(pageIds);
      const missing = extra.filter((id) => !seen.has(id));
      return missing.length === 0 ? pageIds : [...pageIds, ...missing];
    },
    filtered: retained.rows,
    loading,
    settledEmpty: page !== null && page.ids.length === 0,
    error,
    total:
      ranked === filtered
        ? (page?.total ?? 0) + retained.departedIds.length
        : retained.rows.length,
    hasMore: ranked === filtered && !!page?.nextCursor,
    loadMore,
    allIds,
    retry: () => session.load(),
  };
}
