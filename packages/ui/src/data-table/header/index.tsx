import type { RowData } from "@tanstack/react-table";
import { useMemo, useRef } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  PointerEvent as ReactPointerEvent,
} from "react";
import { SelectAllCell, stop } from "../cells";
import { useDataTable } from "../context";
import type { HeaderContext, TableColumn } from "../types";
import { ColumnHeader, ColumnRow, movedColumn } from "./reorder";
import styles from "./styles.module.css";

type HeaderRender = (ctx: HeaderContext) => ReactNode;

function isHeaderRender(
  header: ReactNode | HeaderRender,
): header is HeaderRender {
  return typeof header === "function";
}

function headerContent<T extends RowData>(
  column: TableColumn<T>,
  sorted: false | "asc" | "desc",
): ReactNode {
  return isHeaderRender(column.header)
    ? column.header({ sorted } satisfies HeaderContext)
    : (column.header ?? null);
}

function SortCaret({ sorted }: { sorted: "asc" | "desc" }) {
  return (
    <svg
      className={styles["sort-caret"]}
      data-desc={sorted === "desc" || undefined}
      width="10"
      height="10"
      viewBox="0 0 10 10"
      aria-hidden="true"
    >
      <path
        d="M2.5 4 L5 6.5 L7.5 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HeaderCell<T extends RowData>({
  column,
  pinned,
}: {
  column: TableColumn<T>;
  pinned: boolean;
}) {
  const { actions, meta } = useDataTable<T>();
  const headRef = useRef<HTMLDivElement>(null);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const sortable = Boolean(column.accessor);
  const sorted = meta.getSorted(column.id);
  const content = headerContent(column, sorted);

  const startResize = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = headRef.current?.getBoundingClientRect().width ?? 0;
    const move = (ev: PointerEvent) => {
      actions.resizeColumn(
        column.id,
        Math.max(column.minWidth ?? 48, startWidth + (ev.clientX - startX)),
      );
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const resizeWithKeyboard = (event: ReactKeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const width = headRef.current?.getBoundingClientRect().width ?? 0;
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    actions.resizeColumn(column.id, width + direction * 8);
  };

  const resizeHandle = column.resizable ? (
    <button
      type="button"
      className={styles["resize-handle"]}
      aria-label={`Resize ${column.sortLabel ?? column.id} column`}
      onPointerDown={startResize}
      onKeyDown={resizeWithKeyboard}
      onClick={stop}
    />
  ) : null;

  return (
    <ColumnHeader
      ref={headRef}
      value={column.id}
      reorderable={column.reorderable}
      onPointerDown={
        column.reorderable
          ? (event) => {
              dragOrigin.current = { x: event.clientX, y: event.clientY };
            }
          : undefined
      }
      className={styles.cell}
      data-align={column.align}
      data-pinned={pinned || undefined}
      data-reorderable={column.reorderable || undefined}
      aria-hidden={column.headerHidden || undefined}
      aria-sort={
        sortable
          ? sorted === "asc"
            ? "ascending"
            : sorted === "desc"
              ? "descending"
              : "none"
          : undefined
      }
    >
      {column.headerHidden ? null : sortable ? (
        <button
          type="button"
          className={styles["sort-button"]}
          data-active={sorted ? true : undefined}
          aria-label={`Sort by ${column.sortLabel ?? column.id}`}
          aria-keyshortcuts={
            column.reorderable ? "Alt+ArrowLeft Alt+ArrowRight" : undefined
          }
          onClick={(event) => {
            const origin = dragOrigin.current;
            dragOrigin.current = null;
            if (
              origin &&
              event.detail > 0 &&
              Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 3
            ) {
              return;
            }
            actions.toggleSort(column.id);
          }}
        >
          {content}
          {sorted ? <SortCaret sorted={sorted} /> : null}
        </button>
      ) : (
        <span className={styles.static}>{content}</span>
      )}
      {resizeHandle}
    </ColumnHeader>
  );
}

export function DataTableHeader<T extends RowData>() {
  const { actions, meta, selectionStore } = useDataTable<T>();
  const { headerRef } = meta;
  const rowIds = useMemo(() => meta.rows.map((row) => row.id), [meta.rows]);
  const ids = useMemo(
    () => meta.columns.map((column) => column.id),
    [meta.columns],
  );
  const byId = useMemo(
    () => new Map(meta.columns.map((column) => [column.id, column])),
    [meta.columns],
  );
  const labelFor = (id: string) => {
    const column = byId.get(id);
    return `${column?.sortLabel ?? column?.id ?? "Column"} column`;
  };

  return (
    <div ref={headerRef} className={styles.scroll} role="rowgroup">
      <ColumnRow
        order={ids}
        onOrderChange={(next) => {
          const move = movedColumn(ids, next);
          if (move) {
            actions.reorderColumns(move.from, move.to);
          }
        }}
        columnLabel={labelFor}
        aria-rowindex={1}
        className={styles.row}
        style={(state) => ({
          gridTemplateColumns: meta.gridTemplateFor(state.order),
        })}
      >
        {(state) => (
          <>
            {meta.selectionEnabled && meta.selectionCheckboxes ? (
              <SelectAllCell
                store={selectionStore}
                rowIds={rowIds}
                onToggleAll={actions.toggleAll}
              />
            ) : null}
            {meta.expansionEnabled ? (
              <div role="columnheader" className={styles.cell} aria-hidden />
            ) : null}
            {state.order.map((id, index) => {
              const column = byId.get(id);
              return column ? (
                <HeaderCell key={id} column={column} pinned={index === 0} />
              ) : null;
            })}
          </>
        )}
      </ColumnRow>
    </div>
  );
}
