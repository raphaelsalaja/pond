import { Store } from "@tanstack/store";

interface RenameDialogState {
  id: string;
  ids: ReadonlyArray<string>;
}

export const renameDialogStore = new Store<RenameDialogState | null>(null);

export function openRenameDialog(ids: ReadonlyArray<string>): void {
  if (ids.length === 0) {
    return;
  }
  renameDialogStore.setState(() => ({
    id: crypto.randomUUID(),
    ids: [...new Set(ids)],
  }));
}

export function closeRenameDialog(): void {
  renameDialogStore.setState(() => null);
}
