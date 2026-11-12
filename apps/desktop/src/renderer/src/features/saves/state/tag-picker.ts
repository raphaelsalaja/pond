import { useSelector } from "@tanstack/react-store";
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

const NO_TAG_PICKER_IDS: readonly string[] = [];

export function useTagPickerIds(): readonly string[] {
  return useSelector(
    saveTagPickerStore,
    (state) => state?.ids ?? NO_TAG_PICKER_IDS,
  );
}

const NO_DEPARTING_SAVES: ReadonlySet<string> = new Set();

const departingSaveStore = new Store<ReadonlySet<string>>(NO_DEPARTING_SAVES);

/** Marks Saves that stay visible only until the open tag picker closes. */
export function syncDepartingSaveIds(ids: readonly string[]): void {
  const next = ids.length === 0 ? NO_DEPARTING_SAVES : new Set(ids);
  const current = departingSaveStore.state;
  if (next === current) return;
  if (next.size === current.size && [...next].every((id) => current.has(id))) {
    return;
  }
  departingSaveStore.setState(() => next);
}

export function useIsDepartingSave(id: string): boolean {
  return useSelector(departingSaveStore, (state) => state.has(id));
}
