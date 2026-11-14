export interface LibrarySidebarCounts {
  library: number;
  uncategorized: number;
  untagged: number;
  recentlyAdded: number;
  recentlyUsed: number;
  splitPosts: number;
  trash: number;
  folders: Record<string, number>;
  foldersDownloading: Record<string, number>;
}
