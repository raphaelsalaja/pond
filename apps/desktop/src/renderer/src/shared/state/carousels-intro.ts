import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

interface CarouselsIntroState {
  open: boolean;
  /** Saves a split would change, counted when the dialog opened. */
  count: number;
}

const store = new Store<CarouselsIntroState>({ open: false, count: 0 });

export const carouselsIntroDialog = {
  open(count: number): void {
    store.setState(() => ({ open: true, count }));
  },
  close(): void {
    store.setState((s) => (s.open ? { ...s, open: false } : s));
  },
  isOpen(): boolean {
    return store.state.open;
  },
};

export function useCarouselsIntroDialog(): CarouselsIntroState {
  return useSelector(store, (s) => s);
}
