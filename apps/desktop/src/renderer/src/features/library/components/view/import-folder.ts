import type { Folder } from "@pond/schema/db";
import type { LibraryNav } from "@/features/library/state/library-chrome";
import type { SaveListMode } from "@/features/saves";

/** Only the custom folder on screen is a destination, so other views never inherit a remembered folder. */
export function importFolderFor({
  mode,
  nav,
  folders,
}: {
  mode: SaveListMode;
  nav: LibraryNav;
  folders: ReadonlyArray<Folder>;
}): Folder | undefined {
  if (mode !== "library" || nav.kind !== "folder") return undefined;
  const { id } = nav;
  return folders.find((folder) => folder.id === id);
}
