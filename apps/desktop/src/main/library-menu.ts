export function libraryMenuLabels(isMac: boolean) {
  return [
    "New Library",
    "Open Library",
    isMac ? "Reveal Library in Finder" : "Reveal Library in File Explorer",
    "Move Library",
    "Rescan Library",
    "Reload Library",
    "Verify Integrity",
    "Backup",
    "Restore",
    "Merge Library",
    "Empty Trash",
    "Restore All from Trash",
    "Clear History",
  ] as const;
}

export const LIBRARY_MENU_LABELS = libraryMenuLabels(
  process.platform === "darwin",
);
