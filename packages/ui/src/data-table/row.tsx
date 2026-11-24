import { useSelector } from "@tanstack/react-store";
import type { RowData } from "@tanstack/react-table";
import { memo } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { isElement } from "../dom";
import { CaretCell, SelectCell } from "./cells";
import type { RowApi } from "./context";
import type { CellContext, RenderRowArgs } from "./types";
import styles from "./styles.module.css";

interface RowProps<T extends RowData> {
  api: RowApi<T>;
  rowId: string;
  rowIndex: number;
  prevId?: string;
  nextId?: string;
  data: T;
  depth: number;
  expanded: boolean;
  canExpand: boolean;
}

function RowImpl<T extends RowData>({
  api,
  rowId,
  rowIndex,
  prevId,
  nextId,
  data,
  depth,
  expanded,
  canExpand,
}: RowProps<T>) {
  const cursor = useSelector(api.selectionStore, (s) => s.cursorId === rowId);
  const selected = useSelector(api.selectionStore, (s) =>
    s.selectedIds.has(rowId),
  );
  const selectedStart = useSelector(
    api.selectionStore,
    (s) =>
      s.selectedIds.has(rowId) &&
      (prevId === undefined || !s.selectedIds.has(prevId)),
  );
  const selectedEnd = useSelector(
    api.selectionStore,
    (s) =>
      s.selectedIds.has(rowId) &&
      (nextId === undefined || !s.selectedIds.has(nextId)),
  );

  const cellCtx: CellContext = { depth, expanded, canExpand };

  const cells: Array<ReactNode> = [];
  if (api.selectionEnabled && api.selectionCheckboxes) {
    cells.push(
      <SelectCell
        key="__select"
        store={api.selectionStore}
        rowId={rowId}
        onToggle={(extend) => api.toggleRow(rowId, extend)}
      />,
    );
  }
  if (api.expansionEnabled) {
    cells.push(
      <CaretCell
        key="__caret"
        canExpand={canExpand}
        expanded={expanded}
        onToggle={() => api.toggleExpand(rowId)}
      />,
    );
  }
  for (const [index, col] of api.columns.entries()) {
    cells.push(
      <div
        key={col.id}
        role="gridcell"
        className={styles.cell}
        data-align={col.align ?? undefined}
        data-pinned={index === 0 || undefined}
      >
        {col.cell(data, cellCtx)}
      </div>,
    );
  }

  const onClick = (e: ReactMouseEvent) => {
    if (
      !isElement(e.target) ||
      !e.target.closest(
        "button, input, select, textarea, a, [contenteditable=true]",
      )
    ) {
      api.focusRow(rowId);
    }
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      if (api.selectionEnabled) {
        api.toggleRow(rowId, e.shiftKey);
      }
      return;
    }
    if (api.selectionEnabled && api.selectOnClick) {
      api.selectRow(rowId);
    }
    api.onRowClick?.(data, e);
  };

  const rowProps: RenderRowArgs<T>["rowProps"] = {
    role: "row",
    id: api.rowElementId(rowId),
    "aria-rowindex": rowIndex,
    "data-cursor": cursor ? "" : undefined,
    "data-hover-row": "",
    className: styles.row ?? "",
    style: {
      gridTemplateColumns: api.gridTemplate,
      minWidth: api.gridMinWidth,
    },
    onClick,
    "aria-selected": api.selectionEnabled ? selected : undefined,
    "data-selected": selected ? "" : undefined,
    "data-selected-start": selectedStart ? "" : undefined,
    "data-selected-end": selectedEnd ? "" : undefined,
    "data-depth": depth || undefined,
  };

  if (api.renderRow) {
    return api.renderRow({
      row: data,
      rowId,
      depth,
      expanded,
      canExpand,
      selected,
      cells,
      rowProps,
      onToggleExpand: () => api.toggleExpand(rowId),
    });
  }

  return <div {...rowProps}>{cells}</div>;
}

export const Row =
  /** SAFETY: `memo` renders `RowImpl` with the same props; only the type parameter is lost, because React types `memo` without one. */
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- React's `memo` type erases generics; `RowApi<T>` is contravariant in T, so no assertion-free form type-checks.
  memo(RowImpl) as typeof RowImpl;
