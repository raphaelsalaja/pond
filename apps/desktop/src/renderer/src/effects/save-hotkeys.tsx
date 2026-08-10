import { useHotkeys } from "@tanstack/react-hotkeys";
import { useSelector } from "@tanstack/react-store";
import {
  copyableImageIndex,
  copyPrimaryMedia,
  copyTags,
  copyUrl,
  exportFile,
  openDefaultApp,
  pasteTags,
  purgeForever,
  refreshSaveMetadata,
  resolveFileIndex,
  trashSave,
  untrashSave,
} from "@/lib/save/actions";
import { trashSelection } from "@/lib/save/selection";
import { SHORTCUTS } from "@/lib/save/shortcuts";
import type { Save } from "@/lib/types";
import { pool } from "@/stores/pool";
import {
  primarySelectionStore,
  selection,
  useSelectionSize,
} from "@/stores/selection";
import { tumbleToTrash } from "@/stores/trash-tumble";

function primarySave(): Save | null {
  const id = primarySelectionStore.state.id;
  return id ? (pool.get(id) ?? null) : null;
}

function withPrimary(action: (save: Save) => void): () => void {
  return () => {
    const save = primarySave();
    if (save) action(save);
  };
}

function canCopyPrimaryMedia(save: Save): boolean {
  return copyableImageIndex(save) != null || resolveFileIndex(save) != null;
}

/** Binds the shortcuts advertised in the save menus; `enabled` gates on selection state so unbound keys pass through untouched. */
export function SaveHotkeys() {
  const hasPrimary = useSelector(primarySelectionStore, (s) => s.id) != null;
  const hasMulti = useSelectionSize() > 0;

  useHotkeys([
    {
      hotkey: SHORTCUTS["save.open"].keys,
      callback: withPrimary((save) => void openDefaultApp(save)),
      options: { enabled: hasPrimary },
    },
    {
      /** Ordinary text copy must keep working: never preventDefault when text is selected or the target is editable. */
      hotkey: SHORTCUTS["save.copy-image"].keys,
      callback: (event) => {
        const save = primarySave();
        if (!save || !canCopyPrimaryMedia(save)) return;
        const textSelection = window.getSelection();
        if (textSelection && !textSelection.isCollapsed) return;
        event.preventDefault();
        void copyPrimaryMedia(save);
      },
      options: {
        enabled: hasPrimary,
        ignoreInputs: true,
        preventDefault: false,
      },
    },
    {
      hotkey: SHORTCUTS["save.copy-url"].keys,
      callback: withPrimary((save) => {
        if (save.url) void copyUrl(save.url);
      }),
      options: { enabled: hasPrimary, ignoreInputs: true },
    },
    {
      hotkey: SHORTCUTS["save.copy-tags"].keys,
      callback: withPrimary((save) => copyTags(save)),
      options: { enabled: hasPrimary, ignoreInputs: true },
    },
    {
      hotkey: SHORTCUTS["save.paste-tags"].keys,
      callback: withPrimary((save) => void pasteTags(save)),
      options: { enabled: hasPrimary, ignoreInputs: true },
    },
    {
      hotkey: SHORTCUTS["save.export"].keys,
      callback: withPrimary((save) => void exportFile(save)),
      options: { enabled: hasPrimary, ignoreInputs: true },
    },
    {
      hotkey: SHORTCUTS["save.refresh"].keys,
      callback: withPrimary((save) => void refreshSaveMetadata(save)),
      options: { enabled: hasPrimary },
    },
    {
      /** Multi-selection wins so bulk trash matches the app menu's save.bulk-trash; a trashed primary restores instead, matching its menu. */
      hotkey: SHORTCUTS["save.trash"].keys,
      callback: () => {
        const ids = selection.snapshot();
        if (ids.length > 0) {
          void tumbleToTrash([...ids]).then(() => trashSelection(ids));
          return;
        }
        const save = primarySave();
        if (!save) return;
        if (save.deletedAt) void untrashSave(save);
        else void tumbleToTrash([save.id]).then(() => trashSave(save));
      },
      options: { enabled: hasPrimary || hasMulti },
    },
    {
      /** Mod+Backspace is delete-to-line-start in macOS text fields; never purge while typing. */
      hotkey: SHORTCUTS["save.delete-forever"].keys,
      callback: withPrimary((save) => void purgeForever(save)),
      options: { enabled: hasPrimary, ignoreInputs: true },
    },
  ]);

  return null;
}
