import type { BulkEdit } from "@shared/bulk-contracts";
import { bulkMutation } from "@/features/saves/lib/mutate";
import { formatSnoozeTime } from "@/features/saves/lib/snooze";
import { pool } from "@/features/saves/state/pool";
import type { Save } from "@/features/saves/types";
import { errorCopy } from "@/shared/lib/error-copy";
import { formatPlural } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";

const SAVES = { one: "save", other: "saves" };
const TOAST_ID = "inbox-change";

interface InboxChange {
  operation: BulkEdit["operation"];
  title: (saves: string) => string;
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
  { operation, title }: InboxChange,
): Promise<number> {
  if (ids.length === 0) return 0;
  try {
    const changed = await bulkMutation(ids, operation);
    if (changed > 0)
      notify({
        id: TOAST_ID,
        title: title(formatPlural(changed, SAVES)),
        action: {
          label: "Undo",
          onClick: () => {
            void window.pond.undo().then((result) => {
              if (!result.ok)
                notify({ id: TOAST_ID, title: "Couldn't undo Inbox change" });
            });
          },
        },
      });
    return changed;
  } catch (error) {
    notify({
      id: TOAST_ID,
      title: "Couldn't update the Inbox",
      description: errorCopy(error, "Try again."),
    });
    return 0;
  }
}

export function markProcessed(ids: readonly string[]): Promise<number> {
  return changeInbox(ids, {
    operation: { kind: "inbox", state: "processed" },
    title: (saves) => `Marked ${saves} processed`,
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
