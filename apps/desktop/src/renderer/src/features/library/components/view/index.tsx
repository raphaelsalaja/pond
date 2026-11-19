import { Button } from "@pond/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FolderEmpty,
  InboxEmpty,
  LibraryEmpty,
  LibraryLoading,
  LibrarySectionEmpty,
  TrashEmpty,
  UncategorizedEmpty,
} from "@/features/library/components/empty";
import { libraryEmptyKind } from "@/features/library/components/empty/kind";
import { FolderBrowser } from "@/features/library/components/folder-browser";
import { HoverPreview } from "@/features/library/components/hover-preview";
import { InboxHeader } from "@/features/library/components/inbox-header";
import { LibraryGrid } from "@/features/library/components/layouts/grid";
import { LayoutSwitcher } from "@/features/library/components/layouts/switcher";
import { useFolderDownloading } from "@/features/library/hooks/use-folder-downloading";
import { useGridHotkeys } from "@/features/library/hooks/use-grid-hotkeys";
import { useLibraryState } from "@/features/library/hooks/use-library-state";
import { useRectangleSelection } from "@/features/library/hooks/use-rectangle-selection";
import { splitPinned } from "@/features/library/lib/pinned-sections";
import { saveFolderPresentation } from "@/features/library/state/folder-presentation";
import { useFolders } from "@/features/library/state/folders";
import { useLibraryNav } from "@/features/library/state/library-chrome";
import { resetFilters } from "@/features/library/state/view-store";
import {
  clearSaveSelection,
  createSelectionReconciler,
  isLibraryBackgroundTarget,
  libraryViewContext,
  SaveCollectionContextMenu,
  useCardActions,
} from "@/features/saves";
import { resultNavigation } from "@/features/saves/navigation";
import { useSavePaging } from "@/features/saves/pool";
import type { Save } from "@/features/saves/types";
import { MatchesEmpty } from "@/shared/components/matches-empty";
import { usePrefs } from "@/shared/state/prefs";
import { buildEmptyGalleryMenu } from "./empty-gallery-menu";
import { importFolderFor } from "./import-folder";

const NO_SAVES: ReadonlyArray<Save> = [];

function LibraryEmptyState({
  mode,
  navKind,
  folderId,
  hasActiveSearch,
  hasActiveFilter,
  libraryTotal,
  downloading,
}: {
  mode: ReturnType<typeof useLibraryState>["mode"];
  navKind: ReturnType<typeof useLibraryNav>["kind"];
  folderId: string | undefined;
  hasActiveSearch: boolean;
  hasActiveFilter: boolean;
  libraryTotal: number;
  downloading: number;
}) {
  const kind = libraryEmptyKind({
    mode,
    navKind,
    hasActiveSearch,
    hasActiveFilter,
    libraryTotal,
  });
  if (kind === "trash") return <TrashEmpty />;
  if (kind === "folder")
    return <FolderEmpty folderId={folderId} downloading={downloading} />;
  if (kind === "library") return <LibraryEmpty />;
  if (kind === "uncategorized") return <UncategorizedEmpty />;
  if (kind === "inbox") return <InboxEmpty />;
  if (kind === "section" && mode !== "library" && mode !== "trash") {
    return <LibrarySectionEmpty mode={mode} />;
  }
  return <MatchesEmpty onReset={resetFilters} />;
}

export function LibraryView() {
  const data = useLibraryState();
  const marquee = useRectangleSelection();
  const nav = useLibraryNav();
  const folders = useFolders();
  const paging = useSavePaging();
  const [folderViews] = usePrefs("folderViews");
  const folderId = nav.kind === "folder" ? nav.id : null;
  const pinnedIds = data.paging.pinnedIds;
  const sections = useMemo(
    () => splitPinned(data.filtered, pinnedIds),
    [data.filtered, pinnedIds],
  );
  const pinnedCount = sections.pinned.length;
  const collapsed =
    pinnedCount > 0 &&
    folderId !== null &&
    (folderViews[folderId]?.pinnedCollapsed ?? false);
  const lead = collapsed ? NO_SAVES : sections.pinned;
  /** Navigation, ranges and the result count follow display order and skip collapsed pinned Saves. */
  const visibleIds = useMemo(
    () =>
      pinnedCount === 0
        ? data.filteredIds
        : [...lead, ...sections.contents].map((save) => save.id),
    [data.filteredIds, lead, pinnedCount, sections.contents],
  );
  const allIds = useMemo(() => {
    if (!collapsed) return data.paging.allIds;
    const hidden = new Set(pinnedIds);
    return async () =>
      (await data.paging.allIds())?.filter((id) => !hidden.has(id)) ?? null;
  }, [collapsed, data.paging.allIds, pinnedIds]);
  const togglePinned = useCallback(() => {
    if (folderId)
      void saveFolderPresentation(folderId, { pinnedCollapsed: !collapsed });
  }, [collapsed, folderId]);
  const actions = useCardActions(
    visibleIds,
    data.mode,
    data.sourceFilter,
    importFolderFor({ mode: data.mode, nav, folders }),
  );
  useGridHotkeys(visibleIds);

  const canLoadAnotherPage = data.paging.hasMore && !data.paging.loading;
  const hasChildFolders =
    nav.kind === "folder" &&
    folders.some((folder) => folder.parentId === nav.id);
  const filtering = data.hasActiveSearch || data.hasActiveFilter;
  const downloading = useFolderDownloading(
    nav.kind === "folder" ? nav.id : null,
  );
  const onEndReached = useCallback(() => {
    void data.paging.loadMore();
  }, [data.paging.loadMore]);
  // A new scope clears its page before the first answer arrives. Publishing
  // that empty list under the new key makes an open preview treat the Save as gone.
  const publishedKey = useRef<string | null>(null);
  const [reconcileSelection] = useState(createSelectionReconciler);

  useEffect(() => {
    const key = data.paging.queryKey;
    const unsettled =
      publishedKey.current !== key &&
      data.paging.loading &&
      data.filteredIds.length === 0 &&
      !data.paging.settledEmpty;
    if (unsettled) return;
    publishedKey.current = key;
    libraryViewContext.set(data.filteredIds, data.mode);
    resultNavigation.setSource({
      key,
      total: data.paging.total - (collapsed ? pinnedCount : 0),
      loadedIds: data.paging.loadedIds,
      ids: visibleIds,
      allIds,
      loadMore: data.paging.loadMore,
    });
    /** After setSource, so an open preview has already followed a departed Save to its neighbor. */
    reconcileSelection({
      key,
      ids: data.filteredIds,
      settled: !data.paging.loading,
    });
  }, [
    allIds,
    collapsed,
    data.filteredIds,
    data.mode,
    data.paging.loadMore,
    data.paging.loading,
    data.paging.queryKey,
    data.paging.settledEmpty,
    data.paging.total,
    data.paging.loadedIds,
    pinnedCount,
    reconcileSelection,
    visibleIds,
  ]);

  return (
    <SaveCollectionContextMenu
      acceptsBackground={isLibraryBackgroundTarget}
      buildBackgroundItems={buildEmptyGalleryMenu}
    >
      <LibraryGrid.Root
        data-library-grid=""
        onPointerDown={marquee.onPointerDown}
        onMouseDown={(event) => {
          if (event.defaultPrevented || event.button !== 0) return;
          if (event.metaKey || event.ctrlKey || event.shiftKey) return;
          if (!isLibraryBackgroundTarget(event.target)) return;
          clearSaveSelection();
        }}
        onDragOver={actions.onDragOver}
        onDrop={(e) => void actions.onDrop(e)}
      >
        {nav.kind === "inbox" ? (
          <InboxHeader snoozed={nav.snoozed ?? false} />
        ) : null}
        {data.paging.error ? (
          <div role="alert">
            {data.paging.error}{" "}
            <Button
              type="button"
              size="xs"
              variant="text"
              onClick={() => void data.paging.retry()}
            >
              Try Again
            </Button>
          </div>
        ) : !data.bootReady ||
          (data.paging.loading &&
            data.filtered.length === 0 &&
            !data.paging.settledEmpty) ? (
          <LibraryLoading />
        ) : data.filtered.length === 0 && (!hasChildFolders || filtering) ? (
          <LibraryEmptyState
            mode={data.mode}
            navKind={nav.kind}
            folderId={nav.kind === "folder" ? nav.id : undefined}
            hasActiveSearch={data.hasActiveSearch}
            hasActiveFilter={data.hasActiveFilter}
            libraryTotal={paging.total}
            downloading={downloading}
          />
        ) : nav.kind === "folder" ? (
          <FolderBrowser
            parentId={nav.id}
            contentCount={Math.max(0, data.paging.total - pinnedCount)}
            downloading={filtering ? 0 : downloading}
            pinned={
              pinnedCount > 0
                ? { count: pinnedCount, collapsed, onToggle: togglePinned }
                : undefined
            }
          >
            {(divider) =>
              data.filtered.length > 0 ? (
                <LayoutSwitcher
                  viewMode={data.viewMode}
                  saves={sections.contents}
                  lead={lead}
                  divider={divider}
                  multiSelectActive={actions.multiSelectActive}
                  onClick={actions.handleCardClick}
                  onPick={actions.handleCardPick}
                  onAuxClick={actions.handleCardAuxClick}
                  onDoubleClick={actions.focus}
                  onEndReached={canLoadAnotherPage ? onEndReached : undefined}
                />
              ) : null
            }
          </FolderBrowser>
        ) : (
          <LayoutSwitcher
            viewMode={data.viewMode}
            saves={data.filtered}
            multiSelectActive={actions.multiSelectActive}
            onClick={actions.handleCardClick}
            onPick={actions.handleCardPick}
            onAuxClick={actions.handleCardAuxClick}
            onDoubleClick={actions.focus}
            onEndReached={canLoadAnotherPage ? onEndReached : undefined}
          />
        )}
        {marquee.rectangle ? (
          <div
            aria-hidden="true"
            style={{
              position: "fixed",
              pointerEvents: "none",
              zIndex: 10,
              border: "1px solid var(--ds-accent)",
              background:
                "color-mix(in srgb, var(--ds-accent) 15%, transparent)",
              ...marquee.rectangle,
            }}
          />
        ) : null}
        <HoverPreview />
      </LibraryGrid.Root>
    </SaveCollectionContextMenu>
  );
}
