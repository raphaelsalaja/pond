import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

interface InstagramCollectionsState {
  open: boolean;
  accountIds: readonly string[];
}

const store = new Store<InstagramCollectionsState>({
  open: false,
  accountIds: [],
});

export const instagramCollectionsDialog = {
  open(accountIds: readonly string[]): void {
    store.setState(() => ({ open: true, accountIds }));
  },
  close(): void {
    store.setState((s) => (s.open ? { ...s, open: false } : s));
  },
  isOpen(): boolean {
    return store.state.open;
  },
};

export function useInstagramCollectionsDialog(): InstagramCollectionsState {
  return useSelector(store, (s) => s);
}
