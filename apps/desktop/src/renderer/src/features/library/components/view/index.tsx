import { Button } from "@pond/ui";
import { useCallback, useEffect, useRef } from "react";
import {
  FolderEmpty,
  LibraryEmpty,
  LibraryLoading,
  LibrarySectionEmpty,
  TrashEmpty,
  UncategorizedEmpty,
} from "@/features/library/components/empty";
import { libraryEmptyKind } from "@/features/library/components/empty/kind";
import { FolderBrowser } from "@/features/library/components/folder-browser";
import { HoverPreview } from "@/features/library/components/hover-preview";
import { LibraryGrid } from "@/features/library/components/layouts/grid";
import { LayoutSwitcher } from "@/features/library/components/layouts/switcher";
import { useFolderDownloading } from "@/features/library/hooks/use-folder-downloading";
import { useGridHotkeys } from "@/features/library/hooks/use-grid-hotkeys";
import { useLibraryState } from "@/features/library/hooks/use-library-state";
import { useRectangleSelection } from "@/features/library/hooks/use-rectangle-selection";
import { useFolders } from "@/features/library/state/folders";
import { useLibraryNav } from "@/features/library/state/library-chrome";
import { resetFilters } from "@/features/library/state/view-store";
import {
  clearSaveSelection,
  isLibraryBackgroundTarget,
  libraryViewContext,
  SaveCollectionContextMenu,
  useCardActions,
} from "@/features/saves";
import { resultNavigation } from "@/features/saves/navigation";
import { useSavePaging } from "@/features/saves/pool";
import { MatchesEmpty } from "@/shared/components/matches-empty";
import { buildEmptyGalleryMenu } from "./empty-gallery-menu";

function LibraryEmptyState({
  mode,
  navKind,
  hasActiveSearch,
  hasActiveFilter,
  libraryTotal,
  downloading,
}: {
  mode: ReturnType<typeof useLibraryState>["mode"];
  navKind: ReturnType<typeof useLibraryNav>["kind"];
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
  if (kind === "folder") return <FolderEmpty downloading={downloading} />;
  if (kind === "library") return <LibraryEmpty />;
  if (kind === "uncategorized") return <UncategorizedEmpty />;
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
  const actions = useCardActions(
    data.filteredIds,
    data.mode,
    data.sourceFilter,
  );
  useGridHotkeys(data.filteredIds);

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
      total: data.paging.total,
      loadedIds: data.paging.loadedIds,
      ids: data.filteredIds,
      allIds: data.paging.allIds,
      loadMore: data.paging.loadMore,
    });
  }, [
    data.filteredIds,
    data.mode,
    data.paging.allIds,
    data.paging.loadMore,
    data.paging.loading,
    data.paging.queryKey,
    data.paging.settledEmpty,
    data.paging.total,
    data.paging.loadedIds,
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
            hasActiveSearch={data.hasActiveSearch}
            hasActiveFilter={data.hasActiveFilter}
            libraryTotal={paging.total}
            downloading={downloading}
          />
        ) : nav.kind === "folder" ? (
          <FolderBrowser
            parentId={nav.id}
            contentCount={data.paging.total}
            downloading={filtering ? 0 : downloading}
          >
            {data.filtered.length > 0 ? (
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
            ) : null}
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
              border: "1px solid var(--ds-accent-9)",
              background:
                "color-mix(in srgb, var(--ds-accent-9) 15%, transparent)",
              ...marquee.rectangle,
            }}
          />
        ) : null}
        <HoverPreview />
      </LibraryGrid.Root>
    </SaveCollectionContextMenu>
  );
}
