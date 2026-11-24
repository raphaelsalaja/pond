import type { LibrarySwitchEvent } from "@shared/library-switch-contracts";
import { Store } from "@tanstack/store";

export const librarySwitchStore = new Store<LibrarySwitchEvent | null>(null);

export function showLibrarySwitch(event: LibrarySwitchEvent): void {
  librarySwitchStore.setState(() => event);
}

export function dismissLibrarySwitch(): void {
  librarySwitchStore.setState(() => null);
}

export function librarySwitchFailed(): boolean {
  return librarySwitchStore.state?.phase === "failed";
}
