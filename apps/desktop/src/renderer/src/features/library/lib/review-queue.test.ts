import { describe, expect, it } from "vitest";
import {
  advanceQueue,
  countOutcomes,
  currentReviewId,
  reviewKey,
  rewindQueue,
  startQueue,
  stepBack,
} from "./review-queue";

const press = (key: string, modifiers: Partial<KeyboardEvent> = {}) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  defaultPrevented: false,
  ...modifiers,
});

describe("review queue", () => {
  it("walks the Saves in order and finishes after the last one", () => {
    let queue = startQueue(["a", "b", "a"]);
    expect(queue.ids).toEqual(["a", "b"]);
    expect(currentReviewId(queue)).toBe("a");
    queue = advanceQueue(queue, "keep");
    expect(currentReviewId(queue)).toBe("b");
    queue = advanceQueue(queue, "skip");
    expect(currentReviewId(queue)).toBeNull();
    expect(advanceQueue(queue, "trash")).toBe(queue);
  });

  it("steps back without forgetting what happened to each Save", () => {
    let queue = advanceQueue(startQueue(["a", "b"]), "collection");
    queue = stepBack(queue);
    expect(currentReviewId(queue)).toBe("a");
    expect(stepBack(queue)).toBe(queue);
    queue = advanceQueue(queue, "trash");
    queue = advanceQueue(queue, "skip");
    expect(countOutcomes(queue)).toEqual({
      keep: 0,
      trash: 1,
      collection: 0,
      skip: 1,
    });
  });

  it("rewinds to an undone Save and forgets its outcome", () => {
    let queue = advanceQueue(startQueue(["a", "b", "c"]), "keep");
    queue = advanceQueue(queue, "trash");
    queue = rewindQueue(queue, "a");
    expect(currentReviewId(queue)).toBe("a");
    expect(queue.outcomes).toEqual({ b: "trash" });
    expect(rewindQueue(queue, "missing")).toBe(queue);
  });
});

describe("review keys", () => {
  it("maps each action to its key", () => {
    const fromStage = { fromButton: false };
    expect(reviewKey(press("Backspace"), fromStage)).toEqual({ kind: "trash" });
    expect(reviewKey(press("Delete"), fromStage)).toEqual({ kind: "trash" });
    expect(reviewKey(press("ArrowRight"), fromStage)).toEqual({ kind: "skip" });
    expect(reviewKey(press("ArrowLeft"), fromStage)).toEqual({ kind: "back" });
    expect(reviewKey(press("2"), fromStage)).toEqual({
      kind: "folder",
      slot: 1,
    });
    expect(reviewKey(press("f"), fromStage)).toEqual({ kind: "choose-folder" });
    expect(reviewKey(press(" "), fromStage)).toEqual({ kind: "preview" });
    expect(reviewKey(press("Escape"), fromStage)).toEqual({ kind: "exit" });
  });

  it("leaves modified keys, extra slots, and Space on buttons alone", () => {
    const fromStage = { fromButton: false };
    expect(reviewKey(press("f", { metaKey: true }), fromStage)).toBeNull();
    expect(reviewKey(press("5"), fromStage)).toBeNull();
    expect(reviewKey(press("k"), fromStage)).toBeNull();
    expect(
      reviewKey(press("f", { defaultPrevented: true }), fromStage),
    ).toBeNull();
    expect(reviewKey(press(" "), { fromButton: true })).toBeNull();
  });
});
