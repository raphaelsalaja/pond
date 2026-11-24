import { Sidebar } from "@pond/ui";
import { type MouseEvent, Suspense, useEffect, useLayoutEffect } from "react";
import {
  CANVASES_PATH,
  CanvasesSection,
  canvases,
  canvasIdFromPath,
} from "@/features/canvas";
import {
  useCanvasEditingId,
  useHydrateCanvases,
} from "@/features/canvas/state/canvases";
import { DownloadsSidebar } from "@/features/downloads";
import {
  FishSection,
  fish,
  fishIdFromPath,
  useFishEditingId,
  useHydrateFish,
} from "@/features/fish";
import { SmartFoldersSection } from "@/features/library/components/smart-folders";
import {
  useEditingFolderId,
  useFolders,
} from "@/features/library/state/folders";
import { lastGridHref } from "@/features/library/state/last-grid";
import {
  type LibraryNav,
  libraryChrome,
  type SidebarPanel,
  useLibraryNav,
  useSidebarPanel,
} from "@/features/library/state/library-chrome";
import {
  useEditingSavedViewId,
  useHydrateSavedViews,
} from "@/features/library/state/saved-views";
import { useRailOnlySidebar } from "@/features/library/state/shell-layout";
import { useActiveViewId } from "@/features/library/state/view-store";
import { SourcesSidebar } from "@/features/sources";
import { SourceDetailSidebar } from "@/features/sources/components/inspector";
import {
  parseSourceDetailPath,
  SourceDetailsPageSchema,
} from "@/features/sources/state/source-detail";
import { TagsSidebar } from "@/features/tags";
import { useRouteLocation } from "@/shared/hooks/use-route-location";
import { getAppRouter } from "@/shared/lib/app-router";
import {
  lazyWithPreload,
  preloadWhenIdle,
} from "@/shared/lib/lazy-with-preload";
import { usePrefs } from "@/shared/state/prefs";
import { LibraryDestinations } from "./destinations";
import { FolderTree } from "./folder-tree";
import { InboxList } from "./inbox-list";
import { selectLibraryNav } from "./navigation";
import { isRailPage, Rail, type RailItem, type RailSection } from "./rail";
import { SidebarMenu } from "./sidebar-menu";
import styles from "./styles.module.css";

/** Dialogs rendered from sidebar rows portal out of the sidebar, but React still bubbles their right-clicks here. */
function keepPortaledContextMenus(event: MouseEvent<HTMLDivElement>) {
  if (
    event.target instanceof Node &&
    !event.currentTarget.contains(event.target)
  ) {
    event.stopPropagation();
  }
}

const SettingsSidebar = lazyWithPreload(() =>
  import("@/features/settings/components/sidebar").then(
    (module) => module.SettingsSidebar,
  ),
);

type RoutePanel = Extract<
  SidebarPanel,
  "inbox" | "downloads" | "sources" | "tags"
>;

const SOURCES_NAV: LibraryNav = { kind: "sources" };

interface LastOpened {
  canvases: string | null;
  fish: string | null;
}

const lastOpened: LastOpened = {
  canvases: null,
  fish: null,
};

/** A rail section lands on the Canvas or fish you last had open, or the first one in its list. */
function openable(
  entries: readonly { id: string }[],
  last: string | null,
): string | undefined {
  return entries.find((entry) => entry.id === last)?.id ?? entries[0]?.id;
}

function routePanel(destination: LibraryNav | null): RoutePanel | null {
  switch (destination?.kind) {
    case "inbox":
    case "downloads":
    case "sources":
    case "tags":
      return destination.kind;
    default:
      return null;
  }
}

export function FolderSidebar() {
  const nav = useLibraryNav();
  const activeViewId = useActiveViewId();
  const pathname = useRouteLocation((location) => location.pathname);
  const detailPage = useRouteLocation(
    (location) => SourceDetailsPageSchema.safeParse(location.search.page).data,
  );
  const folderRows = useFolders();
  const activeCanvasId = canvasIdFromPath(pathname);
  const canvasIntro = pathname === CANVASES_PATH;
  const activeFishId = fishIdFromPath(pathname);
  const railOnly = useRailOnlySidebar();
  const sourceDetail = parseSourceDetailPath(pathname, detailPage);
  const settings = pathname.startsWith("/settings");
  const destination: LibraryNav | null = settings
    ? null
    : sourceDetail
      ? SOURCES_NAV
      : nav;
  useEffect(() => preloadWhenIdle(SettingsSidebar.preload), []);
  const editingFish = useFishEditingId();
  const editingCanvas = useCanvasEditingId();
  const editingView = useEditingSavedViewId();
  const editingFolder = useEditingFolderId();
  const [sidebar] = usePrefs("sidebar");
  useHydrateSavedViews();
  /** The rail opens a Canvas or fish before its sidebar panel has ever mounted. */
  useHydrateCanvases();
  useHydrateFish();

  const visible: RailSection[] = [
    "library",
    ...(sidebar.sections.fish ? (["fish"] as const) : []),
    ...(sidebar.sections.canvases ? (["canvases"] as const) : []),
  ];

  const route = routePanel(destination);

  function followedSection(): SidebarPanel | null {
    if (editingFish) return "fish";
    if (editingCanvas) return "canvases";
    if (editingView || editingFolder) return "library";
    if (activeFishId) return "fish";
    if (activeCanvasId || canvasIntro) return "canvases";
    return route;
  }

  const follow = followedSection();
  const picked = useSidebarPanel();
  useLayoutEffect(() => {
    if (follow) libraryChrome.setSidebarPanel(follow);
  }, [follow]);
  const rail = visible.find((item) => item === picked) ?? null;
  const section: SidebarPanel =
    rail ?? (picked === route && route ? route : "library");
  const panel = settings ? "settings" : section;
  const railPage =
    destination && isRailPage(destination.kind) ? destination.kind : null;
  const railValue: RailItem | null =
    panel === "settings"
      ? null
      : panel === "library"
        ? (railPage ?? "library")
        : panel;

  useLayoutEffect(() => {
    if (activeCanvasId) lastOpened.canvases = activeCanvasId;
    if (activeFishId) lastOpened.fish = activeFishId;
  }, [activeCanvasId, activeFishId]);

  function backToLibrary() {
    getAppRouter()?.history.push(lastGridHref());
  }

  function pickSection(next: RailSection) {
    libraryChrome.setSidebarPanel(next);
    if (next === "canvases") {
      if (activeCanvasId || canvasIntro) return;
      const id = openable(canvases.snapshot(), lastOpened.canvases);
      if (id) canvases.open(id);
      else getAppRouter()?.history.push(CANVASES_PATH);
    } else if (next === "fish") {
      if (activeFishId) return;
      const id = openable(fish.snapshot(), lastOpened.fish);
      if (id) fish.open(id);
      else if (canvasIntro) backToLibrary();
    } else if (railPage) {
      selectLibraryNav({ kind: "all" });
    } else if (activeCanvasId || activeFishId || canvasIntro || settings) {
      backToLibrary();
    }
  }

  const scroll = (
    <Sidebar.Scroll
      key={
        panel === "sources" && sourceDetail
          ? `source:${sourceDetail.kind}:${sourceDetail.id}`
          : panel
      }
      className={styles.scroll}
      onContextMenu={keepPortaledContextMenus}
    >
      {panel === "settings" ? (
        <Suspense fallback={null}>
          <SettingsSidebar />
        </Suspense>
      ) : null}
      {panel === "library" ? (
        <>
          <Sidebar.GroupHeader>
            <Sidebar.GroupLabel>Library</Sidebar.GroupLabel>
          </Sidebar.GroupHeader>
          <LibraryDestinations
            activeViewId={activeViewId}
            destination={destination}
          />
          <SmartFoldersSection active={destination?.kind === "all"} />
          <FolderTree destination={destination} folderRows={folderRows} />
        </>
      ) : null}
      {panel === "fish" ? <FishSection activeId={activeFishId} /> : null}
      {panel === "canvases" ? (
        <CanvasesSection activeId={activeCanvasId} />
      ) : null}
      {panel === "inbox" ? <InboxList /> : null}
      {panel === "downloads" ? <DownloadsSidebar /> : null}
      {panel === "sources" ? (
        sourceDetail ? (
          <SourceDetailSidebar {...sourceDetail} />
        ) : (
          <SourcesSidebar />
        )
      ) : null}
      {panel === "tags" ? <TagsSidebar /> : null}
    </Sidebar.Scroll>
  );

  return (
    <Sidebar.Root
      className={styles.root}
      width="full"
      role="navigation"
      aria-label="Library"
    >
      <Rail
        value={railValue}
        sections={visible}
        onSectionChange={pickSection}
      />
      <div className={styles.panel} data-hidden={railOnly || undefined}>
        {panel === "library" ? (
          <SidebarMenu>
            <div className={styles.background}>{scroll}</div>
          </SidebarMenu>
        ) : (
          scroll
        )}
      </div>
    </Sidebar.Root>
  );
}
