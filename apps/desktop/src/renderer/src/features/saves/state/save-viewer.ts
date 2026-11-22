import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import type { ViewerNavigation } from "@/features/saves/components/viewers/viewer-toolbar-groups";

export interface SaveViewerNavigation extends ViewerNavigation {
  saveId: string;
}

interface SaveViewerState {
  fileIndex: number | null;
  navigation: SaveViewerNavigation | null;
}

const store = new Store<SaveViewerState>({
  fileIndex: null,
  navigation: null,
});

export function setSaveViewerFileIndex(fileIndex: number | null): void {
  store.setState((s) => (s.fileIndex === fileIndex ? s : { ...s, fileIndex }));
}

export function useSaveViewerFileIndex(): number | null {
  return useSelector(store, (s) => s.fileIndex);
}

export function setSaveViewerNavigation(
  navigation: SaveViewerNavigation | null,
): void {
  store.setState((s) => ({ ...s, navigation }));
}

export function useSaveViewerNavigation(): SaveViewerNavigation | null {
  return useSelector(store, (s) => s.navigation);
}
