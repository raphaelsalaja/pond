import { Window } from "@pond/ui";
import { Outlet } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { SaveDetails } from "@/app/components/save-details";
import { Toolbar } from "@/app/components/toolbar";
import { Tray } from "@/app/components/tray";
import { AppHotkeys } from "@/app/effects/app-hotkeys";
import { EditableHotkeyGuard } from "@/app/effects/editable-hotkey-guard";
import { MenuBridge } from "@/app/effects/menu-bridge";
import { UndoRedoBridge } from "@/app/effects/undo-redo-bridge";
import { useDownloadDialog } from "@/features/downloads/state/download-dialog";
import { CommandMenuHost } from "@/features/library/components/command-menu";
import {
  FolderRail,
  FolderSidebar,
} from "@/features/library/components/folder-sidebar";
import { FolderTemplateDialogHost } from "@/features/library/components/folder-template-dialog";
import { NewMenuDialogHost } from "@/features/library/components/new-menu";
import { OrganizationRenameDialogHost } from "@/features/library/components/organization-rename-dialog";
import { AppShell } from "@/features/library/components/workspace-shell";
import { detailsColumn } from "@/features/library/lib/details-column";
import {
  useShellDetails,
  useShellLayout,
} from "@/features/library/state/shell-layout";
import { DuplicateImportReviewHost } from "@/features/saves/components/duplicate-import-review";
import { SnoozeDialogHost } from "@/features/saves/components/snooze-dialog";
import { SaveTagPickerHost } from "@/features/saves/components/tag-picker-host";
import { ThumbnailViewerHost } from "@/features/saves/components/thumbnail-viewer";
import { SaveHotkeys } from "@/features/saves/effects/save-hotkeys";
import { ViewerPreload } from "@/features/saves/effects/viewer-preload";
import { openSave, useOpenSaveId } from "@/features/saves/lib/save-nav";
import { SourceFlowHost } from "@/features/sources/components/flow";
import { getAppHistory } from "@/shared/lib/app-router";
import { settingsHref } from "@/shared/lib/open-settings";
import { useRouteMeta } from "@/shared/lib/route-meta";

/** Main-process links still name a Save by path; the renderer opens it over the current route. */
const SAVE_PATH = /^\/save\/([^/]+)$/;

const FishDetails = lazy(() =>
  import("@/app/components/fish-details").then((module) => ({
    default: module.FishDetails,
  })),
);

const DownloadDialogHost = lazy(() =>
  import("@/features/downloads/components/download-dialog").then((module) => ({
    default: module.DownloadDialogHost,
  })),
);

/** The trim editor is heavy, so it loads the first time the dialog opens. */
function DownloadDialogSlot() {
  const { open } = useDownloadDialog();
  const [loaded, setLoaded] = useState(open);
  if (open && !loaded) setLoaded(true);
  if (!loaded) return null;
  return (
    <Suspense fallback={null}>
      <DownloadDialogHost />
    </Suspense>
  );
}

/** Mounts before the window so its key guards register ahead of any page listener. */
function AppHosts() {
  const { surface } = useRouteMeta();
  const saveOpen = useOpenSaveId() !== null;
  const { details, rightOpen } = useShellLayout();
  const previewsDetails =
    rightOpen &&
    detailsColumn(details, saveOpen) === "save" &&
    (surface === "grid" || saveOpen);
  return (
    <>
      <EditableHotkeyGuard />
      <UndoRedoBridge />
      <MenuBridge />
      <SaveHotkeys />
      <ViewerPreload details={previewsDetails} />
      <AppHotkeys />
      <NewMenuDialogHost />
      <OrganizationRenameDialogHost />
      <FolderTemplateDialogHost />
      <DuplicateImportReviewHost />
      <SaveTagPickerHost />
      <SnoozeDialogHost />
      <ThumbnailViewerHost />
      <CommandMenuHost />
    </>
  );
}

function useMainProcessNavigation() {
  useEffect(() => {
    return window.pond.onNavigate((path) => {
      const pathname = path.split("?")[0] ?? "";
      const saveId = SAVE_PATH.exec(pathname)?.[1];
      if (saveId) {
        openSave(decodeURIComponent(saveId));
        return;
      }
      getAppHistory()?.push(pathname === "/settings" ? settingsHref() : path);
    });
  }, []);
}

export function RootShell() {
  const details = useShellDetails();
  const saveOpen = useOpenSaveId() !== null;
  const column = detailsColumn(details, saveOpen);
  useMainProcessNavigation();

  return (
    <>
      <AppHosts />
      <AppShell.Root>
        <Toolbar.Root />
        <AppShell.Rail>
          <FolderRail />
        </AppShell.Rail>
        <Window.Panes>
          <AppShell.Sidebar>
            <FolderSidebar />
          </AppShell.Sidebar>
          <Window.Center>
            <Outlet />
          </Window.Center>
          <AppShell.Details>
            {column === "fish" ? (
              <Suspense fallback={null}>
                <FishDetails />
              </Suspense>
            ) : (
              <SaveDetails />
            )}
          </AppShell.Details>
        </Window.Panes>
      </AppShell.Root>
      <Tray.Library />
      <SourceFlowHost />
      <DownloadDialogSlot />
    </>
  );
}
