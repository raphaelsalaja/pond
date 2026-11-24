export interface HistoryCursor {
  ts: number;
  id: number;
}

export function cursorFor(
  rows: ReadonlyArray<HistoryCursor>,
): HistoryCursor | null {
  const row = rows.at(-1);
  return row ? { ts: row.ts, id: row.id } : null;
}
