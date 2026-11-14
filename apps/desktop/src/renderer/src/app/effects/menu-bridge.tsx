import { isSource } from "@pond/schema/sources";
import { Dialog } from "@pond/ui";
import { isBlankDocumentKind } from "@shared/blank-documents";
import { DEFAULT_FISH_ID } from "@shared/fish-contracts";
import { useEffect } from "react";
import { downloadDialog } from "@/features/downloads";
import { fishPath } from "@/features/fish";
import { selectLibraryNav } from "@/features/library/components/folder-sidebar/navigation";
import {
  createBlankDocument,
  createNote,
  findDuplicates,
  importBookmarks,
  importClipboard,
  importDataExport,
  importEagle,
  importFilePaths,
  importMymind,
  importPageAssets,
  importPaths,
  importPondPackage,
  newFolder,
  newSmartFolder,
  newSource,
  newTag,
  rescanLibrary,
  runNewAction,
  verifyIntegrity,
} from "@/features/library/components/new-menu/actions";
import {
  backupLibrary,
  createLibrary,
  mergeLibrary,
  moveLibrary,
  openLibrary,
  restoreLibrary,
} from "@/features/library/lib/library-location";
import { isLayoutValue } from "@/features/library/lib/view-prefs";
import { ZOOM_DEFAULT } from "@/features/library/lib/zoom";
import { commandMenu } from "@/features/library/state/command-menu";
import { libraryChrome } from "@/features/library/state/library-chrome";
import { newMenuDialog } from "@/features/library/state/new-menu-dialog";
import {
  adjustZoom,
  cycleLayout,
  resetFilters,
  setLayout,
  setZoom,
} from "@/features/library/state/view-store";
import {
  copyId,
  copyPrimaryMedia,
  copyUrl,
  focusPaneTitle,
  openDefaultApp,
  openTagPicker,
  purgeForever,
  refreshSaveMetadata,
  trashSave,
  untrashSave,
} from "@/features/saves/lib/actions";
import { confirmEmptyTrash } from "@/features/saves/lib/empty-trash";
import { trashSelection } from "@/features/saves/lib/selection";
import { inspect } from "@/features/saves/state/inspect";
import { pool } from "@/features/saves/state/pool";
import { primarySelection, selection } from "@/features/saves/state/selection";
import { tumbleToTrash } from "@/features/saves/state/trash-tumble";
import { CONNECTABLE, WATCH_MENU_SOURCES } from "@/features/sources/lib/create";
import { openSources } from "@/features/sources/lib/open";
import { pickWatchedFolder } from "@/features/sources/lib/watched-folder";
import { getAppRouter } from "@/shared/lib/app-router";
import { openSettings } from "@/shared/lib/open-settings";
import { usePrefs } from "@/shared/state/prefs";
import {
  handleNativeMenuAction,
  shouldIgnoreMenuAction,
} from "./native-menu-actions";

export function MenuBridge() {
  const [, patchPreferences] = usePrefs("preferences");
  const [, patchSaveRecents] = usePrefs("saveRecents");

  useEffect(
    () =>
      window.pond.onOpenFiles(
        (paths) => void runNewAction(() => importFilePaths(paths)),
      ),
    [],
  );

  useEffect(() => {
    return window.pond.onMenuAction(({ id, source }) => {
      if (shouldIgnoreMenuAction(source, id)) return;
      if (handleNativeMenuAction(id)) return;
      if (id.startsWith("library.new-blank-")) {
        const kind = id.slice("library.new-blank-".length);
        if (isBlankDocumentKind(kind)) {
          void runNewAction(() => createBlankDocument(kind));
        }
        return;
      }
      if (id.startsWith("library.connect-")) {
        const source = id.slice("library.connect-".length);
        if (isSource(source) && CONNECTABLE.includes(source)) {
          newSource("connect", source);
        }
        return;
      }
      if (id.startsWith("library.watch-")) {
        const source = id.slice("library.watch-".length);
        if (isSource(source) && WATCH_MENU_SOURCES.includes(source)) {
          newSource("watch", source);
        }
        return;
      }
      switch (id) {
        case "history.back":
          getAppRouter()?.history.back();
          return;

        case "history.forward":
          getAppRouter()?.history.forward();
          return;

        case "history.clear":
          patchSaveRecents({ entries: [] });
          return;

        case "view.inspector.toggle":
          libraryChrome.toggleDetails();
          return;

        case "view.layout.cycle":
          cycleLayout();
          return;

        case "view.zoom-in":
          adjustZoom(20);
          return;

        case "view.zoom-out":
          adjustZoom(-20);
          return;

        case "view.zoom-reset":
          setZoom(ZOOM_DEFAULT);
          return;

        case "library.search":
          commandMenu.open();
          return;

        case "nav.library":
          resetFilters();
          selectLibraryNav({ kind: "all" });
          return;

        case "nav.inbox":
          selectLibraryNav({ kind: "inbox" });
          return;

        case "nav.uncategorized":
          selectLibraryNav({ kind: "uncategorized" });
          return;

        case "nav.untagged":
          selectLibraryNav({ kind: "untagged" });
          return;

        case "nav.sources":
          selectLibraryNav({ kind: "sources" });
          return;

        case "nav.downloads":
          selectLibraryNav({ kind: "downloads" });
          return;

        case "nav.tags":
          selectLibraryNav({ kind: "tags" });
          return;

        case "nav.agent":
          getAppRouter()?.history.push(fishPath(DEFAULT_FISH_ID));
          return;

        case "nav.trash":
          selectLibraryNav({ kind: "trash" });
          return;

        case "nav.settings":
          openSettings();
          return;

        case "view.layout.waterfall":
        case "view.layout.grid":
        case "view.layout.justified":
        case "view.layout.list": {
          const next = id.slice("view.layout.".length);
          if (isLayoutValue(next)) setLayout(next);
          return;
        }

        case "library.connect":
        case "library.watch":
          openSources({ type: "new-source" });
          return;

        case "view.sidebar.toggle":
          libraryChrome.toggleSidebar();
          return;

        case "view.grayscale":
          inspect.toggleGrayscale();
          return;

        case "theme.light":
          patchPreferences({
            appearance: "light",
          });
          return;

        case "theme.dark":
          patchPreferences({
            appearance: "dark",
          });
          return;

        case "theme.system":
          patchPreferences({ appearance: "system" });
          return;

        case "refresh.all":
          void window.pond.refreshBackfillStart({});
          return;

        case "refresh.cancel":
          void window.pond.refreshBackfillCancel();
          return;

        case "trash.empty":
          confirmEmptyTrash();
          return;

        case "trash.restore-all":
          void window.pond.query("saves.restoreAll", {});
          return;

        case "library.move":
          Dialog.confirm({
            title: "Move Library",
            description:
              "Pond will verify the new copy before removing the library from its current location.",
            confirmLabel: "Move",
            onConfirm: moveLibrary,
          });
          return;

        case "library.new":
          void createLibrary();
          return;

        case "library.open":
          void openLibrary();
          return;

        case "library.backup":
          void backupLibrary();
          return;

        case "library.restore":
          void restoreLibrary();
          return;

        case "library.merge":
          void mergeLibrary();
          return;

        case "library.new-folder":
          newFolder();
          return;

        case "library.new-smart-folder":
          newSmartFolder();
          return;

        case "library.new-note":
          void runNewAction(createNote);
          return;

        case "library.new-tag":
          newTag("tag");
          return;

        case "library.new-tag-group":
          newTag("tag-group");
          return;

        case "library.import-files":
          void runNewAction(() => importPaths("files"));
          return;

        case "library.import-folders":
          void runNewAction(() => importPaths("folders"));
          return;

        case "library.import-links":
          newMenuDialog.open({ kind: "links" });
          return;

        case "library.download":
          downloadDialog.open();
          return;

        case "library.import-clipboard":
          void runNewAction(importClipboard);
          return;

        case "library.import-bookmarks":
          void runNewAction(importBookmarks);
          return;

        case "library.import-mymind":
          void runNewAction(importMymind);
          return;

        case "library.import-data-export":
          void runNewAction(importDataExport);
          return;

        case "library.import-page-assets":
          Dialog.prompt({
            title: "Import Page Assets",
            description:
              "Pond saves the images and files from the page you enter.",
            confirmLabel: "Import",
            placeholder: "https://",
            emptyError: "Enter a page link to import.",
            onConfirm: (url) => void runNewAction(() => importPageAssets(url)),
          });
          return;

        case "library.import-eagle":
          void runNewAction(importEagle);
          return;

        case "library.import-package":
          void runNewAction(importPondPackage);
          return;

        case "library.auto-import-folder":
          void runNewAction(pickWatchedFolder);
          return;

        case "library.find-duplicates-all":
          findDuplicates("all");
          return;

        case "library.find-duplicates-list":
          findDuplicates("list");
          return;

        case "library.find-duplicates-selected":
          findDuplicates("selected");
          return;

        case "library.rescan":
          void runNewAction(rescanLibrary);
          return;

        case "library.verify-integrity":
          void runNewAction(verifyIntegrity);
          return;

        case "save.open-with-default": {
          const save = currentSave();
          if (!save) return;
          void openDefaultApp(save);
          return;
        }

        case "save.open-original": {
          const save = currentSave();
          if (!save?.url) return;
          void window.pond.openExternal(save.url);
          return;
        }

        case "save.reveal": {
          const sid = primarySelection.get();
          if (!sid) return;
          void window.pond.revealSave(sid);
          return;
        }

        case "save.copy-url": {
          const save = currentSave();
          if (!save?.url) return;
          void copyUrl(save.url);
          return;
        }

        case "save.copy-media": {
          const save = currentSave();
          if (!save) return;
          void copyPrimaryMedia(save);
          return;
        }

        case "save.copy-id": {
          const sid = primarySelection.get();
          if (!sid) return;
          void copyId(sid);
          return;
        }

        case "save.rename": {
          const save = currentSave();
          if (save?.source !== "local") return;
          focusPaneTitle();
          return;
        }

        case "save.add-tag":
          if (!primarySelection.get()) return;
          openTagPicker();
          return;

        case "save.refresh": {
          const save = currentSave();
          if (!save) return;
          void refreshSaveMetadata(save);
          return;
        }

        case "save.trash": {
          const save = currentSave();
          if (!save) return;
          void tumbleToTrash([save.id]).then(() => trashSave(save));
          return;
        }

        case "save.untrash": {
          const save = currentSave();
          if (!save) return;
          void untrashSave(save);
          return;
        }

        case "save.delete-forever": {
          const save = currentSave();
          if (!save) return;
          void purgeForever(save);
          return;
        }

        case "save.bulk-trash": {
          const ids = selection.snapshot();
          if (ids.length === 0) return;
          void tumbleToTrash(ids).then(() => trashSelection(ids));
          return;
        }

        case "save.bulk-refresh": {
          const ids = selection.snapshot();
          if (ids.length === 0) return;
          void (async () => {
            for (const sid of ids) {
              await window.pond.refreshSave(sid);
            }
          })();
          return;
        }
      }
    });
  }, [patchPreferences, patchSaveRecents]);

  return null;
}

function currentSave() {
  const id = primarySelection.get();
  if (!id) return null;
  return pool.get(id) ?? null;
}
