import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

/** The window toolbar's spot for the open Save's viewer bar. */
const store = new Store<HTMLElement | null>(null);

export function setViewerToolbarHost(host: HTMLElement | null): void {
  store.setState(() => host);
}

export function useViewerToolbarHost(): HTMLElement | null {
  return useSelector(store, (state) => state);
}
