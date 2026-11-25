import { IconFolder } from "@pond/icons";
import { PickerPanel, usePickerCursor } from "@pond/ui/picker-panel";
import { clsx as cn } from "clsx";
import { Fragment, useMemo, useState } from "react";
import type { ComponentPropsWithoutRef, CSSProperties } from "react";
import { folderRows, searchFolders } from "@/utils/library-targets";
import type { FolderRow } from "@/utils/library-targets";
import type { Folder } from "@/utils/messaging";
import styles from "./styles.module.css";

const SWATCHES = new Set([
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
  "pink",
]);

function folderColor(color: string | null): string | undefined {
  if (!color) return undefined;
  if (SWATCHES.has(color)) return `var(--ds-${color})`;
  return /^#[\da-f]{3,8}$/i.test(color) ? color : undefined;
}

interface Entry {
  id: string;
  row: FolderRow;
  flat: boolean;
}

interface Section {
  label: string | null;
  entries: Array<Entry>;
}

interface RowStyle extends CSSProperties {
  "--folder-depth": number;
}

const entryId = (entry: Entry) => entry.id;

interface FoldersProps extends Omit<
  ComponentPropsWithoutRef<"div">,
  "onChange"
> {
  folders: Array<Folder>;
  recentIds: Array<string>;
  value: Array<string>;
  onValueChange: (value: Array<string>) => void;
}

export function Folders({
  folders,
  recentIds,
  value,
  onValueChange,
  className,
  ...props
}: FoldersProps) {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => folderRows(folders), [folders]);
  const selected = new Set(value);
  const searching = query.trim().length > 0;

  const sections = useMemo<Array<Section>>(() => {
    const entries = (prefix: string, list: Array<FolderRow>, flat: boolean) =>
      list.map((row) => ({ id: `${prefix}-${row.folder.id}`, row, flat }));
    if (searching) {
      return [
        {
          label: null,
          entries: entries("match", searchFolders(rows, query), true),
        },
      ];
    }
    const byId = new Map(rows.map((row) => [row.folder.id, row]));
    const recent = recentIds.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
    if (recent.length === 0) {
      return [{ label: null, entries: entries("all", rows, false) }];
    }
    return [
      { label: "Recent", entries: entries("recent", recent, true) },
      { label: "All Folders", entries: entries("all", rows, false) },
    ];
  }, [query, recentIds, rows, searching]);
  const items = sections.flatMap((section) => section.entries);

  const toggle = (folderId: string) =>
    onValueChange(
      selected.has(folderId)
        ? value.filter((id) => id !== folderId)
        : [...value, folderId],
    );

  const cursor = usePickerCursor({
    items,
    getId: entryId,
    onActivate: (entry) => toggle(entry.row.folder.id),
  });

  return (
    <PickerPanel.Surface className={cn(styles.folders, className)} {...props}>
      <PickerPanel.Header>
        <PickerPanel.Search
          {...cursor.inputProps}
          aria-label="Search Folders"
          placeholder="Search…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </PickerPanel.Header>
      <PickerPanel.Collection
        id={cursor.collectionId}
        className={styles.list}
        role="listbox"
        aria-label="Folders"
        aria-multiselectable
      >
        {sections.map((section) => (
          <Fragment key={section.label ?? "folders"}>
            {section.label ? (
              <PickerPanel.GroupLabel>{section.label}</PickerPanel.GroupLabel>
            ) : null}
            {section.entries.map((entry) => {
              const { folder } = entry.row;
              const checked = selected.has(folder.id);
              const style: RowStyle = {
                "--folder-depth": entry.flat ? 0 : entry.row.depth,
              };
              return (
                <PickerPanel.Item
                  {...cursor.getItemProps(entry)}
                  key={entry.id}
                  className={styles.row}
                  style={style}
                  aria-selected={checked}
                  selected={checked ? "checked" : "unchecked"}
                >
                  <PickerPanel.ItemIcon
                    style={{ color: folderColor(folder.color) }}
                  >
                    <IconFolder size={14} />
                  </PickerPanel.ItemIcon>
                  <PickerPanel.ItemLabel
                    title={[...entry.row.path, folder.name].join(" / ")}
                    path={entry.flat ? entry.row.path : undefined}
                  >
                    {folder.name}
                  </PickerPanel.ItemLabel>
                  <PickerPanel.SelectionMark
                    state={checked ? "checked" : "unchecked"}
                  />
                </PickerPanel.Item>
              );
            })}
          </Fragment>
        ))}
        {items.length === 0 ? (
          <PickerPanel.Empty>
            {folders.length === 0 ? "No folders yet." : "No matching folders."}
          </PickerPanel.Empty>
        ) : null}
      </PickerPanel.Collection>
    </PickerPanel.Surface>
  );
}
