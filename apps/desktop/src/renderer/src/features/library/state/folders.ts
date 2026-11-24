import type { Folder } from "@pond/schema/db";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { useEffect } from "react";

interface FoldersState {
  folders: Array<Folder>;
  bySave: Record<string, Array<string>>;
  editingId: string | null;
  loaded: boolean;
}

const store = new Store<FoldersState>({
  folders: [],
  bySave: {},
  editingId: null,
  loaded: false,
});

export const folders = {
  snapshot(): Array<Folder> {
    return store.state.folders;
  },
  forSave(saveId: string): Array<Folder> {
    const ids = store.state.bySave[saveId] ?? [];
    if (ids.length === 0) {
      return [];
    }
    const byId = new Map(
      store.state.folders.map((folder) => [folder.id, folder]),
    );
    return ids.flatMap((id) => {
      const folder = byId.get(id);
      return folder ? [folder] : [];
    });
  },
  startEditing(id: string): void {
    store.setState((state) => ({ ...state, editingId: id }));
  },
  finishEditing(id?: string): void {
    store.setState((state) => ({
      ...state,
      editingId:
        id === undefined || state.editingId === id ? null : state.editingId,
    }));
  },
  async refresh(): Promise<void> {
    const [folderRows, membershipRows] = await Promise.all([
      window.pond.query("folders.list", {}),
      window.pond.query("folders.memberships", {}),
    ]);
    const bySave: Record<string, Array<string>> = {};
    for (const row of membershipRows ?? []) {
      const list = bySave[row.saveId] ?? [];
      list.push(row.folderId);
      bySave[row.saveId] = list;
    }
    store.setState((state) => ({
      folders: folderRows ?? [],
      bySave,
      editingId:
        state.editingId &&
        (folderRows ?? []).some((folder) => folder.id === state.editingId)
          ? state.editingId
          : null,
      loaded: true,
    }));
  },
};

export function useFolders(): Array<Folder> {
  return useSelector(store, (s) => s.folders);
}

export function useFoldersLoaded(): boolean {
  return useSelector(store, (s) => s.loaded);
}

export function useFolderMemberships(): Record<string, Array<string>> {
  return useSelector(store, (s) => s.bySave);
}

export function useEditingFolderId(): string | null {
  return useSelector(store, (s) => s.editingId);
}

export function useHydrateFolders(): void {
  useEffect(() => {
    void folders.refresh();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = window.pond.onSyncAction((event) => {
      if (event.modelName !== "save_folder" && event.modelName !== "folder") {
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(() => void folders.refresh(), 16);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);
}
