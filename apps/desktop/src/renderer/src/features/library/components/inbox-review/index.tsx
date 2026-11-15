import { IconCircleCheckFill, IconXmark } from "@pond/icons";
import { Button, Empty, Keyboard, Loader, TitleBar, Tooltip } from "@pond/ui";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ReviewDeck } from "@/features/library/components/inbox-review/deck";
import { ReviewFinished } from "@/features/library/components/inbox-review/finished";
import { useSidebarCounts } from "@/features/library/hooks/use-sidebar-counts";
import type { ReviewQueue } from "@/features/library/lib/review-queue";
import {
  type InboxScope,
  inboxReview,
  useInboxReview,
  useInboxReviewScope,
} from "@/features/library/state/inbox-review";
import { useLibraryNav } from "@/features/library/state/library-chrome";
import { navigationHistory } from "@/features/library/state/navigation-history";
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
  return createPortal(
    <InboxPage scope={scope} queue={loaded === scope ? queue : null} />,
    document.body,
  );
}

function InboxPage({
  scope,
  queue,
}: {
  scope: InboxScope;
  queue: ReviewQueue | null;
}) {
  const counts = useSidebarCounts();
  const total = queue?.ids.length ?? 0;
  const position = queue ? Math.min(queue.index + 1, total) : 0;
  const remaining = scope === "snoozed" ? counts.inboxSnoozed : counts.inbox;

  const ids = queue?.ids;
  useEffect(() => {
    if (ids) void ensureSaves(ids).catch(() => {});
  }, [ids]);

  return (
    <div className={styles.page}>
      <TitleBar.Root className={styles.bar}>
        <TitleBar.Title>
          <TitleBar.Label>
            {scope === "snoozed" ? "Snoozed" : "Inbox"}
          </TitleBar.Label>
        </TitleBar.Title>
        <TitleBar.End className={styles.end}>
          <Tooltip label="Close" shortcut={<Keyboard.Key>Esc</Keyboard.Key>}>
            <Button
              icon
              size="sm"
              variant="ghost"
              aria-label="Close Inbox"
              onClick={leaveInbox}
            >
              <IconXmark />
            </Button>
          </Tooltip>
        </TitleBar.End>
      </TitleBar.Root>
      {total > 0 ? (
        <p className={styles.progress} aria-live="polite">
          {position} / {total}
        </p>
      ) : null}
      {queue === null ? (
        <div className={styles.center}>
          <Loader.Spinner />
        </div>
      ) : total === 0 ? (
        <div className={styles.center}>
          <Empty.Root role="status">
            <Empty.Media>
              <IconCircleCheckFill size={32} />
            </Empty.Media>
            <Empty.Title>
              {scope === "snoozed" ? "Nothing snoozed" : "You're all caught up"}
            </Empty.Title>
            <Empty.Description>
              {scope === "snoozed"
                ? "Snoozed saves come back to Needs Review when their time is up."
                : "New saves land here for review."}
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
