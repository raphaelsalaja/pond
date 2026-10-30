export const IMPORT_ORIGINS = [
  "eagle",
  "mymind",
  "bookmarks",
  "data-export",
  "pond-package",
  "files",
  "clipboard",
  "watched-folder",
] as const;
export type ImportOrigin = (typeof IMPORT_ORIGINS)[number];

export const IMPORT_ORIGIN_LABELS = {
  eagle: "Eagle",
  mymind: "mymind",
  bookmarks: "Bookmarks",
  "data-export": "Data Export",
  "pond-package": "Pond Package",
  files: "Files",
  clipboard: "Clipboard",
  "watched-folder": "Watched Folder",
} satisfies Record<ImportOrigin, string>;

/** Source id prefixes importers wrote before saves recorded their origin. */
export const LEGACY_IMPORT_PREFIXES = [
  ["eagle:", "eagle"],
  ["mymind:", "mymind"],
  ["mymind-file:", "mymind"],
  ["pondpack:", "pond-package"],
  ["auto:", "watched-folder"],
] as const satisfies ReadonlyArray<readonly [string, ImportOrigin]>;

export function toImportOrigin(
  value: string | null | undefined,
): ImportOrigin | null {
  return IMPORT_ORIGINS.find((origin) => origin === value) ?? null;
}

export function legacyImportOrigin(save: {
  source: string;
  sourceId: string;
}): ImportOrigin | null {
  if (save.source !== "local") return null;
  for (const [prefix, origin] of LEGACY_IMPORT_PREFIXES)
    if (save.sourceId.startsWith(prefix)) return origin;
  return null;
}
