import {
  watchHandleLabel,
  watchKindLabel,
  watchSourceLabel,
} from "@pond/schema/watches";
import { cardModel } from "@/features/sources/components/sync-monitor/lib/helpers";
import type { CardModel } from "@/features/sources/components/sync-monitor/lib/helpers";
import type { AccountRow } from "@/features/sources/hooks/use-accounts";
import { watchedFolderName } from "@/features/sources/hooks/use-watched-folder";
import type { WatchedFolderStatus } from "@/features/sources/hooks/use-watched-folder";
import type { WatchRow } from "@/features/sources/hooks/use-watches";
import { getSourceDef } from "@/features/sources/lib/registry";
import { sourceStatusId, sourceStatusLabel } from "./filters";
import type { FilterableSource, SourceStatusId } from "./filters";

export type SourceEntry =
  | { kind: "account"; row: AccountRow }
  | { kind: "watch"; row: WatchRow }
  | { kind: "folder"; row: WatchedFolderStatus };

export interface SourceTableRow extends FilterableSource {
  id: string;
  avatarUrl: string | null | undefined;
  items: number;
  lastSyncedAt: string | null;
  lastSyncedMs: number;
  statusLabel: string;
  model: CardModel;
  entry: SourceEntry;
}

function watchName(watch: WatchRow): string {
  if (watch.label) {
    return watch.label;
  }
  return watchHandleLabel(watch.handle, watch.kind);
}

type RemoteSourceEntry = Exclude<SourceEntry, { kind: "folder" }>;

function sourceRowName(entry: RemoteSourceEntry): string {
  if (entry.kind === "account") {
    if (entry.row.label) {
      return entry.row.label;
    }
    if (entry.row.handle) {
      return `@${entry.row.handle}`;
    }
    return getSourceDef(entry.row.source).label;
  }
  return watchName(entry.row);
}

function typeLabel(entry: RemoteSourceEntry): string {
  if (entry.kind === "account") {
    return "Account";
  }
  const kind = watchKindLabel(entry.row.kind);
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

export function toFolderTableRow(
  status: WatchedFolderStatus,
): SourceTableRow | null {
  if (!status.path) {
    return null;
  }
  const imported = status.history.filter((item) => item.ok);
  const lastMs = imported[0]?.at ?? status.history[0]?.at ?? null;
  const statusId: SourceStatusId = status.enabled ? "active" : "paused";
  return {
    id: `folder:${status.path}`,
    kind: "folder",
    source: null,
    name: watchedFolderName(status.path),
    handle: null,
    avatarUrl: null,
    items: imported.length,
    lastSyncedAt: lastMs === null ? null : new Date(lastMs).toISOString(),
    lastSyncedMs: lastMs ?? Number.NEGATIVE_INFINITY,
    statusId,
    statusLabel: sourceStatusLabel(statusId),
    sourceLabel: "Local",
    kindLabel: "Folder",
    model: cardModel(undefined),
    entry: { kind: "folder", row: status },
  };
}

export function toSourceTableRow(
  entry: RemoteSourceEntry,
  model: CardModel,
): SourceTableRow {
  const statusId = sourceStatusId(model.tone, model.connected);
  const lastSyncedAt = entry.row.sync?.lastSyncedAt ?? null;
  const lastSyncedMs = lastSyncedAt
    ? new Date(lastSyncedAt).getTime()
    : Number.NEGATIVE_INFINITY;
  return {
    id: entry.row.id,
    kind: entry.kind,
    source: entry.row.source,
    name: sourceRowName(entry),
    handle: entry.row.handle,
    avatarUrl: entry.row.avatarUrl,
    items: entry.row.sync?.knownCount ?? 0,
    lastSyncedAt,
    lastSyncedMs,
    statusId,
    statusLabel: sourceStatusLabel(statusId),
    sourceLabel:
      entry.kind === "watch"
        ? watchSourceLabel(entry.row.source)
        : getSourceDef(entry.row.source).label,
    kindLabel: typeLabel(entry),
    model,
    entry,
  };
}
