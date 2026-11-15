import type { WireUndoState, WireUndoStepState } from "@shared/wire";
import {
  closeNotification,
  notify,
  TOAST_TIMEOUT_MS,
  updateNotification,
} from "@/shared/lib/toast";

export interface UndoStepHistory {
  undoStep(step: string): Promise<WireUndoStepState>;
  redoStep(step: string): Promise<WireUndoStepState>;
}

export interface UndoToastOptions {
  id: string;
  title: string;
  undoneTitle: string;
  subject: string;
  /** Null when the change recorded no Undo step, so the toast confirms it without offering Undo. */
  step: string | null;
  onChange?(): void | Promise<void>;
}

type Direction = "undo" | "redo";

interface LiveUndo {
  step: string;
  settle(direction: Direction, done: boolean): Promise<void>;
}

let latest: string | null = null;
let live: LiveUndo | null = null;

function replaceLatest(): void {
  if (latest) closeNotification(latest);
  latest = null;
  live = null;
}

/** Shows a change with an Undo that reverses only its own step, then offers Redo; one such toast is live at a time. */
export function notifyUndoable(
  options: UndoToastOptions,
  history: UndoStepHistory = window.pond,
): string {
  replaceLatest();
  if (!options.step) {
    latest = notify({ id: options.id, title: options.title });
    return latest;
  }
  return present(options.step, options, history);
}

function present(
  step: string,
  options: UndoToastOptions,
  history: UndoStepHistory,
): string {
  const id = notify({
    id: options.id,
    title: options.title,
    action: { label: "Undo", onClick: () => void run("undo") },
    onClose: () => {
      if (latest !== id) return;
      latest = null;
      live = null;
    },
  });
  latest = id;

  function show(
    title: string,
    direction: Direction | null,
    { description = "", pending = false } = {},
  ) {
    updateNotification({
      id,
      title,
      description,
      timeout: pending ? 0 : TOAST_TIMEOUT_MS,
      action: direction
        ? {
            label: direction === "undo" ? "Undo" : "Redo",
            disabled: pending,
            onClick: () => void run(direction),
          }
        : undefined,
    });
  }

  let busy = false;
  async function run(direction: Direction) {
    if (busy) return;
    busy = true;
    const current = direction === "undo" ? options.title : options.undoneTitle;
    show(current, direction, { pending: true });
    let outcome: WireUndoStepState["outcome"];
    try {
      outcome = (
        direction === "undo"
          ? await history.undoStep(step)
          : await history.redoStep(step)
      ).outcome;
    } catch {
      outcome = "failed";
    } finally {
      busy = false;
    }
    if (outcome === "stale")
      show(`Can't ${direction} ${options.subject}`, null, {
        description: "Other changes came after it.",
      });
    else await settle(direction, outcome === "done");
  }

  async function settle(direction: Direction, done: boolean) {
    if (!done) {
      show(`Couldn't ${direction} ${options.subject}`, direction, {
        description: "Try again.",
      });
      return;
    }
    show(
      direction === "undo" ? options.undoneTitle : options.title,
      direction === "undo" ? "redo" : "undo",
    );
    await options.onChange?.();
  }

  live = { step, settle };
  return id;
}

/** Mirrors a global Undo or Redo onto the live toast when it reversed that toast's step; `null` means the call itself failed. */
export function reflectHistoryChange(
  direction: Direction,
  result: Pick<WireUndoState, "ok" | "step"> | null,
): void {
  if (result?.step && live?.step === result.step) {
    void live.settle(direction, result.ok);
    return;
  }
  replaceLatest();
  if (result?.ok) {
    latest = notify({
      id: "undo-history",
      title: direction === "undo" ? "Last change undone" : "Last change redone",
    });
    return;
  }
  if (result?.step === null) {
    latest = notify({
      id: "undo-history",
      title: direction === "undo" ? "Nothing to undo" : "Nothing to redo",
    });
    return;
  }
  latest = notify({
    id: "undo-history",
    title: `Couldn't ${direction} the last change`,
    description: "Try again.",
  });
}
