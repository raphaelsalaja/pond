import {
  IconChevronLeft,
  IconChevronRight,
  IconCircleCheck,
  IconExpand,
  IconSidebarRight,
  IconTrash,
  IconXmark,
} from "@pond/icons";
import { Button, Keyboard, Toggle } from "@pond/ui";
import { type MouseEvent, useEffect, useId, useRef, useState } from "react";
import { ReviewCard } from "@/features/library/components/inbox-review/card";
import {
  CHOOSE_FOLDER_TARGET,
  type FolderChoice,
  folderTarget,
  ReviewCollections,
  useReviewFolders,
} from "@/features/library/components/inbox-review/collections";
import { ReviewFinished } from "@/features/library/components/inbox-review/finished";
import { ReviewTarget } from "@/features/library/components/inbox-review/target";
import { useSidebarCounts } from "@/features/library/hooks/use-sidebar-counts";
import {
  currentReviewId,
  type ReviewOutcome,
  type ReviewQueue,
  reviewKey,
} from "@/features/library/lib/review-queue";
import {
  inboxReview,
  useInboxReview,
} from "@/features/library/state/inbox-review";
import {
  libraryChrome,
  useDetailsOpen,
  useLibraryNav,
} from "@/features/library/state/library-chrome";
import {
  assignSavesToFolder,
  markProcessed,
  selectOnlySave,
  trashWithUndo,
} from "@/features/saves";
import { openSave } from "@/features/saves/navigation";
import { ensureSaves, useSave } from "@/features/saves/pool";
import { isEditableTarget } from "@/shared/lib/editable-target";
import { IS_MAC } from "@/shared/lib/platform";
import {
  matchesShortcut,
  shortcutGlyphs,
  useShortcutBindings,
} from "@/shared/lib/shortcuts";
import styles from "./styles.module.css";

type Input = "pointer" | "keyboard";

/** Enter and Space on a focused button report a click with no pointer detail. */
function inputOf(event: MouseEvent): Input {
  return event.detail === 0 ? "keyboard" : "pointer";
}

export function InboxReview() {
  const queue = useInboxReview();
  const nav = useLibraryNav();
  const inInbox = nav.kind === "inbox" && !nav.snoozed;
  useEffect(() => {
    if (!inInbox) inboxReview.exit();
  }, [inInbox]);
  return queue && inInbox ? <ReviewStage queue={queue} /> : null;
}

function ReviewStage({ queue }: { queue: ReviewQueue }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const instructionsId = useId();
  const id = currentReviewId(queue);
  const save = useSave(id);
  const slots = useReviewFolders();
  const counts = useSidebarCounts();
  const detailsOpen = useDetailsOpen();
  const [over, setOver] = useState<string | null>(null);
  const [input, setInput] = useState<Input>("keyboard");
  const [choosing, setChoosing] = useState(false);
  useShortcutBindings();
  const keepKey = shortcutGlyphs("save.mark-processed").join("");

  useEffect(() => {
    stageRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!id) return;
    void ensureSaves([id]).catch(() => {});
    selectOnlySave(id);
  }, [id]);

  /** A disabled or unmounted control drops focus to the body, where the grid's keys would take over. */
  useEffect(() => {
    const active = document.activeElement;
    if (queue.index >= 0 && (!active || active === document.body))
      stageRef.current?.focus();
  }, [queue.index]);

  function advance(outcome: ReviewOutcome, from: Input) {
    setInput(from);
    inboxReview.advance(outcome);
  }

  function keep(from: Input) {
    if (!id) return;
    void markProcessed([id], () => inboxReview.rewind(id));
    advance("keep", from);
  }

  function trash(from: Input) {
    if (!id) return;
    void trashWithUndo([id], () => inboxReview.rewind(id));
    advance("trash", from);
  }

  function file(folder: FolderChoice, from: Input) {
    if (!id) return;
    void assignSavesToFolder([id], folder, () => inboxReview.rewind(id));
    advance("collection", from);
  }

  function back() {
    setInput("keyboard");
    inboxReview.back();
  }

  function preview() {
    if (id) openSave(id);
  }

  function drop(target: string) {
    if (target === "keep") keep("pointer");
    else if (target === "trash") trash("pointer");
    else if (target === CHOOSE_FOLDER_TARGET) setChoosing(true);
    else {
      const folder = slots.find((slot) => folderTarget(slot.id) === target);
      if (folder) file(folder, "pointer");
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!stageRef.current?.contains(target) || isEditableTarget(target)) return;
    if (matchesShortcut(event.nativeEvent, "save.mark-processed")) {
      event.preventDefault();
      keep("keyboard");
      return;
    }
    const key = reviewKey(event, {
      fromButton: target instanceof HTMLButtonElement,
    });
    if (!key) return;
    event.preventDefault();
    if (key.kind === "trash") trash("keyboard");
    else if (key.kind === "skip" && id) advance("skip", "keyboard");
    else if (key.kind === "back") back();
    else if (key.kind === "choose-folder" && id) setChoosing(true);
    else if (key.kind === "preview") preview();
    else if (key.kind === "details") libraryChrome.toggleDetails();
    else if (key.kind === "exit") inboxReview.exit();
    else if (key.kind === "folder") {
      const folder = slots[key.slot];
      if (folder) file(folder, "keyboard");
    }
  }

  const total = queue.ids.length;
  return (
    <div
      ref={stageRef}
      className={styles.stage}
      role="application"
      aria-label="Review Inbox"
      aria-describedby={instructionsId}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <span id={instructionsId} className={styles.instructions}>
        Drag the save onto a target, or press {keepKey} to keep, Delete to move
        it to the Trash, 1 to 4 to file it, and F to choose a folder. The arrow
        keys skip or go back, and Escape exits.
      </span>
      <header className={styles.bar}>
        <p className={styles.progress} aria-live="polite">
          {Math.min(queue.index + 1, total)} of {total}
        </p>
        <div className={styles.tools}>
          <Toggle
            size="sm"
            variant="outline"
            pressed={detailsOpen}
            onPressedChange={(pressed) => libraryChrome.setDetailsOpen(pressed)}
          >
            <IconSidebarRight size={12} />
            Details
            <Keyboard.Shortcut density="inline">I</Keyboard.Shortcut>
          </Toggle>
          <Button
            size="sm"
            variant="secondary"
            disabled={!id}
            onClick={preview}
          >
            <IconExpand size={12} />
            Open Preview
            <Keyboard.Shortcut density="inline">Space</Keyboard.Shortcut>
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => inboxReview.exit()}
          >
            <IconXmark size={12} />
            Exit
            <Keyboard.Shortcut density="inline">Esc</Keyboard.Shortcut>
          </Button>
        </div>
      </header>
      {id ? (
        <>
          <div className={styles.deck}>
            <ReviewTarget
              target="trash"
              tone="trash"
              over={over === "trash"}
              icon={<IconTrash size={24} />}
              label="Trash"
              hint={IS_MAC ? "⌫" : "Del"}
              onClick={(event) => trash(inputOf(event))}
            />
            <Button
              icon
              variant="secondary"
              aria-label="Previous Save"
              disabled={queue.index === 0}
              onClick={back}
            >
              <IconChevronLeft />
            </Button>
            <ReviewCard
              key={id}
              save={save}
              fadeIn={input === "pointer"}
              onOver={setOver}
              onDrop={drop}
              onOpen={preview}
            />
            <Button
              icon
              variant="secondary"
              aria-label="Skip"
              onClick={(event) => advance("skip", inputOf(event))}
            >
              <IconChevronRight />
            </Button>
            <ReviewTarget
              target="keep"
              tone="keep"
              over={over === "keep"}
              icon={<IconCircleCheck size={24} />}
              label="Keep"
              hint={keepKey}
              onClick={(event) => keep(inputOf(event))}
            />
          </div>
          <ReviewCollections
            saveId={id}
            slots={slots}
            over={over}
            choosing={choosing}
            onChoosingChange={setChoosing}
            onFile={(folder) => file(folder, "pointer")}
          />
        </>
      ) : (
        <div className={styles.finished}>
          <ReviewFinished
            queue={queue}
            remaining={counts.inbox}
            onRestart={() => void inboxReview.start()}
            onExit={() => inboxReview.exit()}
          />
        </div>
      )}
    </div>
  );
}
