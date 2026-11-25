import type { Source } from "@pond/schema/db";
import type { CardModel } from "@/features/sources/components/sync-monitor/lib/helpers";

export type SourceKind = "account" | "watch" | "folder";

export type SourceStatusId =
  | "active"
  | "syncing"
  | "failed"
  | "paused"
  | "offline";

export interface SourceFilters {
  q: string;
  statuses: ReadonlySet<SourceStatusId>;
  sources: ReadonlySet<Source>;
  types: ReadonlySet<string>;
}

export interface FilterableSource {
  name: string;
  handle: string | null;
  source: Source | null;
  sourceLabel: string;
  kind: SourceKind;
  kindLabel: string;
  statusId: SourceStatusId;
}

export function defaultSourceFilters(): SourceFilters {
  return {
    q: "",
    statuses: new Set(),
    sources: new Set(),
    types: new Set(),
  };
}

export const SOURCE_STATUS_OPTIONS: ReadonlyArray<{
  id: SourceStatusId;
  label: string;
}> = [
  { id: "active", label: "Active" },
  { id: "syncing", label: "Syncing" },
  { id: "failed", label: "Failed" },
  { id: "paused", label: "Paused" },
  { id: "offline", label: "Offline" },
];

export function sourceFiltersActive(filters: SourceFilters): boolean {
  return (
    filters.statuses.size > 0 ||
    filters.sources.size > 0 ||
    filters.types.size > 0
  );
}

export function sourceStatusId(
  tone: CardModel["tone"],
  connected: boolean,
): SourceStatusId {
  if (tone === "run") return "syncing";
  if (tone === "err") return "failed";
  if (tone === "paused") return "paused";
  if (!connected) return "offline";
  return "active";
}

export function sourceStatusLabel(id: SourceStatusId): string {
  return SOURCE_STATUS_OPTIONS.find((opt) => opt.id === id)?.label ?? id;
}

export function matchesSourceFilters(
  row: FilterableSource,
  filters: SourceFilters,
): boolean {
  if (filters.statuses.size > 0 && !filters.statuses.has(row.statusId)) {
    return false;
  }
  if (
    filters.sources.size > 0 &&
    (!row.source || !filters.sources.has(row.source))
  ) {
    return false;
  }
  if (filters.types.size > 0 && !filters.types.has(row.kindLabel)) {
    return false;
  }
  const q = filters.q.trim().toLowerCase();
  if (!q) return true;
  const hay = [row.name, row.handle, row.sourceLabel]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}
