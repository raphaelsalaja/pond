import { Dialog } from "@pond/ui";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { useSelector } from "@tanstack/react-store";
import { useRef } from "react";
import {
  copyableImageIndex,
  copyId,
  copyPrimaryMedia,
  copyTags,
  copyUrl,
  exportFile,
  focusPaneTitle,
  openDefaultApp,
  openTagPicker,
  pasteTags,
  purgeForever,
  refreshSaveMetadata,
  resolveFileIndex,
  trashSave,
  untrashSave,
} from "@/features/saves/lib/actions";
import { ensureSaves } from "@/features/saves/lib/ensure-saves";
import { addSavesToLastUsedFolder } from "@/features/saves/lib/folder-actions";
import {
  markProcessed,
  waitingInInbox,
} from "@/features/saves/lib/inbox-actions";
import { saveOwnsKeyboard } from "@/features/saves/lib/keyboard-owner";
import { saveLibraryBridge } from "@/features/saves/lib/library-bridge";
import { rateSaves } from "@/features/saves/lib/rating";
import { openSave, saveIdFromPath } from "@/features/saves/lib/save-nav";
import { selectOnlySave } from "@/features/saves/lib/select";
import {
  copyFilesForSelection,
  copyIdsForSelection,
  copyTagsForSelection,
  copyUrlsForSelection,
  deleteSelectionForever,
  exportSelectionFiles,
  openDefaultAppForSelection,
  openInBrowserForSelection,
  pasteTagsForSelection,
  refreshDetailsForSelection,
  revealFilesForSelection,
  type SelectionActionResult,
  trashSelection,
} from "@/features/saves/lib/selection";
import {
  splitIntoSaves,
  splitTargetIds,
} from "@/features/saves/lib/split-save";
import { pool } from "@/features/saves/state/pool";
import { resultNavigation } from "@/features/saves/state/result-navigation";
import {
  primarySelectionStore,
  selection,
  useSelectionSize,
} from "@/features/saves/state/selection";
import { openSnoozeDialog } from "@/features/saves/state/snooze-dialog";
import { tumbleToTrash } from "@/features/saves/state/trash-tumble";
import type { Save } from "@/features/saves/types";
import { getAppRouter } from "@/shared/lib/app-router";
import { appHotkeyBlockedByEditable } from "@/shared/lib/editable-target";
import {
  bindingKeys,
  RATING_COMMANDS,
  useShortcutBindings,
} from "@/shared/lib/shortcuts";
import { notify } from "@/shared/lib/toast";

function primarySave(): Save | null {
  const id = primarySelectionStore.state.id;
  return id ? (pool.get(id) ?? null) : null;
}

function withSelection(
  single: (save: Save) => void,
  multiple: (
    ids: readonly string[],
  ) => void | Promise<void> | Promise<SelectionActionResult>,
): () => void {
  return () => {
    const ids = selection.snapshot();
    if (ids.length > 1) {
      void Promise.resolve(multiple(ids)).catch(() =>
        notify({
          id: "selection-error",
          title: "Couldn't complete the selection command",
          description: "Try again.",
        }),
      );
      return;
    }
    const save = primarySave();
    if (save) single(save);
  };
}

/** The viewer moves the primary Save without clearing the grid selection, so one selected id may be stale. */
function targetIds(): readonly string[] {
  const selected = selection.snapshot();
  const primary = primarySelectionStore.state.id;
  if (selected.length > 1) return selected;
  return primary ? [primary] : [];
}

function canCopyPrimaryMedia(save: Save): boolean {
  return copyableImageIndex(save) != null || resolveFileIndex(save) != null;
}

export function SaveHotkeys() {
  const shortcuts = useShortcutBindings();
  const hasPrimary = useSelector(primarySelectionStore, (s) => s.id != null);
  const hasMulti = useSelectionSize() > 0;
  const ratingQueue = useRef(Promise.resolve());
  const rate = (rating: number, advance: boolean) => {
    ratingQueue.current = ratingQueue.current
      .then(async () => {
        const primary = primarySelectionStore.state.id;
        const selected = selection.snapshot();
        const ids = selected.length ? selected : primary ? [primary] : [];
        if (!ids.length || (advance && ids.length > 1)) return;
        const current = ids[0];
        const next =
          advance && current ? await resultNavigation.next(current, 1) : null;
        await rateSaves(ids, rating);
        if (!next || primarySelectionStore.state.id !== primary) return;
        await ensureSaves([next]);
        if (primarySelectionStore.state.id !== primary) return;
        const detail =
          saveIdFromPath(getAppRouter()?.state.location.pathname ?? "") !==
          null;
        selectOnlySave(next);
        if (detail) openSave(next);
        else await resultNavigation.reveal(next);
      })
      .catch(() => {
        notify({
          id: "rating-error",
          title: "Couldn't update the rating",
          description: "Try again.",
        });
      });
  };

  useHotkeys(
    [
      {
        hotkey: bindingKeys(shortcuts, "save.assign-folders"),
        callback: () => {
          const selected = selection.snapshot();
          const primary = primarySelectionStore.state.id;
          saveLibraryBridge.openFolderPicker(
            selected.length ? selected : primary ? [primary] : [],
          );
        },
        options: { enabled: hasPrimary || hasMulti, ignoreInputs: true },
      },
      {
        hotkey: bindingKeys(shortcuts, "save.add-to-last-folder"),
        callback: () => {
          const selected = selection.snapshot();
          const primary = primarySelectionStore.state.id;
          void addSavesToLastUsedFolder(
            selected.length ? selected : primary ? [primary] : [],
          );
        },
        options: { enabled: hasPrimary || hasMulti, ignoreInputs: true },
      },
      ...RATING_COMMANDS.flatMap((command) => [
        {
          hotkey: bindingKeys(shortcuts, command.id),
          callback: () => rate(command.rating, false),
          options: { enabled: hasPrimary || hasMulti, ignoreInputs: true },
        },
        {
          hotkey: bindingKeys(shortcuts, command.nextId),
          callback: () => rate(command.rating, true),
          options: { enabled: hasPrimary, ignoreInputs: true },
        },
      ]),
      {
        hotkey: bindingKeys(shortcuts, "save.open"),
        callback: withSelection(
          (save) => void openDefaultApp(save),
          openDefaultAppForSelection,
        ),
        options: { enabled: hasPrimary, ignoreInputs: true },
      },
      {
        hotkey: bindingKeys(shortcuts, "save.copy-image"),
        callback: (event: KeyboardEvent) => {
          const textSelection = window.getSelection();
          if (textSelection && !textSelection.isCollapsed) return;
          const ids = selection.snapshot();
          if (ids.length > 1) {
            event.preventDefault();
            void copyFilesForSelection(ids);
            return;
          }
          const save = primarySave();
          if (!save || !canCopyPrimaryMedia(save)) return;
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
        hotkey: bindingKeys(shortcuts, "save.copy-url"),
        callback: withSelection((save) => {
          if (save.url) void copyUrl(save.url);
        }, copyUrlsForSelection),
        options: { enabled: hasPrimary, ignoreInputs: true },
      },
      {
        hotkey: bindingKeys(shortcuts, "save.copy-id"),
        callback: () => {
          const ids = selection.snapshot();
          if (ids.length > 1) {
            void copyIdsForSelection(ids);
            return;
          }
          const id = primarySelectionStore.state.id;
          if (id) void copyId(id);
        },
        options: { enabled: hasPrimary, ignoreInputs: true },
      },
      {
        hotkey: bindingKeys(shortcuts, "save.copy-tags"),
        callback: withSelection((save) => copyTags(save), copyTagsForSelection),
        options: { enabled: hasPrimary, ignoreInputs: true },
      },
      {
        hotkey: bindingKeys(shortcuts, "save.paste-tags"),
        callback: withSelection(
          (save) => void pasteTags(save),
          pasteTagsForSelection,
        ),
        options: { enabled: hasPrimary, ignoreInputs: true },
      },
      {
        hotkey: bindingKeys(shortcuts, "save.export"),
        callback: withSelection(
          (save) => void exportFile(save),
          exportSelectionFiles,
        ),
        options: { enabled: hasPrimary, ignoreInputs: true },
      },
      {
        hotkey: bindingKeys(shortcuts, "save.refresh"),
        callback: withSelection(
          (save) => void refreshSaveMetadata(save),
          refreshDetailsForSelection,
        ),
        options: { enabled: hasPrimary, ignoreInputs: true },
      },
      {
        hotkey: bindingKeys(shortcuts, "save.split"),
        callback: (event: KeyboardEvent) => {
          const ids = splitTargetIds(
            selection.snapshot(),
            primarySelectionStore.state.id,
            (id) => pool.get(id),
          );
          if (ids.length === 0) return;
          event.preventDefault();
          splitIntoSaves(ids);
        },
        options: {
          enabled: hasPrimary || hasMulti,
          ignoreInputs: true,
          preventDefault: false,
        },
      },
      {
        hotkey: bindingKeys(shortcuts, "save.add-tag"),
        callback: () => {
          const ids = selection.snapshot();
          if (ids.length === 0 && !primarySelectionStore.state.id) return;
          openTagPicker();
        },
        options: { enabled: hasPrimary || hasMulti, ignoreInputs: true },
      },
      {
        hotkey: bindingKeys(shortcuts, "save.rename"),
        callback: withSelection(
          (save) => {
            if (save.source !== "local") return;
            focusPaneTitle();
          },
          (ids) => saveLibraryBridge.openRename(ids),
        ),
        options: { enabled: hasPrimary, ignoreInputs: true },
      },
      {
        hotkey: bindingKeys(shortcuts, "save.open-url"),
        callback: withSelection((save) => {
          if (!save.url) return;
          void window.pond.openExternal(save.url);
        }, openInBrowserForSelection),
        options: { enabled: hasPrimary, ignoreInputs: true },
      },
      {
        hotkey: bindingKeys(shortcuts, "save.reveal"),
        callback: () => {
          const ids = selection.snapshot();
          if (ids.length > 1) {
            void revealFilesForSelection(ids);
            return;
          }
          const sid = primarySelectionStore.state.id;
          if (!sid) return;
          void window.pond.revealSave(sid);
        },
        options: { enabled: hasPrimary, ignoreInputs: true },
      },
      {
        hotkey: bindingKeys(shortcuts, "selection.export"),
        callback: withSelection(
          (save) => void exportFile(save),
          exportSelectionFiles,
        ),
        options: { enabled: hasPrimary || hasMulti, ignoreInputs: true },
      },
      {
        hotkey: bindingKeys(shortcuts, "save.mark-processed"),
        callback: () => void markProcessed(waitingInInbox(targetIds())),
        options: { enabled: hasPrimary || hasMulti, ignoreInputs: true },
      },
      {
        hotkey: bindingKeys(shortcuts, "save.snooze"),
        callback: () => {
          const ids = waitingInInbox(targetIds());
          if (ids.length > 0) openSnoozeDialog(ids);
        },
        options: { enabled: hasPrimary || hasMulti, ignoreInputs: true },
      },
      {
        hotkey: bindingKeys(shortcuts, "save.trash"),
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
        options: { enabled: hasPrimary || hasMulti, ignoreInputs: true },
      },
      {
        /** Mod+Backspace is delete-to-line-start in macOS text fields; never purge while typing. */
        hotkey: bindingKeys(shortcuts, "save.delete-forever"),
        callback: withSelection(
          (save) => void purgeForever(save),
          (ids) =>
            Dialog.confirm({
              title: "Delete Forever",
              description: `${ids.length === 1 ? "This save and its file are" : `${ids.length} saves and their files are`} deleted. This cannot be undone.`,
              confirmLabel: "Delete",
              onConfirm: () => deleteSelectionForever(ids),
            }),
        ),
        options: { enabled: hasPrimary, ignoreInputs: true },
      },
    ].map((binding) => ({
      ...binding,
      callback: (event: KeyboardEvent) => {
        if (appHotkeyBlockedByEditable(event)) return;
        if (!saveOwnsKeyboard(event)) return;
        if (
          !("preventDefault" in binding.options) ||
          binding.options.preventDefault !== false
        )
          event.preventDefault();
        binding.callback(event);
      },
      options: { ...binding.options, preventDefault: false },
    })),
    { ignoreInputs: true },
  );

  return null;
}
