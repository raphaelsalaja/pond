import {
  DEFAULT_SYSTEM_DARK_ID,
  DEFAULT_SYSTEM_LIGHT_ID,
} from "@pond/schema/db";
import { useEffect } from "react";
import { openShortcutsSheet } from "@/components/shared/shortcuts-sheet";
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
} from "@/lib/save/actions";
import { confirmEmptyTrash } from "@/lib/save/empty-trash";
import { trashSelection } from "@/lib/save/selection";
import { getAppRouter } from "@/lib/ui/app-router";
import { openLibrarySearch } from "@/lib/ui/open-search";
import { closeSave, openSave, saveIdFromPath } from "@/lib/ui/save-nav";
import type { LayoutValue } from "@/lib/ui/view-prefs";
import { ZOOM_DEFAULT } from "@/lib/ui/zoom";
import { dockMode } from "@/stores/dock-mode";
import { pool } from "@/stores/pool";
import { usePrefs } from "@/stores/prefs";
import { primarySelection, selection } from "@/stores/selection";
import { tumbleToTrash } from "@/stores/trash-tumble";
import {
  adjustZoom,
  cycleLayout,
  setLayout,
  setZoom,
} from "@/stores/view-store";

export function MenuBridge() {
  const [, patchPreferences] = usePrefs("preferences");

  useEffect(() => {
    return window.pond.onMenuAction((id) => {
      switch (id) {
        case "history.back":
          getAppRouter()?.history.back();
          return;

        case "history.forward":
          getAppRouter()?.history.forward();
          return;

        case "view.inspector.toggle": {
          const router = getAppRouter();
          const openId =
            primarySelection.get() ??
            (router ? saveIdFromPath(router.state.location.pathname) : null);
          if (openId) {
            closeSave();
          } else {
            const anchor = selection.getAnchor();
            if (anchor) openSave(anchor);
          }
          return;
        }

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

        case "help.shortcuts":
          openShortcutsSheet();
          return;

        case "dock.ask":
          dockMode.open("ask");
          return;

        case "dock.search":
          openLibrarySearch();
          return;

        case "view.layout.waterfall":
        case "view.layout.grid":
        case "view.layout.justified":
        case "view.layout.list":
          setLayout(id.slice("view.layout.".length) as LayoutValue);
          return;

        case "theme.light":
          patchPreferences({
            themeMode: "preset",
            presetId: DEFAULT_SYSTEM_LIGHT_ID,
          });
          return;

        case "theme.dark":
          patchPreferences({
            themeMode: "preset",
            presetId: DEFAULT_SYSTEM_DARK_ID,
          });
          return;

        case "theme.system":
          patchPreferences({ themeMode: "system" });
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
          void window.pond.query("library.move", {});
          return;

        case "developer.restart-api":
          void window.pond.query("api.restart", {});
          return;

        case "developer.open-logs":
          void window.pond.query("developer.openLogs", {});
          return;

        case "developer.ipc-inspector":
          void window.pond.query("developer.openIpcInspector", {});
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
  }, [patchPreferences]);

  return null;
}

function currentSave() {
  const id = primarySelection.get();
  if (!id) return null;
  return pool.get(id) ?? null;
}
