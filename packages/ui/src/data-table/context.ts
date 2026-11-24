import type { RowData, Row as TanstackRow } from "@tanstack/react-table";
import type { Store } from "@tanstack/store";
import { createContext, use } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  ReactNode,
  RefObject,
} from "react";
import type { DATA_TABLE_FEATURES } from "./provider";
import type { RenderRowArgs, TableColumn } from "./types";

export interface SelectionState {
  selectedIds: Set<string>;
  cursorId: string | null;
}

export interface RowApi<T extends RowData> {
  selectionStore: Store<SelectionState>;
  gridRef: RefObject<HTMLDivElement | null>;
  rowElementId: (id: string) => string;
  focusRow: (id: string) => void;
  columns: Array<TableColumn<T>>;
  gridTemplate: string;
  gridMinWidth: number;
  selectionEnabled: boolean;
  selectionCheckboxes: boolean;
  selectOnClick: boolean;
  expansionEnabled: boolean;
  toggleRow: (id: string, extend: boolean) => void;
  selectRow: (id: string) => void;
  toggleExpand: (id: string) => void;
  onRowClick?: (row: T, e?: ReactMouseEvent) => void;
  renderRow?: (args: RenderRowArgs<T>) => ReactNode;
}

export interface DataTableContextValue<T extends RowData> {
  selectionStore: Store<SelectionState>;
  actions: {
    focusRow: (id: string) => void;
    toggleRow: (id: string, extend: boolean) => void;
    selectRow: (id: string) => void;
    toggleAll: (next: boolean) => void;
    clearSelection: () => void;
    replaceSelection: (ids: Array<string>) => void;
    toggleExpand: (id: string) => void;
    toggleSort: (id: string) => void;
    resizeColumn: (id: string, width: number) => void;
    reorderColumns: (fromId: string, toId: string) => void;
  };
  meta: {
    gridRef: RefObject<HTMLDivElement | null>;
    scrollRef: RefObject<HTMLDivElement | null>;
    headerRef: RefObject<HTMLDivElement | null>;
    revealRow: RefObject<((id: string) => void) | null>;
    rowElementId: (id: string) => string;
    columns: Array<TableColumn<T>>;
    gridTemplate: string;
    gridTemplateFor: (order: ReadonlyArray<string>) => string;
    gridMinWidth: number;
    selectionEnabled: boolean;
    selectionCheckboxes: boolean;
    checkboxVisibility: "always" | "hover";
    expansionEnabled: boolean;
    rows: Array<TanstackRow<typeof DATA_TABLE_FEATURES, T>>;
    rowCount: number;
    rowHeight: number;
    height?: number;
    overscan: number;
    getSorted: (id: string) => false | "asc" | "desc";
    rowApi: RowApi<T>;
  };
}

// oxlint-disable-next-line typescript/no-explicit-any -- single shared context, narrowed by useDataTable<T>().
const DataTableContext = createContext<DataTableContextValue<any> | null>(null);

function isDataTableContext<T extends RowData>(
  value: unknown,
): value is DataTableContextValue<T> {
  return (
    typeof value === "object" && value !== null && "selectionStore" in value
  );
}

function useDataTable<T extends RowData>(): DataTableContextValue<T> {
  const ctx: unknown = use(DataTableContext);
  if (!isDataTableContext<T>(ctx)) {
    throw new Error("DataTable parts must be used within DataTable.Provider");
  }
  return ctx;
}

export { DataTableContext, useDataTable };
