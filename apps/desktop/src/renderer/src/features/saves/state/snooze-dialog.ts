import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

interface SnoozeDialogState {
  id: string;
  saveIds: string[];
}

const store = new Store<SnoozeDialogState | null>(null);

export function openSnoozeDialog(saveIds: readonly string[]): void {
  if (saveIds.length === 0) return;
  store.setState(() => ({ id: crypto.randomUUID(), saveIds: [...saveIds] }));
}

export function closeSnoozeDialog(): void {
  store.setState(() => null);
}

export function useSnoozeDialog(): SnoozeDialogState | null {
  return useSelector(store, (state) => state);
}
