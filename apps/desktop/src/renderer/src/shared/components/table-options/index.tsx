import {
  IconAscendingSorting,
  IconDescendingSorting,
  IconSliders,
} from "@pond/icons";
import { Button, Popover, Select, Toggle, Tooltip } from "@pond/ui";
import { clsx as cn } from "clsx";
import { useState } from "react";
import type {
  TableColumnLayout,
  TableColumnSpec,
  TableSort,
} from "@/shared/lib/table-column-layout";
import styles from "./styles.module.css";

export function TableOptionsMenu<Id extends string>({
  columns,
  lockedId,
  layout,
  onHiddenChange,
  onSortChange,
}: {
  columns: readonly TableColumnSpec<Id>[];
  lockedId: Id;
  layout: TableColumnLayout<Id>;
  onHiddenChange: (id: Id, hidden: boolean) => void;
  onSortChange: (sort: TableSort<Id> | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const hidden = new Set(layout.hidden);
  const hideable = columns.some((column) => column.id !== lockedId);
  const sortItems = columns
    .filter((column) => column.sortable !== false)
    .map((column) => ({ value: column.id, label: column.label }));
  const sortLabel =
    columns.find((column) => column.id === layout.sort?.id)?.label ?? "None";

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Tooltip label="Options" side="bottom">
        <Button
          render={<Popover.Trigger />}
          icon
          size="sm"
          variant="ghost"
          aria-label="Options"
        >
          <IconSliders />
        </Button>
      </Tooltip>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8}>
          <Popover.Popup className={styles.popup} aria-label="Options">
            <Select.Root
              items={sortItems}
              value={layout.sort?.id ?? null}
              onValueChange={(value) => {
                const column = columns.find((item) => item.id === value);
                if (!column) return;
                onSortChange({
                  id: column.id,
                  desc: layout.sort?.desc ?? false,
                });
              }}
            >
              <div className={cn(styles.section, styles.row)}>
                <Select.Label className={styles.label}>Sort By</Select.Label>
                <div className={styles.controls}>
                  <Button
                    icon
                    size="sm"
                    variant="secondary"
                    disabled={!layout.sort}
                    aria-label="Toggle Sort Direction"
                    onClick={() => {
                      if (!layout.sort) return;
                      onSortChange({
                        id: layout.sort.id,
                        desc: !layout.sort.desc,
                      });
                    }}
                  >
                    {layout.sort?.desc ? (
                      <IconDescendingSorting />
                    ) : (
                      <IconAscendingSorting />
                    )}
                  </Button>
                  <Select.Trigger size="sm" className={styles.select}>
                    <Select.Value placeholder="None">{sortLabel}</Select.Value>
                  </Select.Trigger>
                </div>
              </div>
              <Select.Portal>
                <Select.Positioner align="end" sideOffset={6}>
                  <Select.Popup>
                    <Select.Items items={sortItems} />
                  </Select.Popup>
                </Select.Positioner>
              </Select.Portal>
            </Select.Root>
            {hideable ? (
              <>
                <hr className={styles.separator} />
                <fieldset className={cn(styles.section, styles.fieldset)}>
                  <legend className={cn(styles.label, styles.legend)}>
                    Display Properties
                  </legend>
                  <div className={styles.properties}>
                    {columns
                      .filter((column) => column.id !== lockedId)
                      .map((column) => {
                        const visible = !hidden.has(column.id);
                        return (
                          <Toggle
                            key={column.id}
                            size="sm"
                            variant="outline"
                            pressed={visible}
                            onPressedChange={() =>
                              onHiddenChange(column.id, visible)
                            }
                          >
                            {column.label}
                          </Toggle>
                        );
                      })}
                  </div>
                </fieldset>
              </>
            ) : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
