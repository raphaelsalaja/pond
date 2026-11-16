import { Shell } from "@pond/ui";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { useLayoutEffect, useMemo } from "react";
import { FileRing } from "@/features/library/components/file-ring";
import { FilterBar } from "@/features/library/components/filter-menu";
import { InboxReview } from "@/features/library/components/inbox-review";
import { LibraryView } from "@/features/library/components/view";
import { AppShell } from "@/features/library/components/workspace-shell";
import { showsLibraryGrid } from "@/features/library/lib/grid-path";
import { useLibraryNav } from "@/features/library/state/library-chrome";
import {
  getLastListPath,
  getLastListSearch,
  rememberListPath,
  SaveSelectionBar,
} from "@/features/saves";
import { saveIdFromPath } from "@/features/saves/navigation";
import {
  ScrollRestorationContext,
  useScrollRestoration,
} from "@/shared/hooks/use-scroll-restoration";
import styles from "./styles.module.css";

export function Library() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const isSave = saveIdFromPath(pathname) !== null;
  const nav = useLibraryNav();
  const showLibraryGrid = showsLibraryGrid(pathname);

  useLayoutEffect(() => {
    rememberListPath(pathname, search);
  }, [pathname, search]);

  const listPath = isSave ? getLastListPath() : pathname;
  const listSearch = isSave ? getLastListSearch() : search;
  const restoration = useScrollRestoration(`${listPath}${listSearch}`);
  /** The grid stays mounted under an open Save, so a route change must not re-render it. */
  const view = useMemo(() => <LibraryView />, []);
  const covered = isSave || nav.kind === "inbox";

  return (
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
    </div>
  );
}
