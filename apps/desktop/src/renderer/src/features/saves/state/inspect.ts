import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

interface InspectState {
  grayscale: boolean;
  compare: boolean;
  showNavigator: boolean;
}

function readNavigator(): boolean {
  if (!globalThis.window) return false;
  try {
    return window.localStorage.getItem("pond.viewer.showNavigator") === "1";
  } catch {
    return false;
  }
}

const store = new Store<InspectState>({
  grayscale: false,
  compare: false,
  showNavigator: readNavigator(),
});

export const inspect = {
  toggleGrayscale(): void {
    store.setState((state) => ({ ...state, grayscale: !state.grayscale }));
  },
  setGrayscale(grayscale: boolean): void {
    store.setState((state) => ({ ...state, grayscale }));
  },
  setCompare(compare: boolean): void {
    store.setState((state) => ({ ...state, compare }));
  },
  toggleCompare(): void {
    store.setState((state) => ({ ...state, compare: !state.compare }));
  },
  setShowNavigator(showNavigator: boolean): void {
    if (globalThis.window) {
      try {
        window.localStorage.setItem(
          "pond.viewer.showNavigator",
          showNavigator ? "1" : "0",
        );
      } catch {
        /** Storage can be full or blocked; the toggle still applies for this session. */
      }
    }
    store.setState((state) =>
      state.showNavigator === showNavigator
        ? state
        : { ...state, showNavigator },
    );
  },
  toggleNavigator(): void {
    inspect.setShowNavigator(!store.state.showNavigator);
  },
  snapshot(): InspectState {
    return store.state;
  },
};

export function useInspect(): InspectState {
  return useSelector(store, (state) => state);
}
