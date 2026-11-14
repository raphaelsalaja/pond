const RECENT_FOLDER_DESTINATIONS_KEY = "pond:recent-folder-destinations";

export function readRecentFolderIds(): string[] {
  try {
    return (
      localStorage
        .getItem(RECENT_FOLDER_DESTINATIONS_KEY)
        ?.split("\n")
        .filter(Boolean) ?? []
    );
  } catch {
    return [];
  }
}

export function rememberFolderDestinations(ids: readonly string[]): void {
  if (ids.length === 0) return;
  try {
    localStorage.setItem(
      RECENT_FOLDER_DESTINATIONS_KEY,
      [...new Set([...ids, ...readRecentFolderIds()])].slice(0, 10).join("\n"),
    );
  } catch {}
}

export function lastUsedFolderId(): string | null {
  return readRecentFolderIds()[0] ?? null;
}
