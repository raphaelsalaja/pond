import { Checkbox, ContentRow } from "@pond/ui";
import type { LargestSave } from "@shared/storage-insights";
import { clsx as cn } from "clsx";
import { useState } from "react";
import { openSave } from "@/features/saves";
import { formatBytes, formatPlural } from "@/shared/lib/format";
import { labelForSource, labelForType } from "../lib/labels";
import styles from "./styles.module.css";

export interface SaveSelection {
  selected: ReadonlySet<string>;
  chosen: Array<LargestSave>;
  toggle: (id: string, checked: boolean) => void;
  setAll: (checked: boolean) => void;
  clear: () => void;
}

/** Selection survives filtering, but actions only ever see the Saves still on screen. */
export function useSaveSelection(
  rows: ReadonlyArray<LargestSave>,
): SaveSelection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  return {
    selected,
    chosen: rows.filter((row) => selected.has(row.id)),
    toggle: (id, checked) =>
      setSelected((current) => {
        const next = new Set(current);
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
        return next;
      }),
    setAll: (checked) =>
      setSelected(checked ? new Set(rows.map((row) => row.id)) : new Set()),
    clear: () => setSelected(new Set()),
  };
}

interface SelectionProps extends React.ComponentPropsWithoutRef<"div"> {
  rows: ReadonlyArray<LargestSave>;
  selection: SaveSelection;
}

function Selection({
  rows,
  selection,
  className,
  children,
  ...props
}: SelectionProps) {
  const count = selection.chosen.length;
  const bytes = selection.chosen.reduce((sum, row) => sum + row.fileSize, 0);
  const all = rows.length > 0 && count === rows.length;
  return (
    <div className={cn(styles.selection, className)} {...props}>
      <Checkbox.Root
        size="sm"
        aria-label="Select All"
        checked={all}
        indeterminate={count > 0 && !all}
        disabled={!rows.length}
        onCheckedChange={(checked) => selection.setAll(checked === true)}
      >
        <Checkbox.Indicator />
      </Checkbox.Root>
      <span className={styles.summary} aria-live="polite">
        {count
          ? `${formatPlural(count, { one: "Save", other: "Saves" })} Selected · ${formatBytes(bytes)}`
          : "No Saves Selected"}
      </span>
      <div className={styles.actions}>{children}</div>
    </div>
  );
}

interface ItemsProps extends React.ComponentPropsWithoutRef<"ol"> {
  rows: ReadonlyArray<LargestSave>;
  selection: SaveSelection;
}

function Items({ rows, selection, className, ...props }: ItemsProps) {
  return (
    <ol className={cn(styles.saves, className)} {...props}>
      {rows.map((row) => {
        const title = row.title || row.url;
        return (
          <li key={row.id}>
            <ContentRow.Root>
              <Checkbox.Root
                size="sm"
                aria-label={`Select ${title}`}
                checked={selection.selected.has(row.id)}
                onCheckedChange={(checked) =>
                  selection.toggle(row.id, checked === true)
                }
              >
                <Checkbox.Indicator />
              </Checkbox.Root>
              <ContentRow.Trigger onClick={() => openSave(row.id)}>
                <ContentRow.Content>
                  <ContentRow.Title>{title}</ContentRow.Title>
                  <ContentRow.Description>
                    {[
                      row.mediaType ? labelForType(row.mediaType) : null,
                      labelForSource(row.source),
                      formatPlural(row.fileCount, {
                        one: "file",
                        other: "files",
                      }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </ContentRow.Description>
                </ContentRow.Content>
                <span className={styles.size}>{formatBytes(row.fileSize)}</span>
              </ContentRow.Trigger>
            </ContentRow.Root>
          </li>
        );
      })}
    </ol>
  );
}

export const SaveList = { Selection, Items };
