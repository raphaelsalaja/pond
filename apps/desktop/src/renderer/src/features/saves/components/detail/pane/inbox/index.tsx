import {
  IconCircleCheck,
  IconCircleDashedClock,
  IconInboxMinus,
} from "@pond/icons";
import { Button, Menu, Tooltip } from "@pond/ui";
import {
  isWaitingInInbox,
  markProcessed,
  removeFromInbox,
} from "@/features/saves/lib/inbox-actions";
import { buildSnoozeItems } from "@/features/saves/lib/menu/inbox";
import { formatSnoozeTime } from "@/features/saves/lib/snooze";
import type { Save } from "@/features/saves/types";
import { Section } from "@/shared/components/inspector-section";
import { ShortcutKeys } from "@/shared/components/shortcut-keys";
import { SpecMenu } from "@/shared/components/spec-context-menu";
import { formatPlural } from "@/shared/lib/format";
import styles from "./styles.module.css";

const SAVES = { one: "save", other: "saves" };

function status(waiting: readonly Save[]): string {
  const [first] = waiting;
  if (waiting.length > 1)
    return `${formatPlural(waiting.length, SAVES)} in the Inbox`;
  if (first?.inboxState === "snoozed" && first.inboxUntil)
    return `Snoozed until ${formatSnoozeTime(first.inboxUntil)}`;
  return first?.inboxState === "snoozed" ? "Snoozed" : "Needs review";
}

/** Folders, tags, and notes stay in their own sections, so assigning them never decides processing. */
export function InboxSection({ saves }: { saves: readonly Save[] }) {
  const waiting = saves.filter(
    (save) => !save.deletedAt && isWaitingInInbox(save),
  );
  if (waiting.length === 0) return null;
  const ids = waiting.map((save) => save.id);
  return (
    <Section title="Inbox" collapsible={false}>
      <div className={styles.inbox}>
        <p className={styles.status}>{status(waiting)}</p>
        <div className={styles.actions}>
          <Tooltip
            label="Mark Processed"
            shortcut={<ShortcutKeys id="save.mark-processed" />}
          >
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void markProcessed(ids)}
            >
              <IconCircleCheck size={12} />
              Mark Processed
            </Button>
          </Tooltip>
          <SpecMenu buildItems={() => buildSnoozeItems(ids)}>
            <Tooltip
              label="Snooze"
              shortcut={<ShortcutKeys id="save.snooze" />}
            >
              <Menu.Trigger size="sm" variant="secondary">
                <IconCircleDashedClock size={12} />
                Snooze
              </Menu.Trigger>
            </Tooltip>
          </SpecMenu>
          <Tooltip label="Remove from Inbox">
            <Button
              icon
              size="sm"
              variant="ghost"
              aria-label="Remove from Inbox"
              onClick={() => void removeFromInbox(ids)}
            >
              <IconInboxMinus size={12} />
            </Button>
          </Tooltip>
        </div>
      </div>
    </Section>
  );
}
