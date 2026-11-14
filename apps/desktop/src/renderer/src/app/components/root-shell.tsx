import { Outlet, useRouterState } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { SaveDetails } from "@/app/components/save-details";
import { Toolbar } from "@/app/components/toolbar";
import { Tray } from "@/app/components/tray";
import { AppHotkeys } from "@/app/effects/app-hotkeys";
import { EditableHotkeyGuard } from "@/app/effects/editable-hotkey-guard";
import { MenuBridge } from "@/app/effects/menu-bridge";
import { UndoRedoBridge } from "@/app/effects/undo-redo-bridge";
import { useDownloadDialog } from "@/features/downloads/state/download-dialog";
import { fishIdFromPath } from "@/features/fish";
import { FolderSidebar } from "@/features/library/components/folder-sidebar";
import { selectLibraryNav } from "@/features/library/components/folder-sidebar/navigation";
import { NewMenuDialogHost } from "@/features/library/components/new-menu";
import { OrganizationRenameDialogHost } from "@/features/library/components/organization-rename-dialog";
import { AppShell } from "@/features/library/components/workspace-shell";
import { enterFolder } from "@/features/library/operations/enter-folder";
import { savedViews } from "@/features/library/state/saved-views";
import { DuplicateImportReviewHost } from "@/features/saves/components/duplicate-import-review";
import { SnoozeDialogHost } from "@/features/saves/components/snooze-dialog";
import { SaveTagPickerHost } from "@/features/saves/components/tag-picker-host";
import { SaveHotkeys } from "@/features/saves/effects/save-hotkeys";
import { ViewerPreload } from "@/features/saves/effects/viewer-preload";
import { isSaveCollectionPath } from "@/features/saves/lib/list-path";
import { openSave, saveIdFromPath } from "@/features/saves/lib/save-nav";
import { SourceFlowHost } from "@/features/sources/components/flow";
import { SourceDetailSidebar } from "@/features/sources/components/inspector";
import {
  parseSourceDetailPath,
  SourceDetailsPageSchema,
} from "@/features/sources/state/source-detail";
import { getAppRouter } from "@/shared/lib/app-router";
import { settingsHref } from "@/shared/lib/open-settings";

const FishDetails = lazy(() =>
  import("@/app/components/fish-details").then((module) => ({
    default: module.FishDetails,
  })),
);

const SettingsSidebar = lazy(() =>
  import("@/features/settings/components/sidebar").then((module) => ({
    default: module.SettingsSidebar,
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

export function RootShell() {
  const isSettings = useRouterState({
    select: (state) => state.location.pathname.startsWith("/settings"),
  });
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const detailPage = useRouterState({
    select: (state) =>
      SourceDetailsPageSchema.safeParse(state.location.search.page).data,
  });
  const sourceDetail = parseSourceDetailPath(pathname, detailPage);
  const viewingFish = fishIdFromPath(pathname) !== null;
  const viewingLibrary = isSaveCollectionPath(pathname);
  useEffect(() => {
    return window.pond.onNavigate((path) => {
      const pathname = path.split("?")[0] ?? "";
      const search = path.includes("?") ? path.slice(path.indexOf("?")) : "";
      const params = new URLSearchParams(search);
      const folderId = params.get("folder");
      const viewId = params.get("view");
      if (pathname === "/" && folderId) {
        enterFolder(folderId);
        return;
      }
      if (pathname === "/" && params.has("inbox")) {
        selectLibraryNav({ kind: "inbox" });
        return;
      }
      if (pathname === "/" && viewId) {
        savedViews.select(viewId);
        getAppRouter()?.history.push("/");
        return;
      }
      if (pathname === "/settings") {
        getAppRouter()?.history.push(settingsHref());
        return;
      }
      const saveId = saveIdFromPath(pathname);
      if (saveId) {
        openSave(saveId);
        return;
      }
      getAppRouter()?.history.push(pathname);
    });
  }, []);

  return (
    <>
      <EditableHotkeyGuard />
      <UndoRedoBridge />
      <MenuBridge />
      <SaveHotkeys />
      <ViewerPreload />
      <AppHotkeys />
      <NewMenuDialogHost />
      <OrganizationRenameDialogHost />
      <DuplicateImportReviewHost />
      <SaveTagPickerHost />
      <SnoozeDialogHost />
      <AppShell.Root
        header={<Toolbar />}
        right={
          viewingFish ? (
            <Suspense fallback={null}>
              <FishDetails />
            </Suspense>
          ) : (
            <SaveDetails />
          )
        }
        rightOpen={
          viewingFish || viewingLibrary || saveIdFromPath(pathname) !== null
        }
        left={
          isSettings ? (
            <Suspense fallback={null}>
              <SettingsSidebar />
            </Suspense>
          ) : sourceDetail ? (
            <SourceDetailSidebar
              key={`${sourceDetail.kind}:${sourceDetail.id}`}
              {...sourceDetail}
            />
          ) : (
            <FolderSidebar />
          )
        }
      >
        <Outlet />
      </AppShell.Root>
      <Tray.Library />
      <SourceFlowHost />
      <DownloadDialogSlot />
    </>
  );
}
