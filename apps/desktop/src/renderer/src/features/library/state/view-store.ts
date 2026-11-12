import type { SavedView } from "@pond/schema/db";
import { PredicateSchema } from "@pond/schema/filters";
import { FIELD_IDS } from "@pond/schema/filters/meta";
import type { FieldId, Predicate, Query } from "@pond/schema/filters/types";
import { EMPTY_QUERY } from "@pond/schema/filters/types";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { useMemo } from "react";
import { z } from "zod";
import type { SortDir } from "@/features/library/hooks/use-filtered-saves";
import { combineQueries } from "@/features/library/lib/smart-folders";
import {
  isLayoutValue,
  type LayoutValue,
  nextLayout,
  readViewPref,
  writeViewPref,
} from "@/features/library/lib/view-prefs";
import {
  clampZoom,
  ZOOM_DEFAULT,
  ZOOM_STORAGE_KEY,
} from "@/features/library/lib/zoom";
import {
  defaultPredicateFor,
  parseSearchInput,
  predicateIsActive,
} from "@/features/search/query";
import { notify } from "@/shared/lib/toast";
import {
  type FolderPresentation,
  saveFolderPresentation,
} from "./folder-presentation";

export type Combinator = "and" | "or";

function deriveQuery(
  rows: Predicate[],
  combinator: Combinator,
  previous: Query = EMPTY_QUERY,
): Query {
  return {
    ...previous,
    combinator,
    rules: [
      ...rows.filter(predicateIsActive),
      ...previous.rules.filter((clause) => "rules" in clause),
    ],
  };
}

function applyZoomVar(zoom: number): void {
  if (!globalThis.document) return;
  document.documentElement.style.setProperty("--grid-min", `${zoom}px`);
}

export type VisualProbe =
  | { kind: "saveId"; id: string; label: string }
  | { kind: "vector"; model: string; values: number[]; label: string };

interface ViewStoreState {
  q: string;
  searchInput: string;
  searchScope: "all" | "current";
  rows: Predicate[];
  combinator: Combinator;
  query: Query;
  inheritedQuery: Query;
  presentationFolderId: string | null;
  randomSeed: string;
  layout: LayoutValue;
  sortKey: string;
  sortDir: SortDir;
  zoom: number;
  capture: boolean;
  activeViewId: string | null;
  includeSubfolders: boolean;
  semanticQuery: string | null;
  visualProbe: VisualProbe | null;
}

function readInitialLayout(): LayoutValue {
  const raw = readViewPref("view");
  return raw && isLayoutValue(raw) ? raw : "waterfall";
}

function readInitialZoom(): number {
  if (!globalThis.window) return ZOOM_DEFAULT;
  try {
    const raw = window.localStorage.getItem(ZOOM_STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) ? clampZoom(parsed) : ZOOM_DEFAULT;
  } catch {
    return ZOOM_DEFAULT;
  }
}

const PersistedFilters = z.object({
  rows: z.array(PredicateSchema),
  combinator: z.enum(["and", "or"]),
  semanticQuery: z.string().nullable(),
});

type PersistedFilters = z.infer<typeof PersistedFilters>;

function readPersistedFilters(): PersistedFilters {
  const empty: PersistedFilters = {
    rows: [],
    combinator: "and",
    semanticQuery: null,
  };
  const raw = readViewPref("filterRules");
  if (!raw) return empty;
  try {
    const parsed = PersistedFilters.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : empty;
  } catch {
    return empty;
  }
}

/** Saved views own their rules, so only ad-hoc filters survive a reload. */
function persistedFiltersKey(state: ViewStoreState): string {
  return JSON.stringify(
    state.activeViewId
      ? { rows: [], combinator: "and", semanticQuery: null }
      : {
          rows: state.rows.filter(predicateIsActive),
          combinator: state.combinator,
          semanticQuery: state.semanticQuery,
        },
  );
}

const initialFilters = readPersistedFilters();

const store = new Store<ViewStoreState>({
  q: "",
  searchInput: "",
  searchScope: "all",
  rows: initialFilters.rows,
  combinator: initialFilters.combinator,
  query: deriveQuery(initialFilters.rows, initialFilters.combinator),
  inheritedQuery: EMPTY_QUERY,
  presentationFolderId: null,
  randomSeed: readViewPref("seed") ?? "pond",
  layout: readInitialLayout(),
  sortKey: readViewPref("sort") ?? "savedAt",
  sortDir: readViewPref("dir") === "asc" ? "asc" : "desc",
  zoom: readInitialZoom(),
  capture: false,
  activeViewId: null,
  includeSubfolders: readViewPref("subfolders") !== "0",
  semanticQuery: initialFilters.semanticQuery,
  visualProbe: null,
});

applyZoomVar(store.state.zoom);

let persistedFilters = persistedFiltersKey(store.state);
store.subscribe(() => {
  const next = persistedFiltersKey(store.state);
  if (next === persistedFilters) return;
  persistedFilters = next;
  writeViewPref("filterRules", next);
});

export function useViewStore(): ViewStoreState {
  return useSelector(store, (s) => s);
}

export function getViewState(): ViewStoreState {
  return store.state;
}

export function useFilterQuery(): Query {
  return useSelector(store, (s) => s.query);
}

export function useEffectiveFilterQuery(): Query {
  const query = useFilterQuery();
  const inheritedQuery = useSelector(store, (s) => s.inheritedQuery);
  return useMemo(
    () => combineQueries([inheritedQuery, query]),
    [inheritedQuery, query],
  );
}

export function setInheritedQuery(inheritedQuery: Query): void {
  store.setState((s) => ({ ...s, inheritedQuery }));
}

export function useHasActiveSearch(): boolean {
  return useSelector(store, (s) =>
    Boolean(
      s.q.trim() ||
        s.query.rules.length ||
        s.inheritedQuery.rules.length ||
        s.semanticQuery ||
        s.visualProbe,
    ),
  );
}

export function useLayout(): LayoutValue {
  return useSelector(store, (s) => s.layout);
}

export function useActiveViewId(): string | null {
  return useSelector(store, (s) => s.activeViewId);
}

export function useSearchText(): string {
  return useSelector(store, (s) => s.q);
}

export function useSearchInput(): string {
  return useSelector(store, (s) => s.searchInput);
}

export function useSearchScope(): "all" | "current" {
  return useSelector(store, (s) => s.searchScope);
}

export function setSearchScope(searchScope: "all" | "current"): void {
  store.setState((state) =>
    state.searchScope === searchScope ? state : { ...state, searchScope },
  );
}

export function useSortKey(): string {
  return useSelector(store, (s) => s.sortKey);
}

export function useSortDir(): SortDir {
  return useSelector(store, (s) => s.sortDir);
}
function _setSearchText(q: string): void {
  store.setState((s) => (s.q === q ? s : { ...s, q }));
}
export function setQuery(query: Query): void {
  store.setState((s) => {
    const rows = query.rules.filter((c): c is Predicate => !("rules" in c));
    const combinator: Combinator = query.combinator === "or" ? "or" : "and";
    return {
      ...s,
      rows,
      combinator,
      query: deriveQuery(rows, combinator, query),
    };
  });
}

export function setSearchInput(
  predicates: Predicate[],
  q: string,
  verbatim?: string,
): void {
  store.setState((s) => ({
    ...s,
    q,
    searchInput: verbatim ?? "",
    rows: predicates,
    combinator: "and",
    query: deriveQuery(predicates, "and", s.query),
  }));
}

export function updateLocalFilters(rows: Predicate[]): void {
  store.setState((s) => ({
    ...s,
    searchInput: s.q,
    rows,
    query: deriveQuery(rows, s.combinator, s.query),
  }));
}

export function setSearchDraft(raw: string, commitFilters = false): void {
  const parsed = parseSearchInput(raw);
  const key = (row: Predicate) =>
    JSON.stringify([row.field, row.operator, row.value, row.negate ?? false]);
  store.setState((state) => {
    const previousTokens = new Set(
      parseSearchInput(state.searchInput).predicates.map(key),
    );
    const rows = [
      ...state.rows.filter((row) => !previousTokens.has(key(row))),
      ...parsed.predicates,
    ];
    const seen = new Set<string>();
    const unique = rows.filter((row) => {
      const value = key(row);
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
    return {
      ...state,
      q: parsed.text,
      searchInput: commitFilters ? parsed.text : raw,
      rows: unique,
      query: deriveQuery(unique, state.combinator, state.query),
    };
  });
}

export function resetFilters(): void {
  store.setState((s) => ({
    ...s,
    q: "",
    searchInput: "",
    rows: [],
    query: EMPTY_QUERY,
    inheritedQuery: EMPTY_QUERY,
    combinator: "and",
    activeViewId: null,
    semanticQuery: null,
    visualProbe: null,
  }));
}

export function setSemanticQuery(semanticQuery: string | null): void {
  const next = semanticQuery?.trim() || null;
  store.setState((s) =>
    s.semanticQuery === next ? s : { ...s, semanticQuery: next },
  );
}

export function setVisualProbe(visualProbe: VisualProbe | null): void {
  store.setState((s) => ({ ...s, visualProbe }));
}

export function useSemanticQuery(): string | null {
  return useSelector(store, (s) => s.semanticQuery);
}

export function useVisualProbe(): VisualProbe | null {
  return useSelector(store, (s) => s.visualProbe);
}

export function getOverlays() {
  const probe = store.state.visualProbe;
  return {
    semanticQuery: store.state.semanticQuery,
    visualSaveId: probe?.kind === "saveId" ? probe.id : null,
  };
}

export function setIncludeSubfolders(include: boolean): void {
  if (!store.state.presentationFolderId)
    writeViewPref("subfolders", include ? "1" : "0");
  store.setState((s) => ({ ...s, includeSubfolders: include }));
  persistPresentation();
}

export function useIncludeSubfolders(): boolean {
  return useSelector(store, (s) => s.includeSubfolders);
}

export function applySavedView(view: {
  id: string;
  query: Query;
  kind?: SavedView["kind"];
  inheritedQuery?: Query;
  sortKey?: string;
  sortDir?: string;
  layout?: string | null;
}): void {
  const rows = view.query.rules.filter(
    (clause): clause is Predicate => !("rules" in clause),
  );
  const combinator: Combinator = view.query.combinator === "or" ? "or" : "and";
  const restoresPresentation = !view.kind || view.kind === "saved_view";
  store.setState((s) => ({
    ...s,
    q: "",
    searchInput: "",
    semanticQuery: null,
    visualProbe: null,
    rows,
    combinator,
    query: view.query,
    inheritedQuery: view.inheritedQuery ?? EMPTY_QUERY,
    activeViewId: view.id,
    sortKey: restoresPresentation ? (view.sortKey ?? s.sortKey) : s.sortKey,
    sortDir:
      restoresPresentation &&
      (view.sortDir === "asc" || view.sortDir === "desc")
        ? view.sortDir
        : s.sortDir,
    layout:
      restoresPresentation && view.layout && isLayoutValue(view.layout)
        ? view.layout
        : s.layout,
  }));
}

export function addCondition(field?: FieldId): void {
  const next = field ?? FIELD_IDS[0];
  if (!next) return;
  store.setState((s) => {
    const rows = [...s.rows, defaultPredicateFor(next)];
    return { ...s, rows, query: deriveQuery(rows, s.combinator, s.query) };
  });
}

export function updateRow(idx: number, next: Predicate | null): void {
  store.setState((s) => {
    if (idx < 0 || idx >= s.rows.length) return s;
    const rows = [...s.rows];
    if (next === null) rows.splice(idx, 1);
    else rows[idx] = next;
    return { ...s, rows, query: deriveQuery(rows, s.combinator, s.query) };
  });
}

export function removeRow(idx: number): void {
  updateRow(idx, null);
}

export function reorderRows(from: number, to: number): void {
  store.setState((s) => {
    if (
      from === to ||
      from < 0 ||
      to < 0 ||
      from >= s.rows.length ||
      to >= s.rows.length
    ) {
      return s;
    }
    const rows = [...s.rows];
    const [moved] = rows.splice(from, 1);
    if (!moved) return s;
    rows.splice(to, 0, moved);
    return { ...s, rows, query: deriveQuery(rows, s.combinator, s.query) };
  });
}

export function setCombinator(combinator: Combinator): void {
  store.setState((s) =>
    s.combinator === combinator
      ? s
      : { ...s, combinator, query: deriveQuery(s.rows, combinator, s.query) },
  );
}

function folderPresentationSnapshot(): Omit<
  FolderPresentation,
  "manualOrder" | "pinnedIds" | "coverSaveId"
> {
  const state = store.state;
  return {
    layout: state.layout,
    sortKey: state.sortKey,
    sortDir: state.sortDir,
    zoom: state.zoom,
    includeSubfolders: state.includeSubfolders,
    randomSeed: state.randomSeed,
  };
}
function persistPresentation(): void {
  const id = store.state.presentationFolderId;
  if (!id) return;
  void saveFolderPresentation(id, folderPresentationSnapshot()).catch(() =>
    notify({
      id: "folder-view-save",
      title: "Couldn't save folder view settings",
    }),
  );
}
export function activateFolderPresentation(
  id: string | null,
  presentation?: FolderPresentation,
): void {
  if (store.state.presentationFolderId === id) return;
  if (id === null && store.state.activeViewId) {
    store.setState((state) => ({ ...state, presentationFolderId: null }));
    return;
  }
  const layout = readInitialLayout();
  const zoom = clampZoom(presentation?.zoom ?? readInitialZoom());
  applyZoomVar(zoom);
  store.setState((state) => ({
    ...state,
    presentationFolderId: id,
    layout: presentation?.layout ?? layout,
    sortKey: presentation?.sortKey ?? readViewPref("sort") ?? "savedAt",
    sortDir:
      presentation?.sortDir ?? (readViewPref("dir") === "asc" ? "asc" : "desc"),
    zoom,
    includeSubfolders:
      presentation?.includeSubfolders ?? readViewPref("subfolders") !== "0",
    randomSeed: presentation?.randomSeed ?? readViewPref("seed") ?? "pond",
  }));
}
export function useRandomSeed(): string {
  return useSelector(store, (state) => state.randomSeed);
}

export function reseedRandomSort(): void {
  const randomSeed = crypto.randomUUID();
  if (!store.state.presentationFolderId) writeViewPref("seed", randomSeed);
  store.setState((state) => ({ ...state, randomSeed }));
  persistPresentation();
}

export function setLayout(layout: LayoutValue): void {
  if (!store.state.presentationFolderId) writeViewPref("view", layout);
  store.setState((s) => ({ ...s, layout }));
  persistPresentation();
}

export function cycleLayout(): void {
  setLayout(nextLayout(store.state.layout));
}

export function setSort(next: { key: string; dir: SortDir }): void {
  if (!store.state.presentationFolderId) {
    writeViewPref("sort", next.key);
    writeViewPref("dir", next.dir);
  }
  store.setState((s) => ({ ...s, sortKey: next.key, sortDir: next.dir }));
  persistPresentation();
}

const SORT_KEY_CYCLE: readonly string[] = [
  "savedAt",
  "createdAt",
  "publishedAt",
  "title",
  "type",
  "creator",
  "source",
  "tagName",
  "tagCount",
  "duration",
  "width",
  "height",
  "dimensions",
  "aspectRatio",
  "fileSize",
  "fileCount",
  "rating",
];

export function toggleSortDir(): void {
  const { sortKey, sortDir } = store.state;
  setSort({ key: sortKey, dir: sortDir === "asc" ? "desc" : "asc" });
}

export function cycleSortKey(): void {
  const { sortKey, sortDir } = store.state;
  const idx = SORT_KEY_CYCLE.indexOf(sortKey);
  const next =
    SORT_KEY_CYCLE[(idx < 0 ? 0 : idx + 1) % SORT_KEY_CYCLE.length] ??
    "savedAt";
  setSort({ key: next, dir: sortDir });
}

export function adjustZoom(delta: number): void {
  setZoom(store.state.zoom + delta);
}

export function setZoom(zoom: number): void {
  const clamped = clampZoom(zoom);
  if (globalThis.window && !store.state.presentationFolderId) {
    try {
      window.localStorage.setItem(ZOOM_STORAGE_KEY, String(clamped));
    } catch {}
  }
  applyZoomVar(clamped);
  store.setState((s) => ({ ...s, zoom: clamped }));
  persistPresentation();
}

export function restoreDefaults(): void {
  if (!store.state.presentationFolderId) {
    writeViewPref("view", "waterfall");
    writeViewPref("sort", "savedAt");
    writeViewPref("dir", "desc");
  }
  if (globalThis.window && !store.state.presentationFolderId) {
    try {
      window.localStorage.setItem(ZOOM_STORAGE_KEY, String(ZOOM_DEFAULT));
    } catch {}
  }
  applyZoomVar(ZOOM_DEFAULT);
  store.setState((s) => ({
    ...s,
    rows: [],
    combinator: "and",
    query: EMPTY_QUERY,
    inheritedQuery: EMPTY_QUERY,
    activeViewId: null,
    q: "",
    searchInput: "",
    layout: "waterfall",
    sortKey: "savedAt",
    sortDir: "desc",
    zoom: ZOOM_DEFAULT,
    semanticQuery: null,
    visualProbe: null,
  }));
  persistPresentation();
}

function _openCapture(): void {
  store.setState((s) => (s.capture ? s : { ...s, capture: true }));
}
