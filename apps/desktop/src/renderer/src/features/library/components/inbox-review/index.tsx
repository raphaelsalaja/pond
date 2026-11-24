import { IconClock } from "@pond/icons";
import { Button, Empty, EmptyPreview, Loader } from "@pond/ui";
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
import { lastGridHrefOutsideInbox } from "@/features/library/state/last-grid";
import { useLibraryNav } from "@/features/library/state/library-chrome";
import {
  NotificationDetail,
  ProgressDetail,
  useInboxProgress,
  useNotification,
} from "@/features/notifications";
import { ensureSaves } from "@/features/saves/pool";
import { getAppRouter } from "@/shared/lib/app-router";
import styles from "./styles.module.css";

function leaveInbox() {
  getAppRouter()?.history.push(lastGridHrefOutsideInbox());
}

export function InboxReview() {
  const nav = useLibraryNav();
  const scope: InboxScope | null =
    nav?.kind === "inbox" ? (nav.snoozed ? "snoozed" : "review") : null;
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
  const progress = useInboxProgress().find((row) => row.id === selectedId);
  const total = queue?.ids.length ?? 0;
  const position = queue ? Math.min(queue.index + 1, total) : 0;
  const remaining = scope === "snoozed" ? counts.inboxSnoozed : counts.inbox;

  const ids = queue?.ids;
  useEffect(() => {
    if (ids) void ensureSaves(ids).catch(() => {});
  }, [ids]);

  /** A resolved notification or settled work drops back to the deck instead of a blank pane. */
  const open = notification !== null || progress !== undefined;
  useEffect(() => {
    if (selectedId && !open) inboxPicker.select(null);
  }, [selectedId, open]);

  const close = () => (total > 0 ? inboxPicker.select(null) : leaveInbox());

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
          onClose={close}
        />
      ) : progress ? (
        <ProgressDetail
          key={progress.id}
          progress={progress}
          onStep={navigation.step}
          onClose={close}
        />
      ) : queue === null ? (
        <div className={styles.center}>
          <Loader.Spinner />
        </div>
      ) : total === 0 ? (
        <div className={styles.center}>
          <Empty.Root role="status">
            <Empty.Media>
              {scope === "snoozed" ? (
                <EmptyPreview.Root>
                  <EmptyPreview.Row>
                    <EmptyPreview.Icon>
                      <IconClock size={12} />
                    </EmptyPreview.Icon>
                    <EmptyPreview.Line width={46} />
                    <EmptyPreview.Space />
                    <EmptyPreview.Line width={24} tone="mid" />
                  </EmptyPreview.Row>
                </EmptyPreview.Root>
              ) : (
                <EmptyPreview.Root shape="panel">
                  <EmptyPreview.Column>
                    <EmptyPreview.Block />
                    <EmptyPreview.Line width={52} />
                    <EmptyPreview.Line width={34} tone="thin" />
                  </EmptyPreview.Column>
                </EmptyPreview.Root>
              )}
            </Empty.Media>
            <Empty.Title>
              {scope === "snoozed"
                ? "No Snoozed Saves"
                : "You're All Caught Up"}
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
