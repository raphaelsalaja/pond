import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

export interface SaveDragSession {
  ids: readonly string[];
  hasFiles: boolean;
}

const store = new Store<SaveDragSession | null>(null);

export function currentSaveDragSession(): SaveDragSession | null {
  return store.state;
}

export function startSaveDragSession(session: SaveDragSession): void {
  store.setState(() => session);
}

export function endSaveDragSession(): void {
  if (store.state) store.setState(() => null);
}

export function useSaveDragSession(): SaveDragSession | null {
  return useSelector(store, (state) => state);
}
