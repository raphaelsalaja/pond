import type { RowData } from "@tanstack/react-table";
import { useEffect } from "react";
import { isElement, isNode } from "../dom";
import { useDataTable } from "./context";

function eventFromEditable(event: KeyboardEvent): boolean {
  const nodes = [event.target, document.activeElement];
  return nodes.some((node) => {
    if (!isElement(node)) {
      return false;
    }
    return (
      node.closest(
        "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='searchbox']",
      ) !== null
    );
  });
}

function overlayOpen(): boolean {
  const active = document.activeElement;
  if (!isElement(active)) {
    return false;
  }
  return active.closest('[role="dialog"], [role="menu"]') !== null;
}

function keepSelectionOnMouseDown(target: EventTarget | null): boolean {
  if (!isElement(target)) {
    return false;
  }
  if (target.closest('[role="dialog"], [role="menu"]')) {
    return true;
  }
  if (target.closest('[role="columnheader"]')) {
    return true;
  }
  const row = target.closest('[role="row"]');
  return row !== null && row.closest('[role="rowgroup"]') !== null;
}

export function DataTableHotkeys<T extends RowData>() {
  const { actions, meta, selectionStore } = useDataTable<T>();

  useEffect(() => {
    if (!meta.selectionEnabled) return;

    const onMouseDown = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        !isNode(event.target) ||
        !meta.gridRef.current?.contains(event.target)
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.shiftKey) {
        return;
      }
      if (selectionStore.state.selectedIds.size === 0) {
        return;
      }
      if (keepSelectionOnMouseDown(event.target)) {
        return;
      }
      actions.clearSelection();
    };

    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        eventFromEditable(event) ||
        overlayOpen() ||
        document.activeElement !== meta.gridRef.current
      ) {
        return;
      }

      const ids = meta.rows.map((row) => row.id);
      if (ids.length === 0) return;

      const selected = selectionStore.state.selectedIds;
      const current = selectionStore.state.cursorId;
      const cursor = current && ids.includes(current) ? current : null;

      const cmd = event.metaKey || event.ctrlKey;
      if (cmd && event.key.toLowerCase() === "a" && !event.shiftKey) {
        event.preventDefault();
        actions.toggleAll(true);
        return;
      }

      if (event.key === "Escape") {
        if (selected.size === 0) return;
        event.preventDefault();
        actions.clearSelection();
        return;
      }

      if (event.key === "Enter") {
        const id = cursor ?? ids[0];
        const row = meta.rows.find((item) => item.id === id);
        if (!row) return;
        event.preventDefault();
        if (!selected.has(row.id)) actions.selectRow(row.id);
        meta.rowApi.onRowClick?.(row.original);
        return;
      }

      if (event.key === " ") {
        const id = cursor ?? ids[0];
        if (!id) return;
        event.preventDefault();
        actions.toggleRow(id, event.shiftKey);
        return;
      }

      if (
        !["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"].includes(
          event.key,
        )
      ) {
        return;
      }

      const page = Math.max(
        1,
        Math.floor(
          (meta.height ??
            meta.gridRef.current?.clientHeight ??
            meta.rowHeight) / meta.rowHeight,
        ),
      );
      const delta =
        event.key === "PageDown"
          ? page
          : event.key === "PageUp"
            ? -page
            : event.key === "ArrowDown"
              ? 1
              : -1;
      const from = cursor ? ids.indexOf(cursor) : -1;
      const nextIdx =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? ids.length - 1
            : from < 0
              ? delta > 0
                ? 0
                : ids.length - 1
              : Math.min(ids.length - 1, Math.max(0, from + delta));
      const next = ids[nextIdx];
      if (!next) return;
      event.preventDefault();
      if (cmd && !event.shiftKey) actions.focusRow(next);
      else if (event.shiftKey) actions.toggleRow(next, true);
      else actions.selectRow(next);
    };

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [actions, meta, selectionStore]);

  return null;
}
