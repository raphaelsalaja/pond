import type { LibrarySidebarCounts } from "@shared/sidebar-counts";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { useEffect } from "react";
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
    a.inbox === b.inbox &&
    a.inboxSnoozed === b.inboxSnoozed &&
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
  inbox: 0,
  inboxSnoozed: 0,
  trash: 0,
  folders: {},
  foldersDownloading: {},
};

/** The query runs synchronously on the main process, so every sidebar part shares one result instead of querying per mount. */
const store = new Store<LibrarySidebarCounts>(EMPTY);
let recentIds: string[] = [];
let loadedKey: string | null = null;
let users = 0;
let stopListening: (() => void) | undefined;
let pending = false;
let dirty = false;
let timer: ReturnType<typeof setTimeout> | undefined;

function schedule(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    void refresh();
  }, 150);
}

async function refresh(): Promise<void> {
  if (pending) {
    dirty = true;
    return;
  }
  pending = true;
  dirty = false;
  try {
    const next = await window.pond.query("saves.sidebarCounts", { recentIds });
    if (users > 0 && next)
      store.setState((prev) => (sameCounts(prev, next) ? prev : next));
  } catch (error) {
    console.warn("[pond] sidebar counts failed", error);
  } finally {
    pending = false;
    if (users > 0 && dirty) schedule();
  }
}

export function useSidebarCounts(): LibrarySidebarCounts {
  const recentKey = useRecents()
    .map((entry) => entry.saveId)
    .join("\0");
  useEffect(() => {
    users += 1;
    if (users === 1) stopListening = window.pond.onSyncAction(schedule);
    return () => {
      users -= 1;
      if (users > 0) return;
      stopListening?.();
      stopListening = undefined;
      if (timer) clearTimeout(timer);
      timer = undefined;
      loadedKey = null;
      store.setState(() => EMPTY);
    };
  }, []);
  useEffect(() => {
    if (loadedKey === recentKey) return;
    loadedKey = recentKey;
    recentIds = recentKey ? recentKey.split("\0") : [];
    void refresh();
  }, [recentKey]);
  return useSelector(store, (state) => state);
}
