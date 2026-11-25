export interface OrderedFolder {
  id: string;
  parentId: string | null;
  sortOrder: number;
}
export function planFolderMove(
  rows: ReadonlyArray<OrderedFolder>,
  id: string,
  parentId: string | null,
  beforeId?: string,
) {
  const current = rows.find((row) => row.id === id);
  if (!current) throw new Error("Folder no longer exists.");
  const visited = new Set([id]);
  let parent = parentId;
  while (parent) {
    if (visited.has(parent)) throw new Error("A folder cannot contain itself.");
    visited.add(parent);
    const row = rows.find((item) => item.id === parent);
    if (!row) throw new Error("Destination folder no longer exists.");
    parent = row.parentId;
  }
  const siblings = rows
    .filter((row) => row.parentId === parentId && row.id !== id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const at = beforeId
    ? siblings.findIndex((row) => row.id === beforeId)
    : siblings.length;
  if (at < 0) throw new Error("The destination changed. Try again.");
  siblings.splice(at, 0, { ...current, parentId });
  return siblings.flatMap((row, sortOrder) =>
    row.sortOrder === sortOrder &&
    row.parentId === rows.find((item) => item.id === row.id)?.parentId
      ? []
      : [{ id: row.id, parentId, sortOrder }],
  );
}

export function planFolderBatchMove(
  rows: ReadonlyArray<OrderedFolder>,
  ids: ReadonlyArray<string>,
  parentId: string | null,
  beforeId?: string,
) {
  const selected = new Set(ids);
  const roots = [...selected].filter((id) => {
    let current = rows.find((row) => row.id === id);
    if (!current) throw new Error("Folder no longer exists.");
    const visited = new Set([id]);
    while (current.parentId) {
      if (selected.has(current.parentId)) {
        return false;
      }
      if (visited.has(current.parentId)) {
        throw new Error("The folder hierarchy contains a cycle.");
      }
      visited.add(current.parentId);
      current = rows.find((row) => row.id === current?.parentId);
      if (!current) throw new Error("Destination folder no longer exists.");
    }
    return true;
  });
  let next = [...rows];
  for (const id of roots) {
    const patches = new Map(
      planFolderMove(next, id, parentId, beforeId).map((patch) => [
        patch.id,
        patch,
      ]),
    );
    next = next.map((row) => patches.get(row.id) ?? row);
  }
  return next.filter((row) => {
    const before = rows.find((old) => old.id === row.id);
    return (
      row.parentId !== before?.parentId || row.sortOrder !== before.sortOrder
    );
  });
}
