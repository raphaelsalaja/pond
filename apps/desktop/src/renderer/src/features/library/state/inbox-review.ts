import { EMPTY_QUERY } from "@pond/schema/filters/types";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import {
  advanceQueue,
  jumpQueue,
  rewindQueue,
  startQueue,
  stepBack,
} from "@/features/library/lib/review-queue";
import type {
  ReviewOutcome,
  ReviewQueue,
} from "@/features/library/lib/review-queue";

export type InboxScope = "review" | "snoozed";

interface InboxPicker {
  selected: string | null;
}

interface InboxReviewState {
  scope: InboxScope;
  queue: ReviewQueue;
}

const QUEUE_LIMIT = 500;

const store = new Store<InboxReviewState | null>(null);
const picker = new Store<InboxPicker>({ selected: null });
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
    inboxPicker.select(null);
  },
  advance(outcome: ReviewOutcome): void {
    update((queue) => advanceQueue(queue, outcome));
  },
  back(): void {
    update(stepBack);
  },
  jump(index: number): void {
    inboxPicker.select(null);
    update((queue) => jumpQueue(queue, index));
  },
  rewind(id: string): void {
    update((queue) => rewindQueue(queue, id));
  },
  /** Moves the deck to a Save the viewer reached, so closing the viewer shows that Save's card. */
  land(id: string): void {
    update((queue) => jumpQueue(queue, queue.ids.indexOf(id)));
  },
};

/** A selected notification or running-work row replaces the deck card in the Inbox pane until a Save is picked again. */
export const inboxPicker = {
  select(id: string | null): void {
    picker.setState((state) =>
      state.selected === id ? state : { selected: id },
    );
  },
  selected(): string | null {
    return picker.state.selected;
  },
};

export function useInboxSelection(): string | null {
  return useSelector(picker, (state) => state.selected);
}

export function useInboxReview(): ReviewQueue | null {
  return useSelector(store, (state) => state?.queue ?? null);
}

export function useInboxReviewScope(): InboxScope | null {
  return useSelector(store, (state) => state?.scope ?? null);
}
