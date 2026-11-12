import { Empty } from "@pond/ui";
import { useRouterState } from "@tanstack/react-router";
import { lazy, Suspense, useDeferredValue, useMemo } from "react";
import {
  useFolderMemberships,
  useFolders,
} from "@/features/library/state/folders";
import { saveIdFromPath } from "@/features/saves/lib/save-nav";
import {
  usePrimarySelection,
  useSelectedIds,
  useSelectionCursor,
} from "@/features/saves/state/selection";
import { usePrefs } from "@/shared/state/prefs";

const SaveInspector = lazy(async () => {
  const module = await import("@/features/saves/components/detail/pane");
  return { default: module.SaveInspector };
});

/** The open Save route stays singular; the library inspector follows the current selection. */
export function inspectorSaveIds(input: {
  routeId: string | null;
  selected: readonly string[];
  primary: string | null;
  cursor: string | null;
}): string[] {
  if (input.routeId) return [input.routeId];
  if (input.selected.length > 0) return [...input.selected];
  if (input.primary) return [input.primary];
  if (input.cursor) return [input.cursor];
  return [];
}

export function SaveDetails() {
  const routeId = useRouterState({
    select: (s) => saveIdFromPath(s.location.pathname),
  });
  const selected = useSelectedIds();
  const primary = usePrimarySelection();
  const cursor = useSelectionCursor();
  const currentIds = useMemo(
    () => inspectorSaveIds({ routeId, selected, primary, cursor }),
    [routeId, selected, primary, cursor],
  );
  /** The inspector renders after the selection paints, and a held arrow key skips the saves it passes. */
  const saveIds = useDeferredValue(currentIds);
  const saveId = saveIds[0];
  const memberships = useFolderMemberships();
  const folders = useFolders();
  const [folderViews] = usePrefs("folderViews");
  return useMemo(() => {
    if (!saveId) {
      return (
        <Empty.Root role="status">
          <Empty.Title>No save selected</Empty.Title>
          <Empty.Description>
            Select a save to tag it or edit details.
          </Empty.Description>
        </Empty.Root>
      );
    }
    return (
      <Suspense fallback={null}>
        <SaveInspector
          saveId={saveId}
          saveIds={saveIds}
          folders={folders.map((folder) => ({
            id: folder.id,
            name: folder.name,
            parentId: folder.parentId,
            icon: folderViews[folder.id]?.icon,
            color: folder.color,
            count: saveIds.reduce(
              (total, id) =>
                total + ((memberships[id] ?? []).includes(folder.id) ? 1 : 0),
              0,
            ),
          }))}
        />
      </Suspense>
    );
  }, [folderViews, folders, memberships, saveId, saveIds]);
}
