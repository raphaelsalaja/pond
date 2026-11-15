import type { WireUndoStepState } from "@shared/wire";
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

let latest: string | null = null;

/** Shows a change with an Undo that reverses only its own step, then offers Redo; one such toast is live at a time. */
export function notifyUndoable(
  options: UndoToastOptions,
  history: UndoStepHistory = window.pond,
): string {
  if (latest) closeNotification(latest);
  const step = options.step;
  if (!step) {
    latest = null;
    return notify({ id: options.id, title: options.title });
  }
  const id = notify({
    id: options.id,
    title: options.title,
    action: { label: "Undo", onClick: () => void run("undo") },
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
    if (!step || busy) return;
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
    if (outcome === "done") {
      show(
        direction === "undo" ? options.undoneTitle : options.title,
        direction === "undo" ? "redo" : "undo",
      );
      await options.onChange?.();
    } else if (outcome === "stale") {
      show(`Can't ${direction} ${options.subject}`, null, {
        description: "Other changes came after it.",
      });
    } else {
      show(`Couldn't ${direction} ${options.subject}`, direction, {
        description: "Try again.",
      });
    }
  }

  return id;
}
