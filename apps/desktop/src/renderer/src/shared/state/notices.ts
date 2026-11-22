import { carouselsIntroDialog } from "./carousels-intro";
import { fishIntroDialog } from "./fish-intro";
import { instagramCollectionsDialog } from "./instagram-collections";
import { loadPrefs, savePrefsSection } from "./prefs";
import { setupFlow } from "./setup";
import { supportDialog } from "./support";
import { whatsNewDialog } from "./whats-new";

export function anotherDialogOpen(): boolean {
  return (
    setupFlow.isOpen() ||
    whatsNewDialog.isOpen() ||
    supportDialog.isOpen() ||
    fishIntroDialog.isOpen() ||
    instagramCollectionsDialog.isOpen() ||
    carouselsIntroDialog.isOpen()
  );
}

export function withNoticeSeen(seen: readonly string[], id: string): string[] {
  return seen.includes(id) ? [...seen] : [...seen, id];
}

export async function markNoticeSeen(id: string): Promise<void> {
  const { seen } = (await loadPrefs()).notices;
  if (seen.includes(id)) return;
  await savePrefsSection("notices", { seen: withNoticeSeen(seen, id) });
}
