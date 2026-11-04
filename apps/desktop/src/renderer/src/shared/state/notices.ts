import { carouselsIntroDialog } from "./carousels-intro";
import { fishIntroDialog } from "./fish-intro";
import { instagramCollectionsDialog } from "./instagram-collections";
import { loadPrefs, savePrefsSection } from "./prefs";
import { promptToast } from "./prompts";
import { setupFlow } from "./setup";
import { supportDialog } from "./support";
import { whatsNewDialog } from "./whats-new";

let claimed: string | null = null;

/** One first-open notice per launch, so announcements never stack; the rest wait for the next launch. */
export function claimNoticeSlot(id: string): boolean {
  if (claimed !== null && claimed !== id) return false;
  claimed = id;
  return true;
}

export function anotherDialogOpen(): boolean {
  return (
    setupFlow.isOpen() ||
    whatsNewDialog.isOpen() ||
    supportDialog.isOpen() ||
    promptToast.isOpen() ||
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
