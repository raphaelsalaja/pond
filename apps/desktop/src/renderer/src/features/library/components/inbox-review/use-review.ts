import { isHTMLElement, isHTMLTag } from "@pond/ui/dom";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useReviewFolders } from "@/features/library/components/inbox-review/collections";
import type { FolderChoice } from "@/features/library/components/inbox-review/collections";
import {
  currentReviewId,
  reviewKey,
} from "@/features/library/lib/review-queue";
import type {
  ReviewOutcome,
  ReviewQueue,
} from "@/features/library/lib/review-queue";
import { inboxReview } from "@/features/library/state/inbox-review";
import {
  assignSavesToFolder,
  markProcessed,
  selectOnlySave,
  trashWithUndo,
} from "@/features/saves";
import { openSave } from "@/features/saves/navigation";
import { useSave } from "@/features/saves/pool";
import { isEditableTarget } from "@/shared/lib/editable-target";
import { matchesShortcut, useShortcutBindings } from "@/shared/lib/shortcuts";

/** Pointer velocity in px/s at release; zero when a key or button decided. */
export interface Fling {
  x: number;
  y: number;
}

export interface Departure {
  outcome: ReviewOutcome;
  fling: Fling;
}

const STILL: Fling = { x: 0, y: 0 };

export function useReview(
  queue: ReviewQueue,
  onExit: () => void,
  onStep: (by: 1 | -1) => void,
) {
  const ref = useRef<HTMLDivElement>(null);
  const id = currentReviewId(queue);
  const save = useSave(id);
  const slots = useReviewFolders();
  const [choosing, setChoosing] = useState(false);
  const [departure, setDeparture] = useState<Departure | null>(null);
  useShortcutBindings();

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (id) {
      selectOnlySave(id);
    }
  }, [id]);

  /** A disabled or unmounted control drops focus to the body, where the grid's keys would take over. */
  useEffect(() => {
    const active = document.activeElement;
    if (queue.index >= 0 && (!active || active === document.body)) {
      ref.current?.focus({ preventScroll: true });
    }
  }, [queue.index]);

  /** The toast's Undo button takes focus, so the stage reclaims it to keep the review keys working. */
  function rewindTo(saveId: string) {
    return () => {
      setDeparture(null);
      inboxReview.rewind(saveId);
      ref.current?.focus({ preventScroll: true });
    };
  }

  function advance(outcome: ReviewOutcome, fling: Fling) {
    setDeparture({ outcome, fling });
    inboxReview.advance(outcome);
  }

  const actions = {
    keep: (fling = STILL) => {
      if (!id) {
        return;
      }
      void markProcessed([id], rewindTo(id));
      advance("keep", fling);
    },
    trash: (fling = STILL) => {
      if (!id) {
        return;
      }
      void trashWithUndo([id], rewindTo(id));
      advance("trash", fling);
    },
    skip: (fling = STILL) => {
      if (id) {
        advance("skip", fling);
      }
    },
    file: (folder: FolderChoice) => {
      if (!id) {
        return;
      }
      setChoosing(false);
      void assignSavesToFolder([id], folder, rewindTo(id));
      advance("collection", STILL);
    },
    back: () => {
      setDeparture(null);
      inboxReview.back();
    },
    preview: () => {
      if (id) {
        openSave(id);
      }
    },
  };

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const target = event.target;
    if (!isHTMLElement(target)) {
      return;
    }
    if (!ref.current?.contains(target) || isEditableTarget(target)) {
      return;
    }
    if (matchesShortcut(event.nativeEvent, "save.mark-processed")) {
      event.preventDefault();
      actions.keep();
      return;
    }
    const key = reviewKey(event, {
      fromButton: isHTMLTag(target, "button"),
    });
    if (!key) {
      return;
    }
    event.preventDefault();
    if (key.kind === "exit") {
      onExit();
    } else if (key.kind === "back") {
      actions.back();
    } else if (key.kind === "step") {
      onStep(key.by);
    } else if (!id) {
      return;
    } else if (key.kind === "trash") {
      actions.trash();
    } else if (key.kind === "keep") {
      actions.keep();
    } else if (key.kind === "skip") {
      actions.skip();
    } else if (key.kind === "choose-folder") {
      setChoosing(true);
    } else if (key.kind === "preview") {
      actions.preview();
    } else if (key.kind === "folder") {
      const folder = slots[key.slot];
      if (folder) {
        actions.file(folder);
      }
    }
  }

  return {
    ref,
    id,
    save,
    choosing,
    setChoosing,
    departure,
    actions,
    onKeyDown,
  };
}

/** The deck keeps the stage ref; cards and actions only get the review state. */
export type Review = Omit<ReturnType<typeof useReview>, "ref">;
