import { Button } from "@pond/ui";
import type { MenuItemSpec } from "@pond/ui";
import { useView } from "@/features/library/hooks/use-view";
import type { SortKey } from "@/features/library/hooks/use-view";
import {
  LIST_COLUMN_OPTIONS,
  setListColumn,
  useListColumns,
} from "@/features/saves";
import type { ListColumnKey } from "@/features/saves";
import { SpecContextMenu } from "@/shared/components/spec-context-menu";
import styles from "./styles.module.css";

function sortKeyFor(column: ListColumnKey): SortKey | null {
  switch (column) {
    case "name":
      return "title";
    case "type":
      return "type";
    case "source":
      return "source";
    case "creator":
      return "creator";
    case "duration":
      return "duration";
    case "tags":
      return "tagName";
    case "dimensions":
      return "dimensions";
    case "rating":
      return "rating";
    case "extension":
      return "type";
    case "fileSize":
      return "fileSize";
    case "dateAdded":
      return "savedAt";
    case "datePublished":
      return "publishedAt";
    case "annotation":
      return null;
  }
}

export function buildListColumnItems(
  columns: ReturnType<typeof useListColumns>,
  onChange: (key: ListColumnKey, visible: boolean) => void,
): Array<MenuItemSpec> {
  return LIST_COLUMN_OPTIONS.map(({ key, label }) => ({
    type: "checkbox",
    label,
    indicator: "check",
    checked: columns[key],
    onCheckedChange: (visible) => onChange(key, visible),
  }));
}

export function ListHeader() {
  const columns = useListColumns();
  const { state, actions } = useView();
  const sort = (key: ListColumnKey) => {
    const sortKey = sortKeyFor(key);
    if (!sortKey) return;
    actions.setSort({
      key: sortKey,
      dir:
        state.sort.key === sortKey && state.sort.dir === "asc" ? "desc" : "asc",
    });
  };

  return (
    <SpecContextMenu
      buildItems={() => buildListColumnItems(columns, setListColumn)}
    >
      <div className={styles.header}>
        <span className={styles.preview}>Preview</span>
        {LIST_COLUMN_OPTIONS.filter(({ key }) => columns[key]).map(
          ({ key, label }) => {
            const sortKey = sortKeyFor(key);
            const sortable = sortKey !== null;
            return sortable ? (
              <Button
                key={key}
                className={styles.cell}
                size="xs"
                variant="text"
                aria-pressed={state.sort.key === sortKey}
                onClick={() => sort(key)}
              >
                {label}
              </Button>
            ) : (
              <span key={key} className={styles.cell}>
                {label}
              </span>
            );
          },
        )}
      </div>
    </SpecContextMenu>
  );
}
