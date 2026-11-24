export interface SidebarSave {
  id: string;
  deletedAt: number | null;
  tags: ReadonlyArray<string>;
}

export interface SidebarCounts {
  library: number;
  uncategorized: number;
  untagged: number;
  trash: number;
  folders: Record<string, number>;
}

export function countSidebarSaves(
  saves: ReadonlyArray<SidebarSave>,
  memberships: Record<string, ReadonlyArray<string>>,
): SidebarCounts {
  let library = 0;
  let uncategorized = 0;
  let untagged = 0;
  let trash = 0;
  const folders: Record<string, number> = {};

  for (const save of saves) {
    if (save.deletedAt) {
      trash += 1;
      continue;
    }
    library += 1;
    if (save.tags.length === 0) {
      untagged += 1;
    }
    const folderIds = memberships[save.id] ?? [];
    if (folderIds.length === 0) {
      uncategorized += 1;
    }
    for (const folderId of folderIds) {
      folders[folderId] = (folders[folderId] ?? 0) + 1;
    }
  }

  return { library, uncategorized, untagged, trash, folders };
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}
