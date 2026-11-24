import { IconAscendingSorting, IconDescendingSorting } from "@pond/icons";
import { Button, Select } from "@pond/ui";
import { clsx as cn } from "clsx";
import { isSortKey } from "@/features/library/hooks/use-filtered-saves";
import { useView } from "@/features/library/hooks/use-view";
import type { SortKey } from "@/features/library/hooks/use-view";
import { useLibraryNav } from "@/features/library/state/library-chrome";
import {
  reseedRandomSort,
  toggleSortDir,
} from "@/features/library/state/view-store";
import { ViewMenuRow } from "../row";
import styles from "./styles.module.css";

export const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "random", label: "Random" },
  { value: "savedAt", label: "Date Saved" },
  { value: "createdAt", label: "Date Added" },
  { value: "publishedAt", label: "Date Published" },
  { value: "title", label: "Title" },
  { value: "type", label: "Type" },
  { value: "creator", label: "Creator" },
  { value: "source", label: "Source" },
  { value: "tagName", label: "First Tag" },
  { value: "tagCount", label: "Tag Count" },
  { value: "rating", label: "Rating" },
  { value: "duration", label: "Duration" },
  { value: "width", label: "Width" },
  { value: "height", label: "Height" },
  { value: "dimensions", label: "Dimensions" },
  { value: "aspectRatio", label: "Aspect Ratio" },
  { value: "fileSize", label: "Size" },
  { value: "fileCount", label: "Count" },
];

function sortOptionLabel(key: SortKey): string {
  return SORT_OPTIONS.find((item) => item.value === key)?.label ?? key;
}

export function SortSection({ onArrange }: { onArrange?: () => void }) {
  const nav = useLibraryNav();
  const { state, actions } = useView();
  const { key, dir } = state.sort;

  return (
    <>
      <Select.Root
        items={SORT_OPTIONS}
        value={key}
        onValueChange={(value) => {
          if (value && isSortKey(value)) {
            actions.setSort({ key: value, dir });
          }
        }}
      >
        <ViewMenuRow.Root>
          <Select.Label className={ViewMenuRow.Label}>Sort By</Select.Label>
          <div className={styles.controls}>
            <Button
              icon
              size="sm"
              variant="secondary"
              className={styles.direction}
              aria-label="Toggle Sort Direction"
              onClick={toggleSortDir}
            >
              {dir === "asc" ? (
                <IconAscendingSorting />
              ) : (
                <IconDescendingSorting />
              )}
            </Button>
            <Select.Trigger
              size="sm"
              className={cn(ViewMenuRow.Select, styles.select)}
            >
              <Select.Value>{sortOptionLabel(key)}</Select.Value>
            </Select.Trigger>
          </div>
        </ViewMenuRow.Root>
        <Select.Portal>
          <Select.Positioner align="end" sideOffset={6}>
            <Select.Popup>
              <Select.Items items={SORT_OPTIONS} />
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
      {key === "random" ? (
        <ViewMenuRow.Root>
          <span className={ViewMenuRow.Label}>Random Order</span>
          <Button size="sm" variant="secondary" onClick={reseedRandomSort}>
            Reshuffle
          </Button>
        </ViewMenuRow.Root>
      ) : null}
      {nav?.kind === "folder" ? (
        <ViewMenuRow.Root>
          <span className={ViewMenuRow.Label}>Saved for this folder</span>
          <Button size="sm" variant="secondary" onClick={onArrange}>
            Arrange Folder
          </Button>
        </ViewMenuRow.Root>
      ) : null}
    </>
  );
}
