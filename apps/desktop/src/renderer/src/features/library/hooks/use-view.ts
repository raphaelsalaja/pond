import type { FieldId, Predicate, Query } from "@pond/schema/filters/types";
import { useMemo } from "react";
import type { LayoutValue } from "@/features/library/lib/view-prefs";
import {
  addCondition,
  removeRow,
  reorderRows,
  resetFilters,
  restoreDefaults,
  setCombinator,
  setLayout,
  setQuery,
  setSort,
  setZoom,
  updateRow,
  useViewStore,
} from "@/features/library/state/view-store";
import type { Combinator } from "@/features/library/state/view-store";
import { setDisplayPref, useDisplayPrefs } from "@/features/saves";
import type { DisplayPrefKey, DisplayPrefs } from "@/features/saves";
import { isSortKey } from "./use-filtered-saves";
import type { SortDir, SortKey } from "./use-filtered-saves";

export type { SortKey };

interface ViewState {
  query: Query;
  rows: Array<Predicate>;
  combinator: Combinator;
  layout: LayoutValue;
  sort: { key: SortKey; dir: SortDir };
  displayPrefs: DisplayPrefs;
  zoom: number;
}

interface ViewActions {
  setQuery: (next: Query) => void;
  addCondition: (field?: FieldId) => void;
  updateRow: (idx: number, next: Predicate | null) => void;
  removeRow: (idx: number) => void;
  reorderRows: (from: number, to: number) => void;
  setCombinator: (next: Combinator) => void;
  resetFilters: () => void;
  setLayout: (next: LayoutValue) => void;
  setSort: (next: { key: SortKey; dir: SortDir }) => void;
  setDisplayPref: (key: DisplayPrefKey, value: boolean) => void;
  setZoom: (next: number) => void;
  restoreDefaults: () => void;
}

interface ViewContextValue {
  state: ViewState;
  actions: ViewActions;
}

const actions: ViewActions = {
  setQuery,
  addCondition,
  updateRow,
  removeRow,
  reorderRows,
  setCombinator,
  resetFilters,
  setLayout,
  setSort,
  setDisplayPref,
  setZoom,
  restoreDefaults,
};

export function useView(): ViewContextValue {
  const view = useViewStore();
  const displayPrefs = useDisplayPrefs();
  const sortKey = isSortKey(view.sortKey) ? view.sortKey : "savedAt";
  return useMemo(
    () => ({
      state: {
        query: view.query,
        rows: view.rows,
        combinator: view.combinator,
        layout: view.layout,
        sort: { key: sortKey, dir: view.sortDir },
        displayPrefs,
        zoom: view.zoom,
      },
      actions,
    }),
    [view, sortKey, displayPrefs],
  );
}
