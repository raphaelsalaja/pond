import { createTableColumnLayout } from "@/shared/lib/table-column-layout";

export const SOURCE_COLUMN_CATALOG = [
  { id: "name", label: "Name" },
  { id: "recent", label: "Recent Saves", sortable: false },
  { id: "items", label: "Saves" },
  { id: "lastSynced", label: "Last Fetch" },
  { id: "status", label: "Status" },
  { id: "source", label: "Source" },
  { id: "type", label: "Type" },
] as const;

export type SourceColumnId = (typeof SOURCE_COLUMN_CATALOG)[number]["id"];

export const LOCKED_SOURCE_COLUMN: SourceColumnId = "name";

const DEFAULT_SORT = { id: "name" as const, desc: false };

/** Versioned so layouts saved before Source and Type were hidden by default pick up the new defaults. */
const layout = createTableColumnLayout({
  storageKey: "pond:sources-columns:v2",
  columns: SOURCE_COLUMN_CATALOG,
  lockedId: LOCKED_SOURCE_COLUMN,
  defaultSort: DEFAULT_SORT,
  defaultHidden: ["source", "type"],
});

export const sourcesColumnsLayout = {
  snapshot: () => layout.snapshot(),
  setHidden: (...args: Parameters<typeof layout.setHidden>) =>
    layout.setHidden(...args),
  setSort: (...args: Parameters<typeof layout.setSort>) =>
    layout.setSort(...args),
  applyVisibleOrder: (...args: Parameters<typeof layout.applyVisibleOrder>) =>
    layout.applyVisibleOrder(...args),
  reset: () => layout.reset(),
};

export function useSourcesColumnLayout() {
  return layout.useLayout();
}

export const SOURCES_DEFAULT_SORT = DEFAULT_SORT;
