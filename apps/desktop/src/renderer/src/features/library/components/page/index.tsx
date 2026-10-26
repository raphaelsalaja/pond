import { Shell } from "@pond/ui";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { useLayoutEffect } from "react";
import { canvasIdFromPath } from "@/features/canvas";
import { fishIdFromPath } from "@/features/fish";
import { LibraryChrome } from "@/features/library/components/chrome";
import { LibraryView } from "@/features/library/components/view";
import { AppShell } from "@/features/library/components/workspace-shell";
import {
  getLastListPath,
  getLastListSearch,
  rememberListPath,
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
  const isSources = pathname.startsWith("/sources");
  const isDownloads = pathname.startsWith("/downloads");
  const isFish = fishIdFromPath(pathname) !== null;
  const isTags = pathname === "/tags";
  const isSettings = pathname.startsWith("/settings");
  const isGallery = pathname === "/gallery";
  const isCanvas =
    canvasIdFromPath(isSave ? getLastListPath() : pathname) !== null;
  const showLibraryGrid =
    !isSources &&
    !isDownloads &&
    !isFish &&
    !isTags &&
    !isSettings &&
    !isGallery &&
    !isCanvas;

  useLayoutEffect(() => {
    rememberListPath(pathname, search);
  }, [pathname, search]);

  const listPath = isSave ? getLastListPath() : pathname;
  const listSearch = isSave ? getLastListSearch() : search;
  const restoration = useScrollRestoration(`${listPath}${listSearch}`);

  return (
    <div className={styles.stage}>
      {showLibraryGrid ? (
        <div
          className={styles["keep-alive"]}
          data-suppressed={isSave || undefined}
          inert={isSave || undefined}
          aria-hidden={isSave || undefined}
        >
          <AppShell.Content>
            <Shell.Body className={styles.body}>
              {isSave ? null : <LibraryChrome className={styles.chrome} />}
              <ScrollRestorationContext.Provider value={restoration}>
                <Shell.Main
                  ref={restoration.ref}
                  className={styles.main}
                  data-library-grid-viewport
                >
                  <LibraryView />
                </Shell.Main>
              </ScrollRestorationContext.Provider>
            </Shell.Body>
          </AppShell.Content>
        </div>
      ) : null}

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
