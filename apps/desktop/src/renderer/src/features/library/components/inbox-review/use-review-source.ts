import { useEffect } from "react";
import type { ReviewQueue } from "@/features/library/lib/review-queue";
import { inboxReview } from "@/features/library/state/inbox-review";
import type { InboxScope } from "@/features/library/state/inbox-review";
import { resultNavigation } from "@/features/saves/navigation";
import { onPoolDirty, pool } from "@/features/saves/pool";

/** Saves of the queue still waiting in this scope, in queue order. */
function queuedIds(
  ids: ReadonlyArray<string>,
  scope: InboxScope,
): Array<string> {
  return ids.filter((id) => {
    const save = pool.get(id);
    return save !== undefined && !save.deletedAt && save.inboxState === scope;
  });
}

/**
 * Makes the review queue the Save viewer's previous and next while Inbox review is on screen, and lands the deck
 * on the Save the viewer stepped to.
 * @remarks Only Saves still waiting are published, so processing or trashing the open Save moves the viewer to the next queued one.
 */
export function useReviewSource(
  scope: InboxScope | null,
  queue: ReviewQueue | null,
  openId: string | null,
): void {
  const ids = queue?.ids;

  useEffect(() => {
    if (!scope) return;
    /** Until the queue loads, the grid's last results would otherwise still answer previous and next. */
    if (!ids) {
      resultNavigation.clearSource();
      return;
    }
    const key = `inbox-review:${scope}`;
    let published: ReadonlyArray<string> | null = null;
    const publish = () => {
      const next = queuedIds(ids, scope);
      if (
        published?.length === next.length &&
        published.every((id, index) => id === next[index])
      ) {
        return;
      }
      published = next;
      resultNavigation.setSource({ key, ids: next, total: next.length });
    };
    publish();
    const stop = onPoolDirty(publish);
    return () => {
      stop();
      if (resultNavigation.key() === key) resultNavigation.clearSource();
    };
  }, [scope, ids]);

  /** The deck is unmounted under the viewer, so moving its place there shows nothing until the viewer closes. */
  useEffect(() => {
    if (!scope || !openId || !ids) return;
    if (queuedIds([openId], scope).length > 0) inboxReview.land(openId);
  }, [openId, ids, scope]);
}
