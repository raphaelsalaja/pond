import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

export type FolderTemplateDialogState =
  | { id: string; mode: "apply"; parentId: string | null }
  | { id: string; mode: "save"; folderId: string; folderName: string };

type FolderTemplateDialogRequest =
  | { mode: "apply"; parentId: string | null }
  | { mode: "save"; folderId: string; folderName: string };

const store = new Store<FolderTemplateDialogState | null>(null);

export function openFolderTemplateDialog(
  request: FolderTemplateDialogRequest,
): void {
  store.setState(() => ({ id: crypto.randomUUID(), ...request }));
}

export function closeFolderTemplateDialog(): void {
  store.setState(() => null);
}

export function useFolderTemplateDialog(): FolderTemplateDialogState | null {
  return useSelector(store, (state) => state);
}
