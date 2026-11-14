export interface LibrarySidebarCounts {
  library: number;
  uncategorized: number;
  untagged: number;
  recentlyAdded: number;
  recentlyUsed: number;
  /** Saves needing review; snoozed ones are counted apart and never in the badge. */
  inbox: number;
  inboxSnoozed: number;
  trash: number;
  folders: Record<string, number>;
  foldersDownloading: Record<string, number>;
}
