export type ReviewOutcome = "keep" | "trash" | "collection" | "skip";

export interface ReviewQueue {
  ids: readonly string[];
  index: number;
  outcomes: Readonly<Record<string, ReviewOutcome>>;
}

type ReviewKey =
  | { kind: "trash" }
  | { kind: "skip" }
  | { kind: "back" }
  | { kind: "folder"; slot: number }
  | { kind: "choose-folder" }
  | { kind: "preview" }
  | { kind: "details" }
  | { kind: "exit" };

export const REVIEW_FOLDER_SLOTS = 4;

export function startQueue(ids: readonly string[]): ReviewQueue {
  return { ids: [...new Set(ids)], index: 0, outcomes: {} };
}

export function currentReviewId(queue: ReviewQueue): string | null {
  return queue.ids[queue.index] ?? null;
}

export function advanceQueue(
  queue: ReviewQueue,
  outcome: ReviewOutcome,
): ReviewQueue {
  const id = currentReviewId(queue);
  if (!id) return queue;
  return {
    ...queue,
    index: queue.index + 1,
    outcomes: { ...queue.outcomes, [id]: outcome },
  };
}

/** Undo restores a Save's earlier state, so its card comes back with no outcome recorded. */
export function rewindQueue(queue: ReviewQueue, id: string): ReviewQueue {
  const index = queue.ids.indexOf(id);
  if (index < 0) return queue;
  const outcomes = Object.fromEntries(
    Object.entries(queue.outcomes).filter(([saveId]) => saveId !== id),
  );
  return { ...queue, index, outcomes };
}

export function stepBack(queue: ReviewQueue): ReviewQueue {
  return queue.index > 0 ? { ...queue, index: queue.index - 1 } : queue;
}

export function countOutcomes(queue: ReviewQueue) {
  const counts = { keep: 0, trash: 0, collection: 0, skip: 0 };
  for (const outcome of Object.values(queue.outcomes)) counts[outcome] += 1;
  return counts;
}

/** Space belongs to a focused button, so it opens the preview only from the stage itself. */
export function reviewKey(
  event: Pick<
    KeyboardEvent,
    "key" | "metaKey" | "ctrlKey" | "altKey" | "defaultPrevented"
  >,
  options: { fromButton: boolean },
): ReviewKey | null {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey)
    return null;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const slot = Number.parseInt(key, 10);
  if (slot >= 1 && slot <= REVIEW_FOLDER_SLOTS)
    return { kind: "folder", slot: slot - 1 };
  switch (key) {
    case "Backspace":
    case "Delete":
      return { kind: "trash" };
    case "ArrowRight":
      return { kind: "skip" };
    case "ArrowLeft":
      return { kind: "back" };
    case "f":
      return { kind: "choose-folder" };
    case "i":
      return { kind: "details" };
    case " ":
      return options.fromButton ? null : { kind: "preview" };
    case "Escape":
      return { kind: "exit" };
    default:
      return null;
  }
}
