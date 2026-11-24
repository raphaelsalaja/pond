import { useSelector } from "@tanstack/react-store";
import type { RowData, Row as TanstackRow } from "@tanstack/react-table";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useLayoutEffect } from "react";
import type { ReactNode } from "react";
import { cssVars } from "../css-vars";
import { useDataTable } from "./context";
import type { DATA_TABLE_FEATURES } from "./provider";
import { Row } from "./row";
import styles from "./styles.module.css";

export function DataTableBody<T extends RowData>({
  extraRow,
  emptyState,
  rowOffset = 1,
  scrollMargin = 0,
}: {
  extraRow?: ReactNode;
  emptyState?: ReactNode;
  rowOffset?: number;
  /** Distance from the scrollport to the first row. The sticky header occupies it. */
  scrollMargin?: number;
}) {
  const { meta, selectionStore } = useDataTable<T>();
  const { rows, rowApi, height, rowHeight, overscan, rowElementId } = meta;

  const cursorId = useSelector(selectionStore, (s) => s.cursorId);
  const cursorIndex = rows.findIndex((row) => row.id === cursorId);
  // oxlint-disable-next-line react/incompatible-library -- TanStack Virtual returns unstable methods by design; the compiler skips memoizing this component.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => meta.scrollRef.current,
    estimateSize: () => rowHeight,
    overscan,
    scrollMargin,
    scrollPaddingStart: scrollMargin,
    rangeExtractor: (range) => {
      const indexes = defaultRangeExtractor(range);
      if (cursorIndex >= 0 && !indexes.includes(cursorIndex)) {
        indexes.push(cursorIndex);
      }
      return indexes.sort((a, b) => a - b);
    },
    enabled: height !== undefined,
  });

  const revealRow = useCallback(
    (id: string) => {
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) {
        return;
      }
      if (height !== undefined) {
        virtualizer.scrollToIndex(index, { align: "auto" });
      } else {
        document
          .getElementById(rowElementId(id))
          ?.scrollIntoView?.({ block: "nearest" });
      }
    },
    [rows, height, rowElementId, virtualizer],
  );

  useLayoutEffect(() => {
    const revealRef = meta.revealRow;
    revealRef.current = revealRow;
    return () => {
      if (revealRef.current === revealRow) {
        revealRef.current = null;
      }
    };
  }, [meta.revealRow, revealRow]);

  useLayoutEffect(() => {
    if (cursorId && document.activeElement === meta.gridRef.current) {
      revealRow(cursorId);
    }
  }, [cursorId, meta.gridRef, revealRow]);

  const renderRow = (
    row: TanstackRow<typeof DATA_TABLE_FEATURES, T>,
    index: number,
  ) => (
    <Row
      key={row.id}
      api={rowApi}
      rowId={row.id}
      rowIndex={index + rowOffset + 1}
      prevId={rows[index - 1]?.id}
      nextId={rows[index + 1]?.id}
      data={row.original}
      depth={row.depth}
      expanded={row.getIsExpanded()}
      canExpand={row.getCanExpand()}
    />
  );

  const rowHeightStyle = cssVars({
    "--data-table-row-height": `${rowHeight}px`,
  });

  if (height !== undefined) {
    return (
      <div className={styles.body} role="rowgroup" style={rowHeightStyle}>
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: "relative",
            width: "100%",
          }}
        >
          {virtualizer.getVirtualItems().map((vi) => {
            const row = rows[vi.index];
            if (!row) {
              return null;
            }
            return (
              <div
                key={row.id}
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  left: 0,
                  height: `${vi.size}px`,
                  transform: `translateY(${vi.start - scrollMargin}px)`,
                }}
              >
                {renderRow(row, vi.index)}
              </div>
            );
          })}
        </div>
        {extraRow}
      </div>
    );
  }

  return (
    <div className={styles.body} role="rowgroup" style={rowHeightStyle}>
      {rows.length === 0
        ? (extraRow ?? emptyState)
        : rows.map((row, index) => renderRow(row, index))}
      {rows.length > 0 ? extraRow : null}
    </div>
  );
}
