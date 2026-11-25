import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

export type ViewPopover = "view";

interface HeaderState {
  searchNonce: number;
  popover: ViewPopover | null;
}

const store = new Store<HeaderState>({
  searchNonce: 0,
  popover: null,
});

export const libraryHeader = {
  focusSearch(): void {
    store.setState((s) => ({
      searchNonce: s.searchNonce + 1,
      popover: null,
    }));
  },
  openPopover(popover: ViewPopover): void {
    store.setState((s) => (s.popover === popover ? s : { ...s, popover }));
  },
  togglePopover(popover: ViewPopover = "view"): void {
    store.setState((s) => ({
      ...s,
      popover: s.popover === popover ? null : popover,
    }));
  },
  closePopover(popover?: ViewPopover): void {
    store.setState((s) => {
      if (s.popover === null || (popover && s.popover !== popover)) return s;
      return { ...s, popover: null };
    });
  },
};

export function useSearchNonce(): number {
  return useSelector(store, (s) => s.searchNonce);
}

export function useViewPopover(): ViewPopover | null {
  return useSelector(store, (s) => s.popover);
}
