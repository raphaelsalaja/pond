import { Checkbox } from "@pond/ui";
import { useDataTable } from "@pond/ui/data-table";
import { useSelector } from "@tanstack/react-store";
import type { ComponentProps, MouseEvent } from "react";
import type { TagsRowData } from "./types";

function stop(e: MouseEvent) {
  e.stopPropagation();
}

export function TagCheckbox({
  rowId,
  name,
  className,
}: {
  rowId: string;
  name: string;
  className?: ComponentProps<typeof Checkbox.Root>["className"];
}) {
  const { selectionStore, actions } = useDataTable<TagsRowData>();
  const selected = useSelector(selectionStore, (s) => s.selectedIds.has(rowId));
  return (
    <Checkbox.Root
      size="sm"
      checked={selected}
      className={className}
      aria-label={selected ? `Deselect ${name}` : `Select ${name}`}
      onClick={stop}
      onCheckedChange={() => actions.toggleRow(rowId, false)}
    >
      <Checkbox.Indicator />
    </Checkbox.Root>
  );
}
