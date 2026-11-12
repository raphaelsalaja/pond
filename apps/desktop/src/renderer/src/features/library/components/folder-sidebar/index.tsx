import { Sidebar } from "@pond/ui";
import { useRouterState } from "@tanstack/react-router";
import { CanvasesSection, canvasIdFromPath } from "@/features/canvas";
import { FishSection, fishIdFromPath } from "@/features/fish";
import { NewMenu } from "@/features/library/components/new-menu";
import { SmartFoldersSection } from "@/features/library/components/smart-folders";
import { WorkspaceMenu } from "@/features/library/components/workspace-menu";
import { useFolders } from "@/features/library/state/folders";
import { useLibraryNav } from "@/features/library/state/library-chrome";
import { useHydrateSavedViews } from "@/features/library/state/saved-views";
import { useActiveViewId } from "@/features/library/state/view-store";
import { activeLibraryDestination } from "@/shared/lib/library-nav";
import { LibraryDestinations } from "./destinations";
import { FolderTree } from "./folder-tree";
import { selectLibraryNav } from "./navigation";
import styles from "./styles.module.css";

function WorkspaceHeader() {
  return (
    <Sidebar.Header className={styles.workspace}>
      <WorkspaceMenu />
      <div className={styles.actions}>
        <NewMenu />
      </div>
    </Sidebar.Header>
  );
}

export function FolderSidebar() {
  const nav = useLibraryNav();
  const activeViewId = useActiveViewId();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const folderRows = useFolders();
  const activeCanvasId = canvasIdFromPath(pathname);
  const activeFishId = fishIdFromPath(pathname);
  const destination = activeLibraryDestination(pathname, nav);
  useHydrateSavedViews();

  return (
    <Sidebar.Root
      className={styles.root}
      width="full"
      role="navigation"
      aria-label="Library"
    >
      <WorkspaceHeader />
      <Sidebar.Scroll className={styles.scroll}>
        <LibraryDestinations
          activeViewId={activeViewId}
          destination={destination}
        />
        <SmartFoldersSection
          active={destination?.kind === "all"}
          onSelect={() => selectLibraryNav({ kind: "all" })}
        />
        <FishSection activeId={activeFishId} />
        <CanvasesSection activeId={activeCanvasId} />
        <FolderTree
          destination={destination}
          folderRows={folderRows}
          nav={nav}
        />
      </Sidebar.Scroll>
    </Sidebar.Root>
  );
}
