import type { LibrarySidebarCounts } from "@shared/sidebar-counts";
import { useEffect, useState } from "react";
import { useRecents } from "@/features/saves";

/** Counts refresh on every sync action, so an unchanged result keeps the old object and skips the tree render. */
function sameFolderMap(
  a: Record<string, number>,
  b: Record<string, number>,
): boolean {
  if (Object.keys(a).length !== Object.keys(b).length) return false;
  for (const key of Object.keys(a)) if (a[key] !== b[key]) return false;
  return true;
}
function sameCounts(a: LibrarySidebarCounts, b: LibrarySidebarCounts): boolean {
  return (
    a.library === b.library &&
    a.uncategorized === b.uncategorized &&
    a.untagged === b.untagged &&
    a.recentlyAdded === b.recentlyAdded &&
    a.recentlyUsed === b.recentlyUsed &&
    a.splitPosts === b.splitPosts &&
    a.trash === b.trash &&
    sameFolderMap(a.folders, b.folders) &&
    sameFolderMap(a.foldersDownloading, b.foldersDownloading)
  );
}

const EMPTY: LibrarySidebarCounts = {
  library: 0,
  uncategorized: 0,
  untagged: 0,
  recentlyAdded: 0,
  recentlyUsed: 0,
  splitPosts: 0,
  trash: 0,
  folders: {},
  foldersDownloading: {},
};
export function useSidebarCounts(): LibrarySidebarCounts {
  const recentKey = useRecents()
    .map((entry) => entry.saveId)
    .join("\0");
  const [counts, setCounts] = useState(EMPTY);
  useEffect(() => {
    const recentIds = recentKey ? recentKey.split("\0") : [];
    let active = true;
    let pending = false;
    let dirty = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        void refresh();
      }, 150);
    };
    const refresh = async () => {
      if (pending) {
        dirty = true;
        return;
      }
      pending = true;
      dirty = false;
      try {
        const next = await window.pond.query("saves.sidebarCounts", {
          recentIds,
        });
        if (active && next)
          setCounts((prev) => (sameCounts(prev, next) ? prev : next));
      } catch (error) {
        console.warn("[pond] sidebar counts failed", error);
      } finally {
        pending = false;
        if (active && dirty) schedule();
      }
    };
    void refresh();
    const off = window.pond.onSyncAction(schedule);
    return () => {
      active = false;
      off();
      if (timer) clearTimeout(timer);
    };
  }, [recentKey]);
  return counts;
}
