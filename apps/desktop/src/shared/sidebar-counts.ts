export interface LibrarySidebarCounts {
  library: number;
  /** Needs Review only; snoozed and processed Saves are not actionable yet. */
  inbox: number;
  uncategorized: number;
  untagged: number;
  recentlyAdded: number;
  recentlyUsed: number;
  trash: number;
  folders: Record<string, number>;
  foldersDownloading: Record<string, number>;
}
