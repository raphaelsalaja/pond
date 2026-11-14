import { Store } from "@tanstack/store";
import type { FolderPickerMode } from "@/features/saves";

export interface FolderPickerState {
  ids: readonly string[];
  mode: FolderPickerMode;
}

export const folderPickerStore = new Store<FolderPickerState>({
  ids: [],
  mode: "all",
});
export function openFolderPicker(
  ids: readonly string[],
  mode: FolderPickerMode = "all",
): void {
  folderPickerStore.setState(() => ({ ids: [...new Set(ids)], mode }));
}
export function closeFolderPicker(): void {
  folderPickerStore.setState(() => ({ ids: [], mode: "all" }));
}
