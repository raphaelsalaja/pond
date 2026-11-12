import type { TableColumn } from "@pond/ui/data-table";
import type { TagsRowData } from "../types";

export const tagsColumns: TableColumn<TagsRowData>[] = [
  {
    id: "name",
    sortLabel: "Name",
    accessor: (r) => (r.kind === "group" ? r.group.name : r.tag.name),
    cell: () => null,
    width: "minmax(0, 1fr)",
  },
];
