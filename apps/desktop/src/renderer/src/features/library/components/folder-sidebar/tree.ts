export function descendantFolderIds(
  id: string,
  folders: ReadonlyArray<{ id: string; parentId: string | null }>,
): Array<string> {
  const children = new Map<string | null, Array<string>>();
  for (const folder of folders) {
    const list = children.get(folder.parentId) ?? [];
    list.push(folder.id);
    children.set(folder.parentId, list);
  }
  const ids = [id];
  for (let index = 0; index < ids.length; index++) {
    const current = ids[index];
    if (!current) continue;
    ids.push(...(children.get(current) ?? []));
  }
  return ids;
}

export type FolderListSort = "manual" | "createdAt" | "title";

export function sortFolderRows<
  T extends { name: string; sortOrder: number; createdAt: Date },
>(folders: Array<T>, sort: FolderListSort): Array<T> {
  if (sort === "manual") {
    return folders;
  }
  return folders.toSorted((a, b) => {
    if (sort === "createdAt") {
      return (
        b.createdAt.getTime() - a.createdAt.getTime() ||
        a.name.localeCompare(b.name)
      );
    }
    return a.name.localeCompare(b.name);
  });
}

export function flattenFolderTree<
  T extends { id: string; parentId: string | null },
>(
  folders: Array<T>,
  collapsed: ReadonlySet<string> = new Set(),
): Array<{ folder: T; depth: number }> {
  const children = new Map<string | null, Array<T>>();
  for (const folder of folders) {
    const siblings = children.get(folder.parentId) ?? [];
    siblings.push(folder);
    children.set(folder.parentId, siblings);
  }

  const rows: Array<{ folder: T; depth: number }> = [];
  const visited = new Set<string>();
  function visit(parentId: string | null, depth: number) {
    const siblings = children.get(parentId) ?? [];
    for (const folder of siblings) {
      if (visited.has(folder.id)) continue;
      visited.add(folder.id);
      rows.push({ folder, depth });
      if (!collapsed.has(folder.id)) visit(folder.id, depth + 1);
    }
  }
  visit(null, 0);
  return rows;
}
