import type { Source } from "@pond/schema/db";

export interface StatusRow {
  id: string;
  label: string;
  count: number;
}

export const DOWNLOAD_STATUSES: StatusRow[] = [
  { id: "active", label: "Active", count: 3 },
  { id: "waiting", label: "Waiting", count: 41 },
  { id: "failed", label: "Failed", count: 6 },
  { id: "cancelled", label: "Canceled", count: 2 },
  { id: "skipped", label: "Skipped", count: 12 },
  { id: "complete", label: "Completed", count: 1284 },
];

export interface DownloadSourceRow {
  source: Source;
  count: number;
  gate?: "paused" | "limited";
  retry?: string;
}

export const DOWNLOAD_SOURCES: DownloadSourceRow[] = [
  { source: "twitter", count: 28, gate: "limited", retry: "4m" },
  { source: "instagram", count: 9 },
  { source: "youtube", count: 4 },
  { source: "pinterest", count: 6, gate: "paused" },
  { source: "tiktok", count: 3 },
];

export interface TransferRow {
  id: string;
  label: string;
  detail: string;
  failed?: boolean;
}

export const TRANSFERS: TransferRow[] = [
  { id: "export", label: "Export Pond Package", detail: "In progress, 42%" },
  {
    id: "import",
    label: "Import Eagle Package",
    detail: "Failed. Try again.",
    failed: true,
  },
];

export interface RunningRow {
  id: string;
  source: Source;
  title: string;
  detail: string;
}

export const RUNNING: RunningRow[] = [
  {
    id: "r1",
    source: "youtube",
    title: "Designing with type at small sizes",
    detail: "62% of 418 MB",
  },
  {
    id: "r2",
    source: "twitter",
    title: "Some menu items and toggle designed for RevSpring",
    detail: "4 of 7 images",
  },
  {
    id: "r3",
    source: "instagram",
    title: "My favourite exploration from this project",
    detail: "Starting",
  },
];

export type SourceHealth = "active" | "syncing" | "failed" | "paused" | "offline";

export interface SourceRow {
  id: string;
  kind: "account" | "watch" | "folder";
  source: Source;
  label: string;
  detail: string;
  health: SourceHealth;
}

export const SOURCES: SourceRow[] = [
  {
    id: "a1",
    kind: "account",
    source: "twitter",
    label: "@raphaelsalaja",
    detail: "Bookmarks and likes, synced 4m ago",
    health: "syncing",
  },
  {
    id: "a2",
    kind: "account",
    source: "instagram",
    label: "@raphaelsalaja",
    detail: "Saved posts, synced 1h ago",
    health: "active",
  },
  {
    id: "a3",
    kind: "account",
    source: "pinterest",
    label: "raphaelsalaja",
    detail: "Sign in again to resume syncing",
    health: "failed",
  },
  {
    id: "a4",
    kind: "account",
    source: "arena",
    label: "Raphael Salaja",
    detail: "Paused",
    health: "paused",
  },
  {
    id: "w1",
    kind: "watch",
    source: "twitter",
    label: "@learnframer",
    detail: "Posts, checked 12m ago",
    health: "active",
  },
  {
    id: "w2",
    kind: "watch",
    source: "youtube",
    label: "Figma",
    detail: "New videos, checked 2h ago",
    health: "active",
  },
  {
    id: "w3",
    kind: "watch",
    source: "twitter",
    label: "@evilmartians",
    detail: "Offline. Checks resume when you're back online",
    health: "offline",
  },
  {
    id: "f1",
    kind: "folder",
    source: "local",
    label: "Inspiration",
    detail: "~/Pictures/Inspiration",
    health: "active",
  },
];

export const SOURCE_STATUSES: { id: SourceHealth; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "syncing", label: "Syncing" },
  { id: "failed", label: "Failed" },
  { id: "paused", label: "Paused" },
  { id: "offline", label: "Offline" },
];
