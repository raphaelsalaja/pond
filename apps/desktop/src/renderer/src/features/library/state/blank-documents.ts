import type {
  BlankDocumentIcons,
  BlankDocumentKind,
} from "@shared/blank-documents";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

interface BlankDocumentsState {
  kinds: Array<BlankDocumentKind>;
  icons: BlankDocumentIcons;
}

const store = new Store<BlankDocumentsState>({ kinds: [], icons: {} });

export const blankDocuments = {
  kinds(): Array<BlankDocumentKind> {
    return store.state.kinds;
  },
  icons(): BlankDocumentIcons {
    return store.state.icons;
  },
  async refresh(): Promise<void> {
    const result = await window.pond.query("saves.listBlankDocuments", {});
    store.setState(() => ({
      kinds: result.kinds ?? [],
      icons: result.icons ?? {},
    }));
  },
};

export function useBlankDocuments(): BlankDocumentsState {
  return useSelector(store, (state) => state);
}
