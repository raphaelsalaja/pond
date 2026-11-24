import { Shell } from "@pond/ui";
import { useRouter } from "@tanstack/react-router";
import { useLayoutEffect, useMemo } from "react";
import { FileRing } from "@/features/library/components/file-ring";
import { FilterBar } from "@/features/library/components/filter-menu";
import { LibraryIntro } from "@/features/library/components/intro";
import { LibraryView } from "@/features/library/components/view";
import { AppShell } from "@/features/library/components/workspace-shell";
import { rememberGridLocation } from "@/features/library/state/last-grid";
import { useLibraryNav } from "@/features/library/state/library-chrome";
import { SaveSelectionBar } from "@/features/saves";
import { useOpenSaveId } from "@/features/saves/navigation";
import { useLibraryEmpty } from "@/features/saves/pool";
import { useRouteLocation } from "@/shared/hooks/use-route-location";
import {
  ScrollRestorationContext,
  useScrollRestoration,
} from "@/shared/hooks/use-scroll-restoration";
import type { LibraryNav } from "@/shared/lib/library-nav";
import styles from "./styles.module.css";

/** These places keep their own empty state even in an empty Library. */
const PLACES_WITH_OWN_EMPTY = new Set<LibraryNav["kind"]>([
  "folder",
  "inbox",
  "trash",
]);

/** One grid for every collection route, so switching collections keeps its scroller and decoded thumbnails. */
export function GridSurface() {
  const router = useRouter();
  const saveOpen = useOpenSaveId() !== null;
  const location = useRouteLocation((next) => next);
  const restoration = useScrollRestoration(location.pathname);
  /** The grid stays mounted under an open Save, so a search change must not re-render it. */
  const view = useMemo(() => <LibraryView />, []);
  const navKind = useLibraryNav()?.kind ?? "all";
  const inbox = navKind === "inbox";
  const libraryEmpty = useLibraryEmpty();

  useLayoutEffect(() => {
    rememberGridLocation(location, router.options.stringifySearch, inbox);
  }, [location, router, inbox]);

  if (libraryEmpty && !saveOpen && !PLACES_WITH_OWN_EMPTY.has(navKind)) {
    return (
      <AppShell.Content>
        <Shell.Body className={styles.body}>
          <LibraryIntro />
          <FileRing />
        </Shell.Body>
      </AppShell.Content>
    );
  }

  return (
    <AppShell.Content>
      <Shell.Body className={styles.body}>
        {saveOpen ? null : (
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
        {saveOpen ? null : <SaveSelectionBar />}
        {saveOpen ? null : <FileRing />}
      </Shell.Body>
    </AppShell.Content>
  );
}
