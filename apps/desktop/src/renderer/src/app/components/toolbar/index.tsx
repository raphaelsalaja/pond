import { IconAlbum2, IconDots } from "@pond/icons";
import { Button, Menu, Window } from "@pond/ui";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ChromeHistoryNav } from "@/app/components/chrome-toolbar";
import { canvasIdFromPath, useCanvas } from "@/features/canvas";
import { fishIdFromPath } from "@/features/fish";
import { FolderCustomizeDialog } from "@/features/library/components/folder-customize-dialog";
import { NewMenu } from "@/features/library/components/new-menu";
import { SearchButton } from "@/features/library/components/search-button";
import { SidebarToggle } from "@/features/library/components/sidebar-toggle";
import { useSplitPostTitle } from "@/features/library/hooks/use-split-posts";
import {
  folderColorMenuItems,
  folderIconMenuItems,
} from "@/features/library/lib/folder-appearance-menu";
import { saveFolderPresentation } from "@/features/library/state/folder-presentation";
import { useFolders } from "@/features/library/state/folders";
import {
  useDetailsOpen,
  useSidebarOpen,
} from "@/features/library/state/library-chrome";
import {
  useHiddenSidebar,
  useRailOnlySidebar,
  useShellDetails,
} from "@/features/library/state/shell-layout";
import { useHasActiveSearch } from "@/features/library/state/view-store";
import { useSave } from "@/features/saves/hooks/use-saves";
import { closeSave, useOpenSaveId } from "@/features/saves/lib/save-nav";
import { useViewFilteredCount } from "@/features/saves/state/view-context";
import { useSourceDetailName } from "@/features/sources/state/source-detail";
import { SpecContextMenu } from "@/shared/components/spec-context-menu";
import { useRouteLocation } from "@/shared/hooks/use-route-location";
import { useRouteMeta } from "@/shared/lib/route-meta";
import { usePrefs } from "@/shared/state/prefs";
import { buildBreadcrumbs } from "./breadcrumbs";
import type { Breadcrumb } from "./breadcrumbs";
import { saveLabel } from "./labels";
import styles from "./styles.module.css";

function Breadcrumbs() {
  const router = useRouter();
  const pathname = useRouteLocation((location) => location.pathname);
  const meta = useRouteMeta();
  const { nav } = meta;
  const folderRows = useFolders();
  const [folderViews] = usePrefs("folderViews");
  const [customizingFolderId, setCustomizingFolderId] = useState<string | null>(
    null,
  );
  const saveId = useOpenSaveId();
  const save = useSave(saveId);
  const canvas = useCanvas(canvasIdFromPath(pathname));
  const sourceName = useSourceDetailName();
  const postLabel = useSplitPostTitle(nav?.kind === "post" ? nav.key : null);
  const hasActiveSearch = useHasActiveSearch();
  const filteredCount = useViewFilteredCount();
  const crumbs = buildBreadcrumbs({
    meta,
    pathname,
    folders: folderRows,
    saveOpen: saveId !== null,
    labels: {
      save: saveLabel(save),
      canvas: canvas?.name,
      source: sourceName ?? undefined,
      post: postLabel,
    },
    searchResultCount: hasActiveSearch ? filteredCount : undefined,
  });
  const hidden = crumbs.length > 3 ? crumbs.slice(1, -2) : [];
  const customizingFolder = customizingFolderId
    ? folderRows.find((folder) => folder.id === customizingFolderId)
    : undefined;

  function navigate(crumb: Breadcrumb) {
    if (crumb.path === pathname) {
      closeSave();
    } else {
      router.history.push(crumb.path);
    }
  }

  function folderMenu(crumb: Breadcrumb) {
    if (crumb.nav?.kind !== "folder") {
      return null;
    }
    const folderId = crumb.nav.id;
    const folder = folderRows.find((entry) => entry.id === folderId);
    if (!folder) {
      return null;
    }
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
          if (hidden.length && index > 1 && index < crumbs.length - 2) {
            return null;
          }
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
          const Icon = crumb.icon ?? IconAlbum2;
          const icon = index > 0 ? null : <Icon size={14} aria-hidden="true" />;
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

function Leading() {
  const sidebarOpen = useSidebarOpen();
  const sidebarHidden = useHiddenSidebar();
  const railOnly = useRailOnlySidebar();
  return (
    <Window.Leading>
      <div className={styles.tools}>
        {sidebarHidden || railOnly ? null : (
          <SidebarToggle open={sidebarOpen} />
        )}
        <ChromeHistoryNav />
      </div>
      <div className={styles.tools}>
        <SearchButton />
        <NewMenu />
      </div>
    </Window.Leading>
  );
}

function Bar() {
  const viewingFish = useRouteLocation(
    (location) => fishIdFromPath(location.pathname) !== null,
  );
  return <Window.Bar>{viewingFish ? null : <Breadcrumbs />}</Window.Bar>;
}

function Trailing() {
  const detailsOpen = useDetailsOpen();
  const details = useShellDetails();
  return (
    <Window.Trailing>
      {details ? <SidebarToggle side="right" open={detailsOpen} /> : null}
    </Window.Trailing>
  );
}

function Root() {
  return (
    <Window.Toolbar>
      <Leading />
      <Bar />
      <Trailing />
    </Window.Toolbar>
  );
}

export const Toolbar = { Root };
