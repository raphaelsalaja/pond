import { useState } from "react";
import type { MenuRow } from "./types";

/** Keep in sync with results-list/styles.module.css. */
const RESULTS_LAYOUT = {
  row: 32,
  tallRow: 48,
  group: 30,
  divider: 12,
  padding: 6,
  cap: 370,
} as const;

function rowHeight(row: MenuRow): number {
  if (row.kind === "group")
    return RESULTS_LAYOUT.group + (row.divided ? RESULTS_LAYOUT.divider : 0);
  if (row.kind === "entry" && row.item.entry.tall)
    return RESULTS_LAYOUT.tallRow;
  return RESULTS_LAYOUT.row;
}

function contentHeight(rows: readonly MenuRow[]): number {
  if (rows.length === 0) return 0;
  return rows.reduce(
    (height, row) => height + rowHeight(row),
    RESULTS_LAYOUT.padding * 2,
  );
}

/** Results height from row sizes; it only grows until `resetKey` changes, so typing never collapses the panel. */
export function useResultsHeight(
  rows: readonly MenuRow[],
  resetKey: string,
): number {
  const natural = Math.min(contentHeight(rows), RESULTS_LAYOUT.cap);
  const [peak, setPeak] = useState({ key: resetKey, height: natural });
  if (peak.key !== resetKey) {
    setPeak({ key: resetKey, height: natural });
    return natural;
  }
  if (natural > peak.height) setPeak({ key: resetKey, height: natural });
  return Math.max(peak.height, natural);
}
