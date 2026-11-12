import { useDataTable } from "@pond/ui/data-table";
import { useSelector } from "@tanstack/react-store";
import type { KeyboardEvent, MouseEvent } from "react";
import { TagContextMenu } from "@/features/tags/components/context-menu";
import { ActionsCell, NameCell } from "../lib/cells";
import { TagRowProvider, useTagRow } from "../lib/row-context";
import { TagCheckbox } from "../lib/select";
import type { TagsRowData } from "../lib/types";
import styles from "./styles.module.css";

function fromControl(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest("button, input, textarea, a") !== null
  );
}

export function TagItem({
  row,
  variant = "row",
}: {
  row: Extract<TagsRowData, { kind: "tag" }>;
  variant?: "row" | "card" | "index";
}) {
  return (
    <TagRowProvider row={row}>
      <ItemRow variant={variant} />
    </TagRowProvider>
  );
}

function ItemRow({ variant }: { variant: "row" | "card" | "index" }) {
  const { row, rowRef, buildMenuItems, renaming, openTagItems } = useTagRow();
  const { selectionStore, actions } = useDataTable<TagsRowData>();
  const selected = useSelector(selectionStore, (state) =>
    state.selectedIds.has(row.id),
  );
  if (row.kind !== "tag") return null;

  function selectRange() {
    actions.toggleRow(row.id, true);
  }

  function openFromPointer(event: MouseEvent<HTMLDivElement>) {
    if (variant !== "index") return;
    if (event.shiftKey) {
      selectRange();
      return;
    }
    if (renaming || fromControl(event.target)) return;
    openTagItems();
  }

  function openFromKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (variant !== "index") return;
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.shiftKey) {
      event.preventDefault();
      selectRange();
      return;
    }
    if (renaming || fromControl(event.target)) return;
    event.preventDefault();
    openTagItems();
  }

  return (
    <TagContextMenu buildItems={buildMenuItems}>
      <div
        ref={rowRef}
        className={styles.row}
        data-tag-row=""
        data-card={variant === "card" || undefined}
        data-index={variant === "index" || undefined}
        data-selected={selected || undefined}
        role="option"
        aria-selected={selected}
        tabIndex={variant === "index" ? 0 : -1}
        title={row.tag.name}
        onClick={openFromPointer}
        onKeyDown={openFromKeyboard}
      >
        {variant !== "index" ? (
          <TagCheckbox rowId={row.id} name={row.tag.name} />
        ) : null}
        <NameCell index={variant === "index"} />
        <ActionsCell />
      </div>
    </TagContextMenu>
  );
}
