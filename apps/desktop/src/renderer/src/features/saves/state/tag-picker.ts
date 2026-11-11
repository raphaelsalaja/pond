import { Store } from "@tanstack/store";
import { protectSaves } from "@/features/saves/state/pool";

export interface SaveTagPickerRequest {
  key: number;
  ids: readonly string[];
  anchorId: string | null;
}

export const saveTagPickerStore = new Store<SaveTagPickerRequest | null>(null);

protectSaves(() => saveTagPickerStore.state?.ids ?? []);

let nextKey = 0;

export function openSaveTagPicker(
  ids: readonly string[],
  anchorId: string | null,
): void {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  nextKey += 1;
  saveTagPickerStore.setState(() => ({
    key: nextKey,
    ids: unique,
    anchorId,
  }));
}

export function closeSaveTagPicker(): void {
  if (saveTagPickerStore.state === null) return;
  saveTagPickerStore.setState(() => null);
}
