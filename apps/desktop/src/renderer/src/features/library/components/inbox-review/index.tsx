import { IconCircleCheck } from "@pond/icons";
import { Button, Empty, Loader } from "@pond/ui";
import { useEffect } from "react";
import { ReviewDeck } from "@/features/library/components/inbox-review/deck";
import { ReviewFinished } from "@/features/library/components/inbox-review/finished";
import { useInboxNavigation } from "@/features/library/hooks/use-inbox-items";
import { useSidebarCounts } from "@/features/library/hooks/use-sidebar-counts";
import type { ReviewQueue } from "@/features/library/lib/review-queue";
import {
  type InboxScope,
  inboxPicker,
  inboxReview,
  useInboxReview,
  useInboxReviewScope,
  useInboxSelection,
} from "@/features/library/state/inbox-review";
import { useLibraryNav } from "@/features/library/state/library-chrome";
import { navigationHistory } from "@/features/library/state/navigation-history";
import { NotificationDetail, useNotification } from "@/features/notifications";
import { ensureSaves } from "@/features/saves/pool";
import {
  restoreLibraryNav,
  selectLibraryNav,
} from "../folder-sidebar/navigation";
import styles from "./styles.module.css";

/** Returns to the last place you were before the Inbox, or All when the Inbox was the first stop. */
function leaveInbox() {
  const { entries, index } = navigationHistory.snapshot();
  for (let at = index - 1; at >= 0; at -= 1) {
    if (entries[at]?.kind === "inbox") continue;
    const nav = navigationHistory.jump(at);
    if (nav) {
      restoreLibraryNav(nav);
      return;
    }
  }
  selectLibraryNav({ kind: "all" });
}

export function InboxReview() {
  const nav = useLibraryNav();
  const scope: InboxScope | null =
    nav.kind === "inbox" ? (nav.snoozed ? "snoozed" : "review") : null;
  const queue = useInboxReview();
  const loaded = useInboxReviewScope();

  useEffect(() => {
    if (scope) void inboxReview.start(scope);
    else inboxReview.exit();
  }, [scope]);

  if (!scope) return null;
  return <InboxPage scope={scope} queue={loaded === scope ? queue : null} />;
}

function InboxPage({
  scope,
  queue,
}: {
  scope: InboxScope;
  queue: ReviewQueue | null;
}) {
  const counts = useSidebarCounts();
  const navigation = useInboxNavigation();
  const selectedId = useInboxSelection();
  const notification = useNotification(selectedId);
  const total = queue?.ids.length ?? 0;
  const position = queue ? Math.min(queue.index + 1, total) : 0;
  const remaining = scope === "snoozed" ? counts.inboxSnoozed : counts.inbox;

  const ids = queue?.ids;
  useEffect(() => {
    if (ids) void ensureSaves(ids).catch(() => {});
  }, [ids]);

  /** A resolved or deleted notification drops back to the deck instead of a blank pane. */
  useEffect(() => {
    if (selectedId && !notification) inboxPicker.select(null);
  }, [selectedId, notification]);

  /** With no Saves to review, the first notification opens rather than an empty state. */
  const autoOpen = queue !== null && total === 0 && !navigation.empty;
  useEffect(() => {
    if (autoOpen && !inboxPicker.selected()) navigation.step(1);
  });

  return (
    <div className={styles.page}>
      {total > 0 ? (
        <p className={styles.progress} aria-live="polite">
          {position} / {total}
        </p>
      ) : null}
      {notification ? (
        <NotificationDetail
          key={notification.id}
          notification={notification}
          onLeave={navigation.leave}
          onStep={navigation.step}
          onClose={() =>
            total > 0 ? inboxPicker.select(null) : leaveInbox()
          }
        />
      ) : queue === null ? (
        <div className={styles.center}>
          <Loader.Spinner />
        </div>
      ) : total === 0 ? (
        <div className={styles.center}>
          <Empty.Root role="status">
            <Empty.Media>
              <IconCircleCheck size={14} />
            </Empty.Media>
            <Empty.Title>
              {scope === "snoozed"
                ? "No snoozed saves"
                : "You're all caught up"}
            </Empty.Title>
            <Empty.Description>
              {scope === "snoozed"
                ? "Snoozed saves come back to the Inbox when their time is up."
                : "New saves and library notifications land here."}
            </Empty.Description>
            <Empty.Action>
              <Button variant="secondary" size="sm" onClick={leaveInbox}>
                Back to Library
              </Button>
            </Empty.Action>
          </Empty.Root>
        </div>
      ) : (
        <ReviewDeck
          queue={queue}
          onExit={leaveInbox}
          onStep={navigation.step}
          finished={
            <ReviewFinished
              queue={queue}
              remaining={remaining}
              onRestart={() => void inboxReview.start(scope)}
              onExit={leaveInbox}
            />
          }
        />
      )}
    </div>
  );
}
