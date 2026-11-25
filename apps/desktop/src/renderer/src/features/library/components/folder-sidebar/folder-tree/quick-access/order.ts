interface QuickAccessPresentation {
  quickAccess?: boolean;
  quickAccessOrder?: number;
}

interface QuickAccessRow {
  id: string;
  name: string;
  sortOrder: number;
}

export function quickAccessRows<Row extends QuickAccessRow>(
  rows: ReadonlyArray<Row>,
  presentations: Partial<Record<string, QuickAccessPresentation>>,
): Array<Row> {
  return rows
    .filter((row) => presentations[row.id]?.quickAccess)
    .toSorted(
      (left, right) =>
        (presentations[left.id]?.quickAccessOrder ?? Number.MAX_SAFE_INTEGER) -
          (presentations[right.id]?.quickAccessOrder ??
            Number.MAX_SAFE_INTEGER) ||
        left.sortOrder - right.sortOrder ||
        left.name.localeCompare(right.name),
    );
}
