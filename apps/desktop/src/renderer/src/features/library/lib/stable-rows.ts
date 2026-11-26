import type { Save } from "@/features/saves/types";

const NO_FOLDERS: Array<string> = [];

/**
 * Joins pool Saves with their folder memberships for the Library grid.
 *
 * The pool publishes a new list on every write, even to a Save outside the view. Rebuilding
 * every row then gave the grid a new array and new objects, so it re-packed the layout and
 * re-rendered each card. A row is reused while its Save object and membership list are the
 * same, and the previous array is returned while every row is.
 */
export function createRowJoiner(): (
  saves: ReadonlyArray<Save>,
  memberships: Readonly<Record<string, Array<string>>>,
) => Array<Save> {
  const rows = new WeakMap<Save, { folderIds: Array<string>; row: Save }>();
  let previous: Array<Save> = [];
  return (saves, memberships) => {
    const next: Array<Save> = [];
    let unchanged = saves.length === previous.length;
    for (const [index, save] of saves.entries()) {
      const folderIds = memberships[save.id] ?? NO_FOLDERS;
      const cached = rows.get(save);
      let row = cached?.row;
      if (!row || cached?.folderIds !== folderIds) {
        row = { ...save, folderIds };
        rows.set(save, { folderIds, row });
      }
      if (previous[index] !== row) unchanged = false;
      next.push(row);
    }
    if (unchanged) return previous;
    previous = next;
    return next;
  };
}
