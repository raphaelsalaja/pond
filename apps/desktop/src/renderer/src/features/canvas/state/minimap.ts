import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

const STORAGE_KEY = "pond.canvasMinimap";

export type MinimapStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): MinimapStorage {
  return window.localStorage;
}

function readShown(storage: () => MinimapStorage): boolean {
  try {
    return storage().getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function createMinimap(storage: () => MinimapStorage = browserStorage) {
  const store = new Store({ shown: readShown(storage) });
  return {
    store,
    shown: (): boolean => store.state.shown,
    toggle: (): void => {
      const shown = !store.state.shown;
      try {
        storage().setItem(STORAGE_KEY, shown ? "1" : "0");
      } catch {
        /** Storage can be full or blocked; the toggle still applies for this session. */
      }
      store.setState(() => ({ shown }));
    },
  };
}

const { store, ...controls } = createMinimap();

export const minimap = controls;

export function useMinimapShown(): boolean {
  return useSelector(store, (state) => state.shown);
}
