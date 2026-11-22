import type { LibraryHealthCheck } from "../../../shared/library-health-contracts";
import type { NotificationPost } from "../../../shared/notification-contracts";

/** The categories the stored check owns; posters, processing and downloads come from live sources. */
export const CHECK_HEALTH_CATEGORIES = [
  "originals",
  "previews",
  "records",
  "file-names",
  "index",
] as const;

type CheckCategory = (typeof CHECK_HEALTH_CATEGORIES)[number];

const TITLES = {
  originals: "Original Files",
  previews: "Thumbnails",
  records: "Save Records",
  "file-names": "File Names",
  index: "Library Index",
} satisfies Record<CheckCategory, string>;

export function healthNotificationId(category: string): string {
  return `health:${category}`;
}

function needAttention(count: number): string {
  return count === 1
    ? "1 Save needs attention"
    : `${count.toLocaleString("en-US")} Saves need attention`;
}

function attention(check: LibraryHealthCheck): Record<CheckCategory, number> {
  const count = (key: keyof LibraryHealthCheck["counts"]) =>
    check.counts[key] ?? 0;
  const index = check.index;
  const indexed = index
    ? index.missing.length + index.unreadable.length + index.orphans.length
    : 0;
  const unverified = index == null || check.indexError != null;
  return {
    originals: count("invalid-content") + count("unverified"),
    previews: count("thumbnails"),
    records: count("save-metadata"),
    "file-names": count("physical-file-names"),
    index: unverified ? Math.max(1, indexed) : indexed,
  };
}

/** Splits a finished check into notifications to upsert and categories that cleared. */
export function healthNotifications(check: LibraryHealthCheck): {
  posts: NotificationPost[];
  resolved: string[];
} {
  const counts = attention(check);
  const posts: NotificationPost[] = [];
  const resolved: string[] = [];
  for (const category of CHECK_HEALTH_CATEGORIES) {
    const count = counts[category];
    const id = healthNotificationId(category);
    if (count === 0) {
      resolved.push(id);
      continue;
    }
    const unreadableIndex =
      category === "index" && (check.index == null || check.indexError != null);
    posts.push({
      id,
      kind: "attention",
      priority: true,
      title: TITLES[category],
      body: unreadableIndex
        ? "Pond couldn't read the library index. Check that the library folder is reachable."
        : needAttention(count),
      target: { type: "health", categoryId: category },
    });
  }
  return { posts, resolved };
}
