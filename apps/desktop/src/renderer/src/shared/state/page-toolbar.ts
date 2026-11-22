import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

/** The window toolbar's spot for a page's own search and actions. */
const store = new Store<HTMLElement | null>(null);

export function setPageToolbarHost(host: HTMLElement | null): void {
  store.setState(() => host);
}

export function usePageToolbarHost(): HTMLElement | null {
  return useSelector(store, (state) => state);
}
