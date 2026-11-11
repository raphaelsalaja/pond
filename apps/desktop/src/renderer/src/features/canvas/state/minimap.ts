import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

const STORAGE_KEY = "pond.canvasMinimap";

function readShown(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

const store = new Store({ shown: readShown() });

export const minimap = {
  shown(): boolean {
    return store.state.shown;
  },
  toggle(): void {
    const shown = !store.state.shown;
    try {
      window.localStorage.setItem(STORAGE_KEY, shown ? "1" : "0");
    } catch {}
    store.setState(() => ({ shown }));
  },
};

export function useMinimapShown(): boolean {
  return useSelector(store, (state) => state.shown);
}
