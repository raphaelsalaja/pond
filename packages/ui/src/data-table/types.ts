import type { RowData } from "@tanstack/react-table";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

type ColumnAlign = "start" | "center" | "end";

export type SortValue = string | number | null | undefined;
export type SortKind = "text" | "number";

export interface CellContext {
  depth: number;
  expanded: boolean;
  canExpand: boolean;
}

export interface HeaderContext {
  sorted: false | "asc" | "desc";
}

export interface TableColumn<T extends RowData> {
  id: string;
  header?: ReactNode | ((ctx: HeaderContext) => ReactNode);
  sortLabel?: string;
  cell: (row: T, ctx: CellContext) => ReactNode;
  accessor?: (row: T) => SortValue;
  sort?: SortKind;
  width?: string;
  minWidth?: number;
  align?: ColumnAlign;
  resizable?: boolean;
  reorderable?: boolean;
  headerHidden?: boolean;
}

export interface RenderRowArgs<T extends RowData> {
  row: T;
  rowId: string;
  depth: number;
  expanded: boolean;
  canExpand: boolean;
  selected: boolean;
  cells: ReactNode;
  onToggleExpand: () => void;
  rowProps: {
    role: "row";
    id: string;
    "aria-rowindex": number;
    "data-cursor"?: "";
    "data-hover-row": "";
    className: string;
    style: React.CSSProperties;
    onClick: (e: ReactMouseEvent) => void;
    "aria-selected"?: boolean;
    "data-selected"?: "";
    "data-selected-start"?: "";
    "data-selected-end"?: "";
    "data-depth"?: number;
  };
}
