export interface SavePageCursor {
  savedAt: number;
  id: string;
}

/** Whether a descending `(savedAt, id)` query should include `row` after `cursor`. */
export function pageAfter(
  row: SavePageCursor,
  cursor: SavePageCursor,
): boolean {
  return (
    row.savedAt < cursor.savedAt ||
    (row.savedAt === cursor.savedAt && row.id < cursor.id)
  );
}

export function cursorFor(
  rows: readonly SavePageCursor[],
): SavePageCursor | null {
  const row = rows.at(-1);
  return row ? { savedAt: row.savedAt, id: row.id } : null;
}
