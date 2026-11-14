import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import {
  advanceQueue,
  type ReviewOutcome,
  type ReviewQueue,
  rewindQueue,
  startQueue,
  stepBack,
} from "@/features/library/lib/review-queue";
import { resultNavigation } from "@/features/saves/navigation";

const store = new Store<ReviewQueue | null>(null);

/** The queue is fixed when Review opens, so Saves leaving the Inbox mid-review never reshuffle it. */
export const inboxReview = {
  async start(): Promise<void> {
    const ids = await resultNavigation.ids();
    if (ids.length > 0) store.setState(() => startQueue(ids));
  },
  exit(): void {
    store.setState(() => null);
  },
  advance(outcome: ReviewOutcome): void {
    store.setState((queue) => (queue ? advanceQueue(queue, outcome) : queue));
  },
  back(): void {
    store.setState((queue) => (queue ? stepBack(queue) : queue));
  },
  rewind(id: string): void {
    store.setState((queue) => (queue ? rewindQueue(queue, id) : queue));
  },
};

export function useInboxReview(): ReviewQueue | null {
  return useSelector(store, (queue) => queue);
}
