import { Window } from "@pond/ui";
import { Outlet } from "@tanstack/react-router";
import { useLayoutEffect, useRef } from "react";
import {
  LibrarySearch,
  LibrarySearchActions,
} from "@/features/library/components/chrome";
import { InboxReview } from "@/features/library/components/inbox-review";
import { RailPages } from "@/features/library/components/rail-pages";
import { SaveDetailPage } from "@/features/library/components/save-detail-page";
import { NotificationBridge } from "@/features/notifications";
import {
  resultNavigation,
  selection,
  useOpenSaveId,
} from "@/features/saves/navigation";
import { setViewerToolbarHost } from "@/features/saves/viewer-toolbar";
import { SearchChrome } from "@/shared/components/search-chrome";
import { useRouteMeta } from "@/shared/lib/route-meta";
import { setPageToolbarHost } from "@/shared/state/page-toolbar";
import styles from "./styles.module.css";

export function Library() {
  const { surface, nav } = useRouteMeta();
  const saveId = useOpenSaveId();
  const saveOpen = saveId !== null;
  const grid = surface === "grid";

  const reviewing = grid && nav?.kind === "inbox";
  const wasOpen = useRef(saveOpen);
  /** Focus only lands once this commit lifts `inert` from the grid, not when the URL changes. Inbox review keeps the grid covered and focuses its own deck. */
  useLayoutEffect(() => {
    const closed = wasOpen.current && !saveOpen;
    wasOpen.current = saveOpen;
    if (!closed || !grid || reviewing) return;
    const cursor = selection.getCursor();
    if (cursor) void resultNavigation.reveal(cursor, { focus: true });
  }, [saveOpen, grid, reviewing]);

  const covered = saveOpen || reviewing;

  return (
    <>
      <Window.Header>
        {saveOpen ? (
          <div className={styles.viewer} ref={setViewerToolbarHost} />
        ) : grid ? (
          <SearchChrome.Bar>
            <LibrarySearch />
            <LibrarySearchActions />
          </SearchChrome.Bar>
        ) : (
          <div ref={setPageToolbarHost} />
        )}
      </Window.Header>
      <Window.Body className={styles.stage}>
        {surface === "rail" ? null : (
          <div
            className={styles.surface}
            data-suppressed={saveOpen || undefined}
            inert={covered || undefined}
            aria-hidden={covered || undefined}
          >
            <Outlet />
          </div>
        )}
        {grid ? <InboxReview /> : null}
        {saveId !== null ? (
          <div className={styles.overlay}>
            <SaveDetailPage id={saveId} />
          </div>
        ) : null}
        <RailPages />
        <NotificationBridge />
      </Window.Body>
    </>
  );
}
