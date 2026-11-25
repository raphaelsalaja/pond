import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

interface WhatsNewOffer {
  version: string;
  versions: ReadonlyArray<string>;
}

interface WhatsNewState {
  open: boolean;
  /** Versions to show; null shows every bundled entry. */
  versions: ReadonlyArray<string> | null;
  /** Unseen entries for this version; the sidebar shows What's New until the dialog closes. */
  offer: WhatsNewOffer | null;
}

const SEEN_KEY = "pond:whatsNewSeenVersion";

const store = new Store<WhatsNewState>({
  open: false,
  versions: null,
  offer: null,
});

/** The app version What's New last ran for, or null on a first run. */
export function readWhatsNewSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

export function writeWhatsNewSeen(version: string): void {
  try {
    localStorage.setItem(SEEN_KEY, version);
  } catch {
    /** Storage can be unavailable; the offer shows again on the next launch. */
  }
}

export const whatsNewDialog = {
  open(versions: ReadonlyArray<string> | null = null): void {
    store.setState((s) => ({ ...s, open: true, versions }));
  },
  offer(version: string, versions: ReadonlyArray<string>): void {
    store.setState((s) => ({ ...s, offer: { version, versions } }));
  },
  openOffer(): void {
    const { offer } = store.state;
    if (offer) whatsNewDialog.open(offer.versions);
  },
  close(): void {
    const { open, offer } = store.state;
    if (!open) return;
    if (offer) writeWhatsNewSeen(offer.version);
    store.setState((s) => ({ ...s, open: false, offer: null }));
  },
  isOpen(): boolean {
    return store.state.open;
  },
};

export function useWhatsNewDialog(): WhatsNewState {
  return useSelector(store, (s) => s);
}

export function useWhatsNewOffered(): boolean {
  return useSelector(store, (s) => s.offer !== null);
}
