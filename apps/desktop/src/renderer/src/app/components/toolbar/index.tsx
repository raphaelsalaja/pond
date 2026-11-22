import {
  IconAlbum2,
  IconCanvas,
  IconDots,
  IconGear3,
  IconHistory,
  IconLayers,
  IconNodes3,
  IconTag,
  IconTagSlash,
  IconTrashXmark,
  IconWindowDownload,
} from "@pond/icons";
import { Button, Menu } from "@pond/ui";
import { useRouter } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { ChromeHistoryNav } from "@/app/components/chrome-toolbar";
import { canvasIdFromPath, useCanvas } from "@/features/canvas";
import { fishIdFromPath } from "@/features/fish";
import { FolderCustomizeDialog } from "@/features/library/components/folder-customize-dialog";
import { NewMenu } from "@/features/library/components/new-menu";
import { SearchButton } from "@/features/library/components/search-button";
import { SidebarToggle } from "@/features/library/components/sidebar-toggle";
import {
  folderColorMenuItems,
  folderIconMenuItems,
} from "@/features/library/lib/folder-appearance-menu";
import { saveFolderPresentation } from "@/features/library/state/folder-presentation";
import { useFolders } from "@/features/library/state/folders";
import {
  libraryChrome,
  useDetailsOpen,
  useLibraryNav,
  useSidebarOpen,
} from "@/features/library/state/library-chrome";
import {
  resetFilters,
  useHasActiveSearch,
} from "@/features/library/state/view-store";
import { useSave } from "@/features/saves/hooks/use-saves";
import { getLastListPath } from "@/features/saves/lib/list-path";
import { saveIdFromPath } from "@/features/saves/lib/save-nav";
import { setViewerToolbarHost } from "@/features/saves/state/viewer-toolbar";
import { useViewFilteredCount } from "@/features/saves/state/view-context";
import { useSourceDetailName } from "@/features/sources/state/source-detail";
import { SpecContextMenu } from "@/shared/components/spec-context-menu";
import { useRouteLocation } from "@/shared/hooks/use-route-location";
import { usePrefs } from "@/shared/state/prefs";
import { type Breadcrumb, buildBreadcrumbs } from "./breadcrumbs";
import { computeLabel } from "./labels";
import styles from "./styles.module.css";

const FishChatActions = lazy(() =>
  import("@/features/agent/chat-actions").then((module) => ({
    default: module.FishChatActions,
  })),
);

const ROOT_ICONS = {
  "/": IconAlbum2,
  "/sources": IconNodes3,
  "/tags": IconTag,
  "/untagged": IconTagSlash,
  "/recents": IconHistory,
  "/downloads": IconWindowDownload,
  "/trash": IconTrashXmark,
  "/split-posts": IconLayers,
  "/settings": IconGear3,
} as const;

function RootIcon({ path }: { path: string }) {
  const Icon =
    Object.entries(ROOT_ICONS).find(([route]) => route === path)?.[1] ??
    (path.startsWith("/settings")
      ? IconGear3
      : path.startsWith("/source/")
        ? IconNodes3
        : path.startsWith("/canvas/")
          ? IconCanvas
          : IconAlbum2);
  return <Icon size={14} aria-hidden="true" />;
}

function Breadcrumbs() {
  const router = useRouter();
  const pathname = useRouteLocation((location) => location.pathname);
  const nav = useLibraryNav();
  const folderRows = useFolders();
  const [folderViews] = usePrefs("folderViews");
  const [customizingFolderId, setCustomizingFolderId] = useState<string | null>(
    null,
  );
  const saveId = saveIdFromPath(pathname);
  const save = useSave(saveId);
  const listPath = getLastListPath();
  const canvas = useCanvas(canvasIdFromPath(saveId ? listPath : pathname));
  const sourceName = useSourceDetailName();
  const hasActiveSearch = useHasActiveSearch();
  const filteredCount = useViewFilteredCount();
  const crumbs = buildBreadcrumbs({
    pathname,
    listPath,
    nav,
    folders: folderRows,
    saveLabel: computeLabel(pathname, save),
    canvasLabel: canvas?.name,
    sourceLabel: sourceName ?? undefined,
    searchResultCount: hasActiveSearch ? filteredCount : undefined,
  });
  const hidden = crumbs.length > 3 ? crumbs.slice(1, -2) : [];
  const customizingFolder = customizingFolderId
    ? folderRows.find((folder) => folder.id === customizingFolderId)
    : undefined;

  function navigate(crumb: Breadcrumb) {
    if (crumb.nav) libraryChrome.setNav(crumb.nav);
    if (crumb.nav?.kind === "all" && crumb.path === "/") resetFilters();
    router.history.push(crumb.path);
  }

  function folderMenu(crumb: Breadcrumb) {
    if (crumb.nav?.kind !== "folder") return null;
    const folderId = crumb.nav.id;
    const folder = folderRows.find((entry) => entry.id === folderId);
    if (!folder) return null;
    const presentation = folderViews[folder.id];
    return {
      folder,
      items: [
        {
          label: "Open Folder",
          onClick: () => navigate(crumb),
        },
        {
          type: "checkbox" as const,
          label: "Quick Access",
          checked: presentation?.quickAccess ?? false,
          onCheckedChange: (quickAccess: boolean) =>
            void saveFolderPresentation(folder.id, { quickAccess }),
        },
        {
          type: "submenu" as const,
          label: "Icon",
          items: folderIconMenuItems({
            folderId: folder.id,
            icon: presentation?.icon,
            glyphs: false,
          }),
        },
        {
          type: "submenu" as const,
          label: "Color",
          items: folderColorMenuItems({ folder, glyphs: false }),
        },
        {
          type: "submenu" as const,
          label: "Sort By",
          items: (
            [
              ["savedAt", "Date Saved"],
              ["createdAt", "Date Added"],
              ["title", "Title"],
              ["type", "Type"],
              ["random", "Random"],
            ] as const
          ).map(([sortKey, label]) => ({
            type: "checkbox" as const,
            label,
            checked: (presentation?.sortKey ?? "savedAt") === sortKey,
            onCheckedChange: () =>
              void saveFolderPresentation(folder.id, { sortKey }),
          })),
        },
        {
          label: "Customize Folder",
          onClick: () => setCustomizingFolderId(folder.id),
        },
      ],
    };
  }

  return (
    <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
      <ol className={styles.trail}>
        {crumbs.map((crumb, index) => {
          if (hidden.length && index > 1 && index < crumbs.length - 2)
            return null;
          if (hidden.length && index === 1) {
            return (
              <li className={styles.overflow} key="ancestors">
                <span className={styles.separator} aria-hidden="true">
                  /
                </span>
                <Menu.Root>
                  <Menu.Trigger
                    icon
                    variant="ghost"
                    size="sm"
                    className={styles.more}
                    aria-label="Show Parent Folders"
                  >
                    <IconDots />
                  </Menu.Trigger>
                  <Menu.Portal>
                    <Menu.Positioner align="start" side="bottom">
                      <Menu.Popup>
                        <Menu.Items
                          items={hidden.map((parent) => ({
                            label: parent.label,
                            onClick: () => navigate(parent),
                          }))}
                        />
                      </Menu.Popup>
                    </Menu.Positioner>
                  </Menu.Portal>
                </Menu.Root>
              </li>
            );
          }
          const current = index === crumbs.length - 1;
          const menu = folderMenu(crumb);
          const icon = index > 0 ? null : <RootIcon path={crumb.path} />;
          const segment = current ? (
            <span
              className={styles.current}
              aria-current="page"
              title={crumb.label}
            >
              {icon}
              <span className={styles.label}>{crumb.label}</span>
            </span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              density="compact"
              className={styles.crumb}
              title={crumb.label}
              onClick={() => navigate(crumb)}
            >
              {icon}
              <span className={styles.label}>{crumb.label}</span>
            </Button>
          );
          return (
            <li
              key={
                crumb.nav?.kind === "folder"
                  ? `folder:${crumb.nav.id}`
                  : `${crumb.path}:${crumb.nav?.kind ?? "save"}`
              }
              className={styles.segment}
              data-current={current || undefined}
            >
              {index > 0 ? (
                <span className={styles.separator} aria-hidden="true">
                  /
                </span>
              ) : null}
              {menu ? (
                <SpecContextMenu buildItems={() => menu.items}>
                  {segment}
                </SpecContextMenu>
              ) : (
                segment
              )}
            </li>
          );
        })}
      </ol>
      {customizingFolder ? (
        <FolderCustomizeDialog
          folder={customizingFolder}
          folderIcon={folderViews[customizingFolder.id]?.icon}
          onClose={() => setCustomizingFolderId(null)}
        />
      ) : null}
    </nav>
  );
}

export function Toolbar() {
  const sidebarOpen = useSidebarOpen();
  const detailsOpen = useDetailsOpen();
  const pathname = useRouteLocation((location) => location.pathname);
  const viewingSave = saveIdFromPath(pathname) !== null;
  const viewingFish = fishIdFromPath(pathname) !== null;
  return (
    <div className={styles.bar}>
      <div className={styles.chrome}>
        <div className={styles.tools}>
          <SidebarToggle open={sidebarOpen} />
          <ChromeHistoryNav />
        </div>
        <div className={styles.tools}>
          <SearchButton />
          <NewMenu />
        </div>
      </div>
      <div className={styles.main}>
        {viewingSave ? (
          <div className={styles.viewer} ref={setViewerToolbarHost} />
        ) : viewingFish ? null : (
          <Breadcrumbs />
        )}
      </div>
      <div className={styles.actions}>
        {viewingFish ? (
          <Suspense fallback={null}>
            <FishChatActions />
          </Suspense>
        ) : null}
        <SidebarToggle side="right" open={detailsOpen} />
      </div>
    </div>
  );
}
