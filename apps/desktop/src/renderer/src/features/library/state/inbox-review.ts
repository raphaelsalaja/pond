import { EMPTY_QUERY } from "@pond/schema/filters/types";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import {
  advanceQueue,
  jumpQueue,
  type ReviewOutcome,
  type ReviewQueue,
  rewindQueue,
  startQueue,
  stepBack,
} from "@/features/library/lib/review-queue";

export type InboxScope = "review" | "snoozed";

interface InboxReviewState {
  scope: InboxScope;
  queue: ReviewQueue;
}

const QUEUE_LIMIT = 500;

const store = new Store<InboxReviewState | null>(null);
let request = 0;

function update(next: (queue: ReviewQueue) => ReviewQueue): void {
  store.setState((state) =>
    state ? { ...state, queue: next(state.queue) } : state,
  );
}

/** The queue is fixed when the Inbox opens, so Saves leaving it mid-review never reshuffle it. */
export const inboxReview = {
  async start(scope: InboxScope): Promise<void> {
    const ticket = ++request;
    const page = await window.pond.query("saves.queryPage", {
      query: EMPTY_QUERY,
      scope: { inbox: scope },
      limit: QUEUE_LIMIT,
    });
    if (ticket !== request) return;
    store.setState(() => ({ scope, queue: startQueue(page.ids) }));
  },
  exit(): void {
    request += 1;
    store.setState(() => null);
  },
  advance(outcome: ReviewOutcome): void {
    update((queue) => advanceQueue(queue, outcome));
  },
  back(): void {
    update(stepBack);
  },
  jump(index: number): void {
    update((queue) => jumpQueue(queue, index));
  },
  rewind(id: string): void {
    update((queue) => rewindQueue(queue, id));
  },
};

export function useInboxReview(): ReviewQueue | null {
  return useSelector(store, (state) => state?.queue ?? null);
}

export function useInboxReviewScope(): InboxScope | null {
  return useSelector(store, (state) => state?.scope ?? null);
}
