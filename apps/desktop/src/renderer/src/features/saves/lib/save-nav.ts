import { ensureSaves } from "@/features/saves/lib/ensure-saves";
import { resultNavigation } from "@/features/saves/state/result-navigation";
import { primarySelection, selection } from "@/features/saves/state/selection";
import { useRouteLocation } from "@/shared/hooks/use-route-location";
import { latestSearch, writeSearch } from "@/shared/lib/route-search";

/** Numeric ids arrive JSON-parsed from hand-written links. */
export function saveIdFromSearch(search: Record<string, unknown>): string | null {
  const value = search.save;
  if (typeof value === "string" && value) return value;
  if (typeof value === "number") return String(value);
  return null;
}

/** The Save open over the current route, read from the committed location. */
export function useOpenSaveId(): string | null {
  return useRouteLocation((location) => saveIdFromSearch(location.search));
}

export function openSaveId(): string | null {
  return saveIdFromSearch(latestSearch());
}

/** Opens over the current route, so closing returns to exactly what was behind it. */
export function openSave(
  id: string,
  options: { replace?: boolean } = {},
): void {
  primarySelection.set(id);
  selection.setCursor(id);
  const replace = options.replace ?? openSaveId() !== null;
  writeSearch({ save: id }, { replace });
}

/** Moves on when the open Save leaves its results, so a move or trash keeps the preview going. */
export function followDeparture(id: string): () => void {
  return resultNavigation.watchDeparture(id, (next) => {
    if (selection.getCursor() !== id) return;
    if (next) openSave(next, { replace: true });
    else closeSave();
  });
}

/** Drops the step when the viewer has already moved on, so a slow page load cannot jump back. */
export function stepSave(id: string, delta: number): void {
  void resultNavigation.next(id, delta).then(async (next) => {
    if (!next || selection.getCursor() !== id) return;
    await ensureSaves([next]);
    if (selection.getCursor() !== id) return;
    openSave(next);
  });
}

export function closeSave(): void {
  primarySelection.set(selection.getCursor());
  writeSearch({ save: undefined });
}

export function syncPrimaryFromSearch(search: Record<string, unknown>): void {
  const primary = saveIdFromSearch(search) ?? selection.getCursor();
  if (primarySelection.get() !== primary) primarySelection.set(primary);
}
