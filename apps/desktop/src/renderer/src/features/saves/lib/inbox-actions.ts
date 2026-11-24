import type { BulkEdit } from "@shared/bulk-contracts";
import { bulkMutation } from "@/features/saves/lib/mutate";
import { pool } from "@/features/saves/state/pool";
import type { Save } from "@/features/saves/types";
import { errorCopy } from "@/shared/lib/error-copy";
import { formatPlural } from "@/shared/lib/format";
import { formatSnoozeTime } from "@/shared/lib/snooze";
import { notify } from "@/shared/lib/toast";
import { notifyUndoable } from "@/shared/lib/undo-toast";

const SAVES = { one: "save", other: "saves" };
const TOAST_ID = "inbox-change";

interface InboxChange {
  operation: BulkEdit["operation"];
  title: (saves: string) => string;
  failure?: string;
  onUndo?: () => void;
}

export function isWaitingInInbox(save: Pick<Save, "inboxState">): boolean {
  return save.inboxState === "review" || save.inboxState === "snoozed";
}

export function waitingInInbox(ids: readonly string[]): string[] {
  return ids.filter((id) => {
    const save = pool.get(id);
    return save != null && !save.deletedAt && isWaitingInInbox(save);
  });
}

async function changeInbox(
  ids: readonly string[],
  {
    operation,
    title,
    failure = "Couldn't update the Inbox",
    onUndo,
  }: InboxChange,
): Promise<number> {
  if (ids.length === 0) return 0;
  try {
    const { changed, undoId } = await bulkMutation(ids, operation);
    if (changed > 0)
      notifyUndoable({
        id: TOAST_ID,
        title: title(formatPlural(changed, SAVES)),
        undoneTitle: "Inbox change undone",
        subject: "Inbox change",
        step: undoId,
        onUndo,
      });
    return changed;
  } catch (error) {
    notify({
      id: TOAST_ID,
      title: failure,
      description: errorCopy(error, "Try again."),
    });
    return 0;
  }
}

export function markProcessed(
  ids: readonly string[],
  onUndo?: () => void,
): Promise<number> {
  return changeInbox(ids, {
    operation: { kind: "inbox", state: "processed" },
    title: (saves) => `Marked ${saves} processed`,
    onUndo,
  });
}

export function addToInbox(ids: readonly string[]): Promise<number> {
  return changeInbox(ids, {
    operation: { kind: "inbox", state: "review" },
    title: (saves) => `Added ${saves} to Inbox`,
  });
}

export function removeFromInbox(ids: readonly string[]): Promise<number> {
  return changeInbox(ids, {
    operation: { kind: "inbox", state: null },
    title: (saves) => `Removed ${saves} from Inbox`,
  });
}

export function snoozeSaves(
  ids: readonly string[],
  until: number,
): Promise<number> {
  const time = formatSnoozeTime(until);
  return changeInbox(ids, {
    operation: { kind: "snooze", until },
    title: (saves) => `Snoozed ${saves} until ${time}`,
  });
}

export function trashWithUndo(
  ids: readonly string[],
  onUndo?: () => void,
): Promise<number> {
  return changeInbox(ids, {
    operation: { kind: "trash" },
    title: (saves) => `Moved ${saves} to Trash`,
    failure: "Couldn't move to Trash",
    onUndo,
  });
}
