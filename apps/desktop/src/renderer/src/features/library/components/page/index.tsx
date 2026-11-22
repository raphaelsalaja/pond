import { Shell } from "@pond/ui";
import { Outlet } from "@tanstack/react-router";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  LibrarySearch,
  LibrarySearchActions,
} from "@/features/library/components/chrome";
import { FileRing } from "@/features/library/components/file-ring";
import { FilterBar } from "@/features/library/components/filter-menu";
import { InboxReview } from "@/features/library/components/inbox-review";
import { RailPages } from "@/features/library/components/rail-pages";
import { LibraryView } from "@/features/library/components/view";
import { AppShell } from "@/features/library/components/workspace-shell";
import { showsLibraryGrid } from "@/features/library/lib/grid-path";
import { useLibraryNav } from "@/features/library/state/library-chrome";
import { NotificationBridge } from "@/features/notifications";
import {
  getLastListPath,
  getLastListSearch,
  rememberListPath,
  SaveSelectionBar,
} from "@/features/saves";
import {
  resultNavigation,
  saveIdFromPath,
  selection,
} from "@/features/saves/navigation";
import { SearchChrome } from "@/shared/components/search-chrome";
import { useRouteLocation } from "@/shared/hooks/use-route-location";
import {
  ScrollRestorationContext,
  useScrollRestoration,
} from "@/shared/hooks/use-scroll-restoration";
import { setPageToolbarHost } from "@/shared/state/page-toolbar";
import styles from "./styles.module.css";

export function Library() {
  const pathname = useRouteLocation((location) => location.pathname);
  const search = useRouteLocation((location) => location.searchStr);
  const isSave = saveIdFromPath(pathname) !== null;
  const nav = useLibraryNav();
  const showLibraryGrid = showsLibraryGrid(pathname);

  useLayoutEffect(() => {
    rememberListPath(pathname, search);
  }, [pathname, search]);

  const wasSave = useRef(isSave);
  /** Focus only lands once this commit lifts `inert` from the grid, not when the route is pushed. */
  useLayoutEffect(() => {
    const closed = wasSave.current && !isSave;
    wasSave.current = isSave;
    if (!closed || !showLibraryGrid) return;
    const cursor = selection.getCursor();
    if (cursor) void resultNavigation.reveal(cursor, { focus: true });
  }, [isSave, showLibraryGrid]);

  const listPath = isSave ? getLastListPath() : pathname;
  const listSearch = isSave ? getLastListSearch() : search;
  const restoration = useScrollRestoration(`${listPath}${listSearch}`);
  /** The grid stays mounted under an open Save, so a route change must not re-render it. */
  const view = useMemo(() => <LibraryView />, []);
  const covered = isSave || nav.kind === "inbox";

  return (
    <>
      {isSave ? null : showLibraryGrid ? (
        <SearchChrome.Bar>
          <LibrarySearch />
          <LibrarySearchActions />
        </SearchChrome.Bar>
      ) : (
        <div ref={setPageToolbarHost} />
      )}
      <div className={styles.stage}>
        {showLibraryGrid ? (
          <div
            className={styles["keep-alive"]}
            data-suppressed={isSave || undefined}
            inert={covered || undefined}
            aria-hidden={covered || undefined}
          >
            <AppShell.Content>
              <Shell.Body className={styles.body}>
                {isSave ? null : (
                  <div className={styles.chrome}>
                    <FilterBar />
                  </div>
                )}
                <ScrollRestorationContext.Provider value={restoration}>
                  <Shell.Main
                    ref={restoration.ref}
                    className={styles.main}
                    data-library-grid-viewport
                  >
                    {view}
                  </Shell.Main>
                </ScrollRestorationContext.Provider>
                {isSave ? null : <SaveSelectionBar />}
                {isSave ? null : <FileRing />}
              </Shell.Body>
            </AppShell.Content>
          </div>
        ) : null}

        {showLibraryGrid && !isSave ? <InboxReview /> : null}
        {isSave ? (
          <div className={styles.overlay}>
            <Outlet />
          </div>
        ) : !showLibraryGrid ? (
          <Outlet />
        ) : null}
        <RailPages pathname={pathname} />
        <NotificationBridge />
      </div>
    </>
  );
}
