import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

interface DownloadDialogState {
  open: boolean;
  /** Bumps on every open, so a reopened dialog starts on a fresh link page. */
  session: number;
  links: string[];
}

const store = new Store<DownloadDialogState>({
  open: false,
  session: 0,
  links: [],
});

export const downloadDialog = {
  open(links: string[] = []): void {
    store.setState((state) => ({
      open: true,
      session: state.open ? state.session : state.session + 1,
      links,
    }));
  },
  close(): void {
    store.setState((state) => ({ ...state, open: false }));
  },
};

export function useDownloadDialog(): DownloadDialogState {
  return useSelector(store, (state) => state);
}
