import { Dialog } from "@pond/ui";
import { useSelector } from "@tanstack/react-store";
import { useEffect, useState } from "react";
import {
  closeFolderPicker,
  folderPickerStore,
} from "@/features/library/state/folder-picker";
import {
  folders,
  useFolderMemberships,
  useFolders,
} from "@/features/library/state/folders";
import {
  changeSaveFolders,
  FolderMenu,
  type FolderMenuItem,
} from "@/features/saves";
import { usePrefs } from "@/shared/state/prefs";
import styles from "./styles.module.css";

export function FolderPickerHost() {
  const ids = useSelector(folderPickerStore, (state) => state);
  return ids.length ? <FolderPicker ids={ids} key={ids.join("\n")} /> : null;
}

function FolderPicker({ ids }: { ids: readonly string[] }) {
  const rows = useFolders();
  const memberships = useFolderMemberships();
  const [error, setError] = useState<string | null>(null);
  const [folderViews] = usePrefs("folderViews");
  const items: FolderMenuItem[] = rows.map((folder) => ({
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    icon: folderViews[folder.id]?.icon,
    color: folder.color,
    count: ids.filter((id) => memberships[id]?.includes(folder.id)).length,
  }));

  useEffect(() => {
    void folders.refresh();
  }, []);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch {
      setError("Couldn't update folders. Try again.");
    }
  }

  async function assign(folder: { id: string; name: string }, add: boolean) {
    await changeSaveFolders({
      saveIds: ids,
      add: add ? [folder] : [],
      remove: add ? [] : [folder],
    });
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) closeFolderPicker();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup} aria-label="Add to Folders">
          <FolderMenu
            folders={items}
            selectionSize={ids.length}
            onToggle={(folder) =>
              run(() => assign(folder, folder.count !== ids.length))
            }
            onCreate={(name) =>
              run(async () => {
                const created = await window.pond.query("folders.create", {
                  name: name.trim(),
                });
                await assign(created, true);
              })
            }
          />
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
