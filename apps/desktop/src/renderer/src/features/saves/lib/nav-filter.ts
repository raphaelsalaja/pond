import type { Folder } from "@pond/schema/db";
import type { Save } from "@/features/saves/types";
import { inboxScope, type LibraryNav } from "@/shared/lib/library-nav";

export function descendantFolderIds(
  id: string,
  folders: readonly Folder[],
): Set<string> {
  const ids = new Set<string>([id]);
  const walk = (parent: string) => {
    for (const folder of folders) {
      if (folder.parentId === parent && !ids.has(folder.id)) {
        ids.add(folder.id);
        walk(folder.id);
      }
    }
  };
  walk(id);
  return ids;
}

export function applyNavFilter<
  T extends Pick<Save, "id" | "tags" | "inboxState">,
>(
  saves: readonly T[],
  nav: LibraryNav,
  memberships: Record<string, string[]>,
  folders: readonly Folder[],
  includeDescendants = true,
): T[] {
  if (
    nav.kind === "all" ||
    nav.kind === "recents" ||
    nav.kind === "recentlyAdded" ||
    nav.kind === "random" ||
    nav.kind === "trash" ||
    nav.kind === "downloads" ||
    nav.kind === "sources"
  ) {
    return [...saves];
  }
  if (nav.kind === "inbox") {
    const state = inboxScope(nav);
    return saves.filter((save) => save.inboxState === state);
  }
  if (nav.kind === "uncategorized") {
    return saves.filter((save) => (memberships[save.id] ?? []).length === 0);
  }
  if (nav.kind === "folder") {
    const ids = includeDescendants
      ? descendantFolderIds(nav.id, folders)
      : new Set([nav.id]);
    return saves.filter((save) =>
      (memberships[save.id] ?? []).some((folderId) => ids.has(folderId)),
    );
  }
  if (nav.kind === "tag") {
    const needle = nav.name.toLowerCase();
    return saves.filter((save) =>
      save.tags.some((tag) => tag.toLowerCase() === needle),
    );
  }
  return [...saves];
}
