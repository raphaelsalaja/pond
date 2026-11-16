import type { ComponentDocs } from "../shared/docs";
import { DataTable, type TableColumn } from ".";

interface Save {
  id: string;
  title: string;
  source: string;
  saved: string;
}

const saves: Save[] = [
  {
    id: "grid-systems",
    title: "Grid Systems",
    source: "Are.na",
    saved: "Mar 2",
  },
  { id: "type-scale", title: "Type Scale", source: "X", saved: "Mar 4" },
  {
    id: "motion-notes",
    title: "Motion Notes",
    source: "YouTube",
    saved: "Mar 9",
  },
];

const columns: TableColumn<Save>[] = [
  {
    id: "title",
    header: "Title",
    sortLabel: "Title",
    accessor: (save) => save.title,
    width: "minmax(160px, 2fr)",
    resizable: true,
    reorderable: true,
    cell: (save) => save.title,
  },
  {
    id: "source",
    header: "Source",
    sortLabel: "Source",
    accessor: (save) => save.source,
    width: "minmax(120px, 1fr)",
    resizable: true,
    reorderable: true,
    cell: (save) => save.source,
  },
  {
    id: "saved",
    header: "Saved",
    sortLabel: "Saved",
    accessor: (save) => save.saved,
    width: "minmax(96px, 1fr)",
    align: "end",
    reorderable: true,
    cell: (save) => save.saved,
  },
];

export const docs: ComponentDocs = {
  slug: "data-table",
  name: "Data Table",
  tier: "composite",
  summary:
    "A virtualized grid of rows with sortable, resizable and reorderable columns. Name the grid with `aria-label` on `Root`.",
  parts: [
    {
      name: "Provider",
      description:
        "Holds rows, columns, sorting, selection, expansion and column order.",
    },
    {
      name: "Root",
      description: "The `grid`. Renders the header and the virtualized body.",
    },
    {
      name: "Header",
      description:
        "Column headers with sort buttons, resize handles and drag to reorder.",
    },
    {
      name: "Body",
      description: "Virtualized rows with an `Empty` and an `ExtraRow` slot.",
    },
    {
      name: "Toolbar",
      description: "Layout row for filters and actions above the grid.",
    },
    {
      name: "ActionBar",
      description: "Bar for bulk actions on the selected rows.",
    },
    {
      name: "Hotkeys",
      description:
        "Row keys while the grid has focus. Needs `onSelectionChange` on `Provider`.",
    },
  ],
  keyboard: [
    { keys: "ArrowUp / ArrowDown", action: "Selects the previous or next row" },
    { keys: "Home / End", action: "Selects the first or last row" },
    { keys: "PageUp / PageDown", action: "Selects a row one page away" },
    {
      keys: "Shift+ArrowUp / Shift+ArrowDown",
      action: "Extends the selection",
    },
    { keys: "Space", action: "Toggles the current row's selection" },
    { keys: "Enter", action: "Selects the current row and runs `onRowClick`" },
    { keys: "Mod+A", action: "Selects every row" },
    { keys: "Escape", action: "Clears the selection" },
    {
      keys: "Enter / Space",
      action: "On a column header, sorts by that column",
    },
    {
      keys: "Alt+ArrowLeft / Alt+ArrowRight",
      action: "Moves the focused column left or right",
    },
    {
      keys: "ArrowLeft / ArrowRight",
      action: "Resizes the column from its resize handle",
    },
  ],
  accessibility: [
    "Renders a `grid` with `aria-rowcount`, `aria-colcount` and `aria-activedescendant` for the current row.",
    "Sortable headers expose `aria-sort` and name their button `Sort by` plus the column's `sortLabel`.",
    "Reorderable headers list their keys in `aria-keyshortcuts`. Screen readers hear each pickup, move and drop.",
    "Resize handles are buttons named `Resize` plus the column's `sortLabel`.",
  ],
  examples: [
    {
      name: "Sort, Resize and Reorder",
      render: () => (
        <DataTable.Provider
          data={saves}
          columns={columns}
          getRowId={(save) => save.id}
          defaultSort={{ id: "saved", desc: true }}
        >
          <DataTable.Root aria-label="Saves" />
        </DataTable.Provider>
      ),
    },
    {
      name: "Selection",
      render: () => (
        <DataTable.Provider
          data={saves}
          columns={columns}
          getRowId={(save) => save.id}
          onSelectionChange={() => {}}
        >
          <DataTable.Root aria-label="Selectable Saves" />
          <DataTable.Hotkeys />
        </DataTable.Provider>
      ),
    },
  ],
};
