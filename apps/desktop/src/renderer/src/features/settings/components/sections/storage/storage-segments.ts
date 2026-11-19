import type { QueryResult } from "@shared/query-contracts";

type Breakdown = QueryResult<"storage.snapshot">["breakdown"];

export interface StorageSegment {
  key: keyof Breakdown;
  label: string;
  bytes: number;
  percent: number;
}

const LABELS: ReadonlyArray<[keyof Breakdown, string]> = [
  ["items", "Items"],
  ["videoCache", "Video Cache"],
  ["thumbs", "Thumbnails"],
  ["meta", "Metadata"],
  ["db", "Database"],
  ["other", "Other"],
];

/** Each category's share of the Library on disk; empty categories are left out. */
export function storageSegments(breakdown: Breakdown): StorageSegment[] {
  const total = LABELS.reduce((sum, [key]) => sum + breakdown[key], 0);
  if (total <= 0) return [];
  return LABELS.filter(([key]) => breakdown[key] > 0).map(([key, label]) => ({
    key,
    label,
    bytes: breakdown[key],
    percent: (breakdown[key] / total) * 100,
  }));
}
