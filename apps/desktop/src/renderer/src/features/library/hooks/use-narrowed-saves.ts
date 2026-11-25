import { splitPostPredicate } from "@pond/schema/filters/fields";
import type { LibraryQueryRequest } from "@shared/library-query";
import { recentlyAddedSince } from "@shared/recently-added";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { searchViewFor } from "@/features/library/lib/search-view";
import { combineQueries } from "@/features/library/lib/smart-folders";
import { createRowJoiner } from "@/features/library/lib/stable-rows";
import {
  useFolderMemberships,
  useFolders,
} from "@/features/library/state/folders";
import { useLibraryNav } from "@/features/library/state/library-chrome";
import {
  cachedQueryPage,
  createQuerySession,
} from "@/features/library/state/query-session";
import type {
  QuerySessionRuntime,
  QuerySessionState,
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
import { ensureSaves, reloadSaves, useSaves } from "@/features/saves/pool";
import {
  syncDepartingSaveIds,
  useTagPickerIds,
} from "@/features/saves/tag-picker";
import type { Save } from "@/features/saves/types";
import { keywordScopesFromPrefs, useRetrievalOverlay } from "@/features/search";
import { useStableStrings } from "@/shared/hooks/use-stable-array";
import { inboxScope } from "@/shared/lib/library-nav";
import type { LibraryNav } from "@/shared/lib/library-nav";
import { onSyncRefetch } from "@/shared/lib/sync-refetch";
import { usePrefs } from "@/shared/state/prefs";
import { useRetainedTagPickerSaves } from "./retain-tag-picker-saves";

/** Long enough to span a pause between keystrokes, so results swap once typing stops. */
const KEYWORD_DEBOUNCE_MS = 250;
const NO_PINS: ReadonlyArray<string> = [];
/** Results depend on Save rows, folder membership, the folder tree, and tag names. */
const LIBRARY_PAGE_MODELS = ["save", "save_folder", "folder", "tag"] as const;

const ALL: LibraryNav = { kind: "all" };

const runtime: QuerySessionRuntime = {
  page: (request) => window.pond.query("saves.queryPage", request),
  ids: (request) => window.pond.query("saves.queryIds", request),
  refresh: reloadSaves,
  ensure: ensureSaves,
};

export function useNarrowedSaves(mode: SaveListMode, sourceFilter: string) {
  const saves = useSaves();
  const recents = useRecents();
  const query = useEffectiveFilterQuery();
  const keywords = useSearchText();
  const nav = useLibraryNav() ?? ALL;
  const searchScope = useSearchScope(searchViewFor(nav));
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
  const postKey = !searchEverywhere && nav.kind === "post" ? nav.key : null;
  const ascending = postKey !== null || (!recentlyAdded && sortDir === "asc");
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
    if (viewsReady) {
      activateFolderPresentation(
        folderId,
        folderId ? folderViews[folderId] : undefined,
      );
    }
  }, [folderId, folderViews, viewsReady]);
  const request = useMemo<LibraryQueryRequest>(
    () => ({
      query: postKey
        ? combineQueries([
            query,
            { combinator: "and", rules: [splitPostPredicate(postKey)] },
          ])
        : query,
      keywords,
      keywordScopes: keywordScopesFromPrefs(searchPrefs.scopes),
      sortKey: recentlyAdded ? "savedAt" : postKey ? "post" : sortKey,
      randomSeed,
      orderFolderId: searchEverywhere ? undefined : (folderId ?? undefined),
      sortDir: ascending ? "asc" : "desc",
      scope: {
        savedSince:
          recentlyAdded && addedSince !== null ? addedSince : undefined,
        deletedOnly: mode === "trash",
        source: searchEverywhere ? undefined : sourceFilter || undefined,
        untagged: !searchEverywhere && mode === "untagged",
        uncategorized: !searchEverywhere && nav.kind === "uncategorized",
        inbox:
          !searchEverywhere && nav.kind === "inbox"
            ? inboxScope(nav)
            : undefined,
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
      postKey,
      sortKey,
      randomSeed,
      folderId,
      ascending,
      mode,
      sourceFilter,
      nav,
      includeSubfolders,
      folders,
      recentSaveIds,
      addedSince,
    ],
  );
  const [state, setState] = useState<QuerySessionState>(() => ({
    page: cachedQueryPage(runtime, request),
    loading: true,
    error: null,
  }));
  const [session] = useState(() => createQuerySession(runtime, setState));
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
  useEffect(
    () =>
      onSyncRefetch({
        models: LIBRARY_PAGE_MODELS,
        delayMs: 100,
        run: () => session.reload(),
      }),
    [session],
  );
  const manualOrder = folderId ? folderViews[folderId]?.manualOrder : undefined;
  const previousOrder = useRef(manualOrder);
  useEffect(() => {
    if (previousOrder.current !== manualOrder && sortKey === "manual") {
      void session.load();
    }
    previousOrder.current = manualOrder;
  }, [manualOrder, sortKey, session]);
  const pinScope = request.orderFolderId;
  const pinnedIds = useStableStrings(
    (pinScope ? folderViews[pinScope]?.pinnedIds : undefined) ?? NO_PINS,
  );
  const previousPins = useRef({ scope: pinScope, ids: pinnedIds });
  useEffect(() => {
    const previous = previousPins.current;
    if (previous.scope === pinScope && previous.ids !== pinnedIds) {
      void session.load();
    }
    previousPins.current = { scope: pinScope, ids: pinnedIds };
  }, [pinScope, pinnedIds, session]);
  const { page, loading, error } = state;
  const [joinRows] = useState(createRowJoiner);
  const filtered = useMemo(() => {
    const listed: Array<Save> = [];
    const byId = new Map(saves.map((save) => [save.id, save]));
    for (const id of page?.ids ?? []) {
      const save = byId.get(id);
      if (save) listed.push(save);
    }
    if (mode === "recents") {
      const order = new Map(
        recents.map((entry, index) => [entry.saveId, index]),
      );
      listed.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    }
    return joinRows(listed, memberships);
  }, [page, saves, memberships, mode, recents, joinRows]);
  const ranked = useRetrievalOverlay(filtered, request);
  const heldIds = useTagPickerIds();
  const retained = useRetainedTagPickerSaves(ranked, heldIds);
  const departedKey = retained.departedIds.join("\0");
  const departedRef = useRef(retained.departedIds);
  useLayoutEffect(() => {
    departedRef.current = retained.departedIds;
  });
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
    pinnedIds,
    loadMore,
    allIds,
    retry: () => session.load(),
  };
}
