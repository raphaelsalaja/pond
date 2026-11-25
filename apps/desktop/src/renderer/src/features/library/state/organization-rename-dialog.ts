import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

export type OrganizationRenameKind = "folders" | "saved-views";

interface OrganizationRenameDialogState {
  id: string;
  kind: OrganizationRenameKind;
  initialIds?: Array<string>;
}

const store = new Store<OrganizationRenameDialogState | null>(null);

export function openOrganizationRenameDialog(
  kind: OrganizationRenameKind,
  initialId?: string | Array<string>,
): void {
  store.setState(() => ({
    id: crypto.randomUUID(),
    kind,
    initialIds: Array.isArray(initialId)
      ? initialId
      : initialId
        ? [initialId]
        : [],
  }));
}

export function closeOrganizationRenameDialog(): void {
  store.setState(() => null);
}

export function useOrganizationRenameDialog(): OrganizationRenameDialogState | null {
  return useSelector(store, (state) => state);
}
