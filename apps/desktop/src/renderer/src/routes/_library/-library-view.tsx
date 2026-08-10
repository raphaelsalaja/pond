import { useRouter } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { WelcomeEmpty } from "@/components/library/empty";
import { LibraryGrid } from "@/components/library/layouts/grid";
import { LayoutSwitcher } from "@/components/shared/layout-switcher";
import { useCardActions } from "@/hooks/use-card-actions";
import { useGridHotkeys } from "@/hooks/use-grid-hotkeys";
import { useLibraryState } from "@/hooks/use-library-state";
import { useSavePaging } from "@/hooks/use-saves";
import { getAppRouter } from "@/lib/ui/app-router";
import { hydrateFullPool, loadNextPage } from "@/stores/bootstrap";
import { libraryViewContext } from "@/stores/library-view-context";
import { tabs } from "@/stores/tabs";

export function LibraryView() {
  const router = useRouter();
  const data = useLibraryState();
  const paging = useSavePaging();
  const actions = useCardActions(
    data.filteredIds,
    data.mode,
    data.sourceFilter,
  );
  useGridHotkeys(data.filteredIds);

  const canLoadAnotherPage =
    data.mode === "library" &&
    !data.hasActiveSearch &&
    !data.hasActiveFilter &&
    !data.askActive &&
    paging.hasMore &&
    !paging.loading;
  const onEndReached = useCallback(() => {
    void loadNextPage();
  }, []);

  /** Source, untagged, recents, and trash cannot truthfully filter a recency page, so fill the pool only when one is opened. */
  useEffect(() => {
    if (data.mode === "library") return;
    void hydrateFullPool().catch((err) => {
      console.warn("[pond pool] full hydrate for library mode failed", err);
    });
  }, [data.mode]);

  /** Only the active tab's view owns the dock/context snapshot; background tabs stay mounted for state but must not overwrite it. */
  useEffect(() => {
    const sync = () => {
      if (getAppRouter() !== router) return;
      libraryViewContext.set(data.filteredIds, data.mode);
    };
    sync();
    return tabs.subscribe(sync);
  }, [router, data.filteredIds, data.mode]);

  return (
    <LibraryGrid.Root
      onDragOver={actions.onDragOver}
      onDrop={(e) => void actions.onDrop(e)}
    >
      {data.filtered.length === 0 ? (
        !data.bootReady ? null : data.mode === "trash" ? (
          <LibraryGrid.Empty>Trash is empty.</LibraryGrid.Empty>
        ) : data.totalSaves === 0 ? (
          <WelcomeEmpty />
        ) : (
          <LibraryGrid.Empty>
            No matches. Try a different search or clear the filter.
          </LibraryGrid.Empty>
        )
      ) : (
        <LayoutSwitcher
          viewMode={data.viewMode}
          saves={data.filtered}
          multiSelectActive={actions.multiSelectActive}
          onClick={actions.handleCardClick}
          onAuxClick={actions.handleCardAuxClick}
          onDoubleClick={actions.focus}
          onEndReached={canLoadAnotherPage ? onEndReached : undefined}
        />
      )}
    </LibraryGrid.Root>
  );
}
