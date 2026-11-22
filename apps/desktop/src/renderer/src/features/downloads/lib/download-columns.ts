export const DOWNLOAD_COLUMN_CATALOG = [
  { id: "name", label: "Name" },
  { id: "stage", label: "Status" },
  { id: "size", label: "Size" },
  { id: "speed", label: "Speed" },
  { id: "remaining", label: "Remaining" },
  { id: "progress", label: "Progress" },
  { id: "elapsed", label: "Elapsed" },
  { id: "files", label: "Files" },
  { id: "attempts", label: "Attempts" },
  { id: "server", label: "Server" },
  { id: "error", label: "Error" },
  { id: "added", label: "Added" },
] as const;

export type DownloadColumnId = (typeof DOWNLOAD_COLUMN_CATALOG)[number]["id"];

export const LOCKED_DOWNLOAD_COLUMN: DownloadColumnId = "name";

const DEFAULT_VISIBLE_DOWNLOAD_COLUMNS: readonly DownloadColumnId[] = [
  "stage",
  "progress",
  "added",
];

export const DEFAULT_HIDDEN_DOWNLOAD_COLUMNS: readonly DownloadColumnId[] =
  DOWNLOAD_COLUMN_CATALOG.map((column) => column.id).filter(
    (id) =>
      id !== LOCKED_DOWNLOAD_COLUMN &&
      !DEFAULT_VISIBLE_DOWNLOAD_COLUMNS.includes(id),
  );
