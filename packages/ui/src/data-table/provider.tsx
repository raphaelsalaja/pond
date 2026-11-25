import {
  createExpandedRowModel,
  createSortedRowModel,
  rowExpandingFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import type {
  ColumnDef,
  ExpandedState,
  RowData,
  SortingState,
} from "@tanstack/react-table";
import { Store } from "@tanstack/store";
import {
  useCallback,
  useId,
  useInsertionEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { DataTableContext } from "./context";
import type { DataTableContextValue, RowApi, SelectionState } from "./context";
import type { RenderRowArgs, SortKind, SortValue, TableColumn } from "./types";

const SELECT_WIDTH = 40;
const CARET_WIDTH = 28;
const FIXED_PIXEL_WIDTH = /^(\d+(?:\.\d+)?)px$/;
const MINMAX_PIXEL_WIDTH = /^minmax\(\s*(\d+(?:\.\d+)?)px\s*,/;

export const DATA_TABLE_FEATURES = tableFeatures({
  rowSortingFeature,
  rowExpandingFeature,
  sortedRowModel: createSortedRowModel(),
  expandedRowModel: createExpandedRowModel(),
});

const collator = new Intl.Collator(undefined, { sensitivity: "base" });

function compareValues(a: SortValue, b: SortValue, sort: SortKind): number {
  if (sort === "text") {
    return collator.compare(String(a ?? ""), String(b ?? ""));
  }
  const an =
    a === null || a === undefined ? Number.NEGATIVE_INFINITY : Number(a);
  const bn =
    b === null || b === undefined ? Number.NEGATIVE_INFINITY : Number(b);
  return an === bn ? 0 : an > bn ? 1 : -1;
}

function minimumColumnWidth<T extends RowData>(column: TableColumn<T>): number {
  const width = column.width?.trim();
  const match =
    width?.match(FIXED_PIXEL_WIDTH) ?? width?.match(MINMAX_PIXEL_WIDTH);
  if (match?.[1]) return Number(match[1]);
  return column.minWidth ?? 0;
}

type SortingUpdater = (prev: SortingState) => SortingState;

function isSortingUpdater(
  updater: SortingState | SortingUpdater,
): updater is SortingUpdater {
  return typeof updater === "function";
}

export interface DataTableSort {
  id: string;
  desc: boolean;
}

export interface DataTableProviderProps<T extends RowData> {
  data: Array<T>;
  columns: Array<TableColumn<T>>;
  getRowId: (row: T) => string;
  getSubRows?: (row: T) => Array<T> | undefined;
  expandCaret?: boolean;
  onSelectionChange?: (ids: Array<string>) => void;
  selectionCheckboxes?: boolean;
  checkboxVisibility?: "always" | "hover";
  defaultSort?: { id: string; desc: boolean };
  sorting?: DataTableSort | null;
  onSortingChange?: (sorting: DataTableSort | null) => void;
  columnOrder?: Array<string>;
  onColumnOrderChange?: (order: Array<string>) => void;
  expandedIds?: Array<string>;
  onToggleExpand?: (id: string, next: boolean) => void;
  height?: number;
  rowHeight?: number;
  overscan?: number;
  renderRow?: (args: RenderRowArgs<T>) => ReactNode;
  onRowClick?: (row: T, e?: ReactMouseEvent) => void;
  selectOnClick?: boolean;
  children: ReactNode;
}

export function DataTableProvider<T extends RowData>({
  data,
  columns,
  getRowId,
  getSubRows,
  expandCaret = true,
  onSelectionChange,
  selectionCheckboxes = true,
  checkboxVisibility = "always",
  defaultSort,
  sorting: sortingProp,
  onSortingChange,
  columnOrder: columnOrderProp,
  onColumnOrderChange,
  expandedIds,
  onToggleExpand,
  height,
  rowHeight = 44,
  overscan = 10,
  renderRow,
  onRowClick,
  selectOnClick,
  children,
}: DataTableProviderProps<T>) {
  const selectionEnabled = onSelectionChange !== undefined;
  const expansionEnabled = getSubRows !== undefined && expandCaret;
  const clickSelects = selectOnClick ?? !selectionCheckboxes;

  const [selectionStore] = useState(
    () =>
      new Store<SelectionState>({
        selectedIds: new Set<string>(),
        cursorId: null,
      }),
  );

  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const revealRow = useRef<((id: string) => void) | null>(null);
  const gridId = useId();
  const rowElementId = useCallback(
    (id: string) => `${gridId}-row-${encodeURIComponent(id)}`,
    [gridId],
  );

  const [uncontrolledSorting, setUncontrolledSorting] = useState<SortingState>(
    defaultSort ? [{ id: defaultSort.id, desc: defaultSort.desc }] : [],
  );
  const onSortingChangeRef = useRef(onSortingChange);
  const controlledSorting = useMemo<SortingState>(
    () => (sortingProp ? [{ id: sortingProp.id, desc: sortingProp.desc }] : []),
    [sortingProp],
  );
  const sorting = onSortingChange ? controlledSorting : uncontrolledSorting;
  const sortingRef = useRef(sorting);
  const commitSorting = useCallback((next: SortingState) => {
    const handler = onSortingChangeRef.current;
    if (handler) {
      const current = next[0];
      handler(current ? { id: current.id, desc: current.desc } : null);
      return;
    }
    setUncontrolledSorting(next);
  }, []);
  const handleSortingChange = useCallback(
    (updater: SortingState | SortingUpdater) => {
      commitSorting(
        isSortingUpdater(updater) ? updater(sortingRef.current) : updater,
      );
    },
    [commitSorting],
  );
  const [internalExpanded, setInternalExpanded] = useState<ExpandedState>({});
  const [columnSizing, setColumnSizing] = useState<Record<string, number>>({});
  const [uncontrolledOrder, setUncontrolledOrder] = useState<Array<string>>([]);
  const columnOrder = columnOrderProp ?? uncontrolledOrder;

  const expanded = useMemo<ExpandedState>(() => {
    if (!expandedIds) return internalExpanded;
    const rec: Record<string, boolean> = {};
    for (const id of expandedIds) rec[id] = true;
    return rec;
  }, [expandedIds, internalExpanded]);

  const tanstackColumns = useMemo<
    Array<ColumnDef<typeof DATA_TABLE_FEATURES, T>>
  >(
    () =>
      columns.map((col) => ({
        id: col.id,
        accessorFn: col.accessor ? (row) => col.accessor?.(row) : undefined,
        enableSorting: Boolean(col.accessor),
        sortFn: (a, b, id) =>
          compareValues(
            a.getValue<SortValue>(id),
            b.getValue<SortValue>(id),
            col.sort ?? "text",
          ),
      })),
    [columns],
  );

  const table = useTable({
    features: DATA_TABLE_FEATURES,
    data,
    columns: tanstackColumns,
    state: { sorting, expanded },
    getRowId: (row) => getRowId(row),
    getSubRows: getSubRows ? (row) => getSubRows(row) : undefined,
    onSortingChange: handleSortingChange,
    onExpandedChange: setInternalExpanded,
    enableSortingRemoval: false,
  });

  const rows = table.getRowModel().rows;
  const flatRows = table.getRowModel().flatRows;

  const orderedIdsRef = useRef<Array<string>>([]);
  const anchorRef = useRef<string | null>(null);
  const rowChildrenRef = useRef<Map<string, Array<string>>>(new Map());
  const onSelectionChangeRef = useRef(onSelectionChange);

  /** Insertion effects run before any layout effect, so actions called from child effects see this render's values. */
  useInsertionEffect(() => {
    onSortingChangeRef.current = onSortingChange;
    sortingRef.current = sorting;
    onSelectionChangeRef.current = onSelectionChange;
    orderedIdsRef.current = rows.map((r) => r.id);
    const childMap = new Map<string, Array<string>>();
    for (const r of flatRows) {
      if (r.subRows.length > 0) {
        childMap.set(
          r.id,
          r.subRows.flatMap((s) => [s.id, ...s.subRows.map((g) => g.id)]),
        );
      }
    }
    rowChildrenRef.current = childMap;
  }, [onSortingChange, sorting, onSelectionChange, rows, flatRows]);

  const commitSelection = useCallback(() => {
    onSelectionChangeRef.current?.(
      Array.from(selectionStore.state.selectedIds),
    );
  }, [selectionStore]);

  const actions = useMemo(() => {
    const withDescendants = (id: string): Array<string> => [
      id,
      ...(rowChildrenRef.current.get(id) ?? []),
    ];

    const focusRow = (id: string) => {
      selectionStore.setState((s) => ({ ...s, cursorId: id }));
      gridRef.current?.focus({ preventScroll: true });
    };

    const toggleRow = (id: string, extend: boolean) => {
      selectionStore.setState((s) => {
        const next = new Set(s.selectedIds);
        const ids = orderedIdsRef.current;
        if (extend && anchorRef.current) {
          const from = ids.indexOf(anchorRef.current);
          const to = ids.indexOf(id);
          if (from >= 0 && to >= 0) {
            const [lo, hi] = from <= to ? [from, to] : [to, from];
            next.clear();
            for (const rowId of ids.slice(lo, hi + 1)) {
              for (const d of withDescendants(rowId)) next.add(d);
            }
            return { selectedIds: next, cursorId: id };
          }
        }
        const targets = withDescendants(id);
        if (next.has(id)) {
          for (const d of targets) next.delete(d);
        } else {
          for (const d of targets) next.add(d);
        }
        anchorRef.current = id;
        return { selectedIds: next, cursorId: id };
      });
      commitSelection();
    };

    const selectRow = (id: string) => {
      selectionStore.setState(() => ({
        selectedIds: new Set(withDescendants(id)),
        cursorId: id,
      }));
      anchorRef.current = id;
      commitSelection();
    };

    const toggleAll = (next: boolean) => {
      const ids = next ? orderedIdsRef.current : [];
      selectionStore.setState((s) => ({
        selectedIds: new Set(ids),
        cursorId: s.cursorId ?? ids[0] ?? null,
      }));
      anchorRef.current = ids[0] ?? null;
      commitSelection();
    };

    const clearSelection = () => toggleAll(false);

    const replaceSelection = (ids: Array<string>) => {
      const next = new Set<string>();
      for (const id of ids) {
        for (const d of withDescendants(id)) next.add(d);
      }
      selectionStore.setState(() => ({
        selectedIds: next,
        cursorId: ids.at(-1) ?? null,
      }));
      anchorRef.current = ids.at(-1) ?? null;
      commitSelection();
    };

    const toggleExpand = (id: string) => {
      const expandedRecord =
        internalExpanded === true ? null : internalExpanded;
      const isOpen = Boolean(
        expandedIds?.includes(id) || (!expandedIds && expandedRecord?.[id]),
      );
      if (expandedIds) {
        onToggleExpand?.(id, !isOpen);
      } else {
        setInternalExpanded((prev) =>
          prev === true ? { [id]: !isOpen } : { ...prev, [id]: !isOpen },
        );
      }
    };

    const toggleSort = (id: string) => {
      const cur = sortingRef.current[0];
      commitSorting(
        cur?.id === id ? [{ id, desc: !cur.desc }] : [{ id, desc: false }],
      );
    };

    const resizeColumn = (id: string, width: number) => {
      setColumnSizing((prev) => ({
        ...prev,
        [id]: Math.max(48, Math.round(width)),
      }));
    };

    const reorderColumns = (fromId: string, toId: string) => {
      const move = (base: Array<string>) => {
        if (fromId === toId) {
          return null;
        }
        const from = base.indexOf(fromId);
        const to = base.indexOf(toId);
        if (from < 0 || to < 0) return null;
        const next = [...base];
        const [moved] = next.splice(from, 1);
        if (moved === undefined) return null;
        next.splice(to, 0, moved);
        return next;
      };
      if (columnOrderProp) {
        const next = move(
          columnOrderProp.length > 0
            ? columnOrderProp
            : columns.map((column) => column.id),
        );
        if (next) onColumnOrderChange?.(next);
        return;
      }
      setUncontrolledOrder((prev) => {
        const next = move(
          prev.length > 0 ? prev : columns.map((column) => column.id),
        );
        return next ?? prev;
      });
    };

    return {
      focusRow,
      toggleRow,
      selectRow,
      toggleAll,
      clearSelection,
      replaceSelection,
      toggleExpand,
      toggleSort,
      resizeColumn,
      reorderColumns,
    };
  }, [
    selectionStore,
    commitSelection,
    expandedIds,
    internalExpanded,
    onToggleExpand,
    columns,
    columnOrderProp,
    onColumnOrderChange,
    commitSorting,
  ]);

  const orderedColumns = useMemo(() => {
    if (columnOrder.length === 0) return columns;
    const byId = new Map(columns.map((c) => [c.id, c]));
    const ordered: Array<TableColumn<T>> = [];
    for (const id of columnOrder) {
      const col = byId.get(id);
      if (col) ordered.push(col);
    }
    for (const col of columns) {
      if (!columnOrder.includes(col.id)) ordered.push(col);
    }
    return ordered;
  }, [columns, columnOrder]);

  const gridTemplateFor = useCallback(
    (order: ReadonlyArray<string>) => {
      const byId = new Map(columns.map((c) => [c.id, c]));
      const parts: Array<string> = [];
      if (selectionEnabled && selectionCheckboxes) {
        parts.push(`${SELECT_WIDTH}px`);
      }
      if (expansionEnabled) {
        parts.push(`${CARET_WIDTH}px`);
      }
      for (const id of order) {
        const col = byId.get(id);
        if (!col) continue;
        const sized = columnSizing[id];
        parts.push(
          sized !== undefined ? `${sized}px` : (col.width ?? "minmax(0, 1fr)"),
        );
      }
      return parts.join(" ");
    },
    [
      columns,
      selectionEnabled,
      selectionCheckboxes,
      expansionEnabled,
      columnSizing,
    ],
  );

  const gridTemplate = useMemo(
    () => gridTemplateFor(orderedColumns.map((col) => col.id)),
    [gridTemplateFor, orderedColumns],
  );

  const gridMinWidth = useMemo(() => {
    let width = 0;
    if (selectionEnabled && selectionCheckboxes) {
      width += SELECT_WIDTH;
    }
    if (expansionEnabled) {
      width += CARET_WIDTH;
    }
    for (const column of orderedColumns) {
      width += columnSizing[column.id] ?? minimumColumnWidth(column);
    }
    return width;
  }, [
    selectionEnabled,
    selectionCheckboxes,
    expansionEnabled,
    orderedColumns,
    columnSizing,
  ]);

  const rowApi = useMemo<RowApi<T>>(
    () => ({
      selectionStore,
      gridRef,
      rowElementId,
      focusRow: actions.focusRow,
      columns: orderedColumns,
      gridTemplate,
      gridMinWidth,
      selectionEnabled,
      selectionCheckboxes,
      selectOnClick: clickSelects,
      expansionEnabled,
      toggleRow: actions.toggleRow,
      selectRow: actions.selectRow,
      toggleExpand: actions.toggleExpand,
      onRowClick,
      renderRow,
    }),
    [
      selectionStore,
      rowElementId,
      actions.focusRow,
      orderedColumns,
      gridTemplate,
      gridMinWidth,
      selectionEnabled,
      selectionCheckboxes,
      clickSelects,
      expansionEnabled,
      actions.toggleRow,
      actions.selectRow,
      actions.toggleExpand,
      onRowClick,
      renderRow,
    ],
  );

  const getSorted = useCallback(
    (id: string): false | "asc" | "desc" => {
      const cur = sorting[0];
      if (cur?.id !== id) return false;
      return cur.desc ? "desc" : "asc";
    },
    [sorting],
  );

  const value = useMemo<DataTableContextValue<T>>(
    () => ({
      selectionStore,
      actions,
      meta: {
        gridRef,
        scrollRef,
        headerRef,
        revealRow,
        rowElementId,
        columns: orderedColumns,
        gridTemplate,
        gridTemplateFor,
        gridMinWidth,
        selectionEnabled,
        selectionCheckboxes,
        checkboxVisibility,
        expansionEnabled,
        rows,
        rowCount: rows.length,
        rowHeight,
        height,
        overscan,
        getSorted,
        rowApi,
      },
    }),
    [
      selectionStore,
      actions,
      rowElementId,
      orderedColumns,
      gridTemplate,
      gridTemplateFor,
      gridMinWidth,
      selectionEnabled,
      selectionCheckboxes,
      checkboxVisibility,
      expansionEnabled,
      rows,
      rowHeight,
      height,
      overscan,
      getSorted,
      rowApi,
    ],
  );

  return <DataTableContext value={value}>{children}</DataTableContext>;
}
