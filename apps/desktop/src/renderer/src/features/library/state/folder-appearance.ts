import { DEFAULT_PREFS, type Prefs } from "@pond/schema";
import {
  FolderColorSchema,
  RECENT_FOLDER_APPEARANCE_LIMIT,
} from "@pond/schema/folder-presentation";
import type { FolderIconId } from "@/shared/lib/folder-icons";
import {
  getPrefsSnapshot,
  loadPrefs,
  savePrefsSection,
  usePrefs,
} from "@/shared/state/prefs";

type FolderAppearancePrefs = Prefs["folderAppearance"];

/** Most recent first, without duplicates, capped to one picker row. */
export function withRecent<T>(recent: readonly T[], value: T): T[] {
  return [value, ...recent.filter((entry) => entry !== value)].slice(
    0,
    RECENT_FOLDER_APPEARANCE_LIMIT,
  );
}

let queue = Promise.resolve();

/** Recents are a convenience, so a failed write never blocks or fails the folder change. */
function remember(
  next: (current: FolderAppearancePrefs) => Partial<FolderAppearancePrefs>,
): Promise<void> {
  const operation = queue.then(async () => {
    const prefs = await loadPrefs();
    await savePrefsSection("folderAppearance", next(prefs.folderAppearance));
  });
  queue = operation.catch(() => {});
  return queue;
}

export function rememberFolderIcon(icon: FolderIconId): Promise<void> {
  return remember((current) => ({
    recentIcons: withRecent(current.recentIcons, icon),
  }));
}

export function rememberFolderColor(color: string | null): Promise<void> {
  const parsed = FolderColorSchema.safeParse(color);
  if (!parsed.success) return Promise.resolve();
  return remember((current) => ({
    recentColors: withRecent(current.recentColors, parsed.data),
  }));
}

export function useFolderAppearanceRecents(): FolderAppearancePrefs {
  return usePrefs("folderAppearance")[0];
}

export function folderAppearanceRecents(): FolderAppearancePrefs {
  return getPrefsSnapshot()?.folderAppearance ?? DEFAULT_PREFS.folderAppearance;
}
