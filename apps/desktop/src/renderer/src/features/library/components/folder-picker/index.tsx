import { Dialog } from "@pond/ui";
import { useSelector } from "@tanstack/react-store";
import { useEffect, useState } from "react";
import { recentFolderIds } from "@/features/library/lib/recent-folders";
import {
  closeFolderPicker,
  type FolderPickerState,
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
  RecentFolderMenu,
} from "@/features/saves";
import { usePrefs } from "@/shared/state/prefs";
import styles from "./styles.module.css";

const DIALOG_LABEL = {
  all: "Add to Folders",
  multiple: "Add to Multiple Folders",
  recent: "Add to Recent Folder",
} as const;

export function FolderPickerHost() {
  const state = useSelector(folderPickerStore, (value) => value);
  return state.ids.length ? (
    <FolderPicker
      ids={state.ids}
      mode={state.mode}
      key={`${state.mode}\n${state.ids.join("\n")}`}
    />
  ) : null;
}

function FolderPicker({ ids, mode: initialMode }: FolderPickerState) {
  const rows = useFolders();
  const memberships = useFolderMemberships();
  const [error, setError] = useState<string | null>(null);
  const [folderViews] = usePrefs("folderViews");
  const [mode, setMode] = useState(initialMode);
  const [staged, setStaged] = useState<ReadonlySet<string>>(() => new Set());
  const [applying, setApplying] = useState(false);
  const [recent] = useState(recentFolderIds);
  const items: FolderMenuItem[] = rows.map((folder) => ({
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    icon: folderViews[folder.id]?.icon,
    color: folder.color,
    count: ids.filter((id) => memberships[id]?.includes(folder.id)).length,
  }));
  const byId = new Map(items.map((item) => [item.id, item]));
  const recentItems = recent.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });

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

  function stopStaging() {
    if (initialMode === "multiple") closeFolderPicker();
    else {
      setStaged(new Set());
      setMode("all");
    }
  }

  function toggleStaged(folder: FolderMenuItem) {
    setStaged((current) => {
      const next = new Set(current);
      if (next.has(folder.id)) next.delete(folder.id);
      else next.add(folder.id);
      return next;
    });
  }

  function applyStaged() {
    if (!staged.size || applying) return;
    setApplying(true);
    void run(async () => {
      await changeSaveFolders({
        saveIds: ids,
        add: [...staged].map((id) => ({
          id,
          name: byId.get(id)?.name ?? "Folder",
        })),
        remove: [],
      });
      closeFolderPicker();
    }).finally(() => setApplying(false));
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open, details) => {
        if (open) return;
        if (details.reason === "escape-key" && mode === "multiple") {
          details.cancel();
          stopStaging();
          return;
        }
        closeFolderPicker();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup} aria-label={DIALOG_LABEL[mode]}>
          {mode === "recent" ? (
            <RecentFolderMenu
              folders={recentItems}
              selectionSize={ids.length}
              onPick={(folder) =>
                void run(async () => {
                  await assign(folder, true);
                  closeFolderPicker();
                })
              }
              onShowAll={() => setMode("all")}
            />
          ) : (
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
                  if (mode !== "multiple") {
                    await assign(created, true);
                    return;
                  }
                  await folders.refresh();
                  setStaged((current) => new Set(current).add(created.id));
                })
              }
              onStartBatch={() => setMode("multiple")}
              batch={
                mode === "multiple"
                  ? {
                      staged,
                      applying,
                      onToggle: toggleStaged,
                      onApply: applyStaged,
                      onCancel: stopStaging,
                    }
                  : undefined
              }
            />
          )}
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
