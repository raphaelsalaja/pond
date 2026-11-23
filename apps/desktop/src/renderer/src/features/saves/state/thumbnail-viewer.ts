import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

interface ThumbnailViewerState {
  id: string;
  saveId: string;
}

export const thumbnailViewerStore = new Store<ThumbnailViewerState | null>(
  null,
);

export function openThumbnailViewer(saveId: string): void {
  thumbnailViewerStore.setState(() => ({ id: crypto.randomUUID(), saveId }));
}

export function closeThumbnailViewer(): void {
  thumbnailViewerStore.setState(() => null);
}

export function useThumbnailViewer(): ThumbnailViewerState | null {
  return useSelector(thumbnailViewerStore, (state) => state);
}
