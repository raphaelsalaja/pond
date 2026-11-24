import { useSelector } from "@tanstack/react-store";
import type { RowData } from "@tanstack/react-table";
import { clsx as cn } from "clsx";
import {
  Children,
  type FunctionComponent,
  isValidElement,
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useState,
} from "react";
import { cssVars } from "../css-vars";
import { HoverHighlight } from "../hover-highlight";
import { DataTableBody } from "./body";
import { useDataTable } from "./context";
import { DataTableHeader } from "./header";
import styles from "./styles.module.css";

function useStickyHeaderOffset(
  headerRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
) {
  const [offset, setOffset] = useState(0);
  useLayoutEffect(() => {
    const node = headerRef.current;
    if (!enabled || !node) {
      setOffset(0);
      return;
    }
    const measure = () => {
      const next = node.offsetHeight;
      setOffset((current) => (current === next ? current : next));
    };
    measure();
    if (!globalThis.ResizeObserver) return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [headerRef, enabled]);
  return offset;
}

function useHorizontalScrollFlag(scrollRef: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const update = () => {
      if (node.scrollLeft > 0) node.dataset.scrolledX = "";
      else delete node.dataset.scrolledX;
    };
    update();
    node.addEventListener("scroll", update, { passive: true });
    return () => node.removeEventListener("scroll", update);
  }, [scrollRef]);
}

interface SlotProps {
  children?: ReactNode;
}

export const DataTableEmpty: FunctionComponent<SlotProps> = () => null;
export const DataTableExtraRow: FunctionComponent<SlotProps> = () => null;

export function DataTableRoot<T extends RowData>({
  children,
  className,
  variant = "table",
  rows = "divided",
  "aria-label": ariaLabel = "Records",
}: {
  children?: ReactNode;
  className?: string;
  variant?: "table" | "list";
  rows?: "divided" | "inset";
  "aria-label"?: string;
}) {
  const { meta, selectionStore, actions } = useDataTable<T>();
  const cursorId = useSelector(selectionStore, (s) => s.cursorId);
  const selecting = useSelector(selectionStore, (s) => s.selectedIds.size > 0);

  useLayoutEffect(() => {
    if (
      !cursorId ||
      meta.rows.some((row) => row.id === cursorId) ||
      document.activeElement !== meta.gridRef.current
    )
      return;
    const first = meta.rows[0];
    if (first) actions.focusRow(first.id);
  }, [cursorId, meta.rows, meta.gridRef, actions]);

  let extraRow: ReactNode = null;
  let emptyState: ReactNode = null;
  Children.forEach(children, (child) => {
    if (!isValidElement<SlotProps>(child)) return;
    if (child.type === DataTableExtraRow) extraRow = child.props.children;
    else if (child.type === DataTableEmpty) emptyState = child.props.children;
  });

  const hasRows = meta.rows.length > 0 || extraRow != null;
  const showHeader = variant !== "list" && hasRows;
  const sized = meta.height !== undefined;
  const scrollMargin = useStickyHeaderOffset(meta.headerRef, showHeader);
  useHorizontalScrollFlag(meta.scrollRef);

  return (
    <div
      className={cn(styles.container, className)}
      ref={meta.gridRef}
      role="grid"
      tabIndex={0}
      onFocus={(event) => {
        if (event.target !== event.currentTarget) return;
        const cursor = selectionStore.state.cursorId;
        const id =
          cursor && meta.rows.some((row) => row.id === cursor)
            ? cursor
            : meta.rows[0]?.id;
        if (!id) return;
        actions.focusRow(id);
        meta.revealRow.current?.(id);
      }}
      aria-label={ariaLabel}
      aria-multiselectable={meta.selectionEnabled || undefined}
      aria-rowcount={meta.rowCount + (showHeader ? 1 : 0)}
      aria-colcount={
        meta.columns.length +
        Number(meta.selectionEnabled && meta.selectionCheckboxes) +
        Number(meta.expansionEnabled)
      }
      aria-activedescendant={
        cursorId && meta.rows.some((row) => row.id === cursorId)
          ? meta.rowElementId(cursorId)
          : undefined
      }
      data-list={(variant === "list" && hasRows) || undefined}
      data-rows={rows === "inset" ? rows : undefined}
      data-checkboxes={
        meta.selectionEnabled && meta.selectionCheckboxes
          ? meta.checkboxVisibility
          : undefined
      }
      data-selecting={selecting || undefined}
    >
      <div
        ref={meta.scrollRef}
        className={styles.viewport}
        data-viewport=""
        data-scroll-fade="vertical"
        data-header={showHeader || undefined}
        data-sized={sized || undefined}
        style={
          sized
            ? cssVars({ "--data-table-body-height": `${meta.height}px` })
            : undefined
        }
      >
        <div className={styles.sheet} style={{ minWidth: meta.gridMinWidth }}>
          {rows === "inset" && hasRows ? <HoverHighlight /> : null}
          {showHeader ? <DataTableHeader<T> /> : null}
          <DataTableBody<T>
            extraRow={extraRow}
            emptyState={emptyState}
            rowOffset={showHeader ? 1 : 0}
            scrollMargin={scrollMargin}
          />
        </div>
      </div>
    </div>
  );
}

export function DataTableToolbar({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return <div className={cn(styles.toolbar, className)}>{children}</div>;
}
