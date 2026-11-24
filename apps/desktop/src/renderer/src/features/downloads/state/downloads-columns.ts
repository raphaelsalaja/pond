import { createTableColumnLayout } from "@/shared/lib/table-column-layout";
import type {
  StoredTableColumnLayout,
  TableColumnLayout,
  TableSort,
} from "@/shared/lib/table-column-layout";
import {
  DEFAULT_HIDDEN_DOWNLOAD_COLUMNS,
  DOWNLOAD_COLUMN_CATALOG,
  LOCKED_DOWNLOAD_COLUMN,
} from "../lib/download-columns";
import type { DownloadColumnId } from "../lib/download-columns";

export type DownloadsColumnLayout = TableColumnLayout<DownloadColumnId>;

const layout = createTableColumnLayout({
  storageKey: "pond:downloads-columns",
  columns: DOWNLOAD_COLUMN_CATALOG,
  lockedId: LOCKED_DOWNLOAD_COLUMN,
  defaultHidden: DEFAULT_HIDDEN_DOWNLOAD_COLUMNS,
});

export function normalizeDownloadsColumnLayout(
  value: StoredTableColumnLayout,
): DownloadsColumnLayout {
  return layout.normalize(value);
}

export function mergeVisibleColumnOrder(
  order: ReadonlyArray<DownloadColumnId>,
  hidden: ReadonlyArray<DownloadColumnId>,
  visibleOrder: ReadonlyArray<string>,
): Array<DownloadColumnId> {
  return layout.mergeVisibleOrder(order, hidden, visibleOrder);
}

export const downloadsColumnsLayout = {
  snapshot: (): DownloadsColumnLayout => layout.snapshot(),
  setHidden: (id: DownloadColumnId, hidden: boolean): void =>
    layout.setHidden(id, hidden),
  setSort: (sort: TableSort<DownloadColumnId> | null): void =>
    layout.setSort(sort),
  applyVisibleOrder: (visibleOrder: ReadonlyArray<string>): void =>
    layout.applyVisibleOrder(visibleOrder),
  reset: (): void => layout.reset(),
};

export function useDownloadsColumnLayout(): DownloadsColumnLayout {
  return layout.useLayout();
}
