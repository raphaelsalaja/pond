import {
  IconCircleDashedClock,
  IconEnvelope,
  IconInbox,
  IconTrash,
} from "@pond/icons";
import { Button, Keyboard, Menu, type MenuItemSpec, Tooltip } from "@pond/ui";
import type {
  InboxNotification,
  NotificationTarget,
} from "@shared/notification-contracts";
import { createElement, type KeyboardEvent, useEffect, useRef } from "react";
import { openSave } from "@/features/saves/navigation";
import { SpecMenu } from "@/shared/components/spec-context-menu";
import { isEditableTarget } from "@/shared/lib/editable-target";
import { openSettings } from "@/shared/lib/open-settings";
import { relativeTimeFromMs } from "@/shared/lib/relative-time";
import { formatSnoozeTime, snoozeOptions } from "@/shared/lib/snooze";
import {
  announcements,
  useAnnouncementOpenable,
} from "@/shared/state/announcements";
import {
  isSnoozed,
  isUnread,
  notifications,
} from "../../state/notifications";
import { NotificationIcon, notificationTone } from "../notification-icon";
import { HealthAction } from "./health-action";
import styles from "./styles.module.css";

function AnnouncementAction({ id }: { id: string }) {
  const openable = useAnnouncementOpenable(id);
  return openable ? (
    <Button size="sm" variant="primary" onClick={() => announcements.open(id)}>
      Open
    </Button>
  ) : null;
}

function PrimaryAction({ target }: { target: NotificationTarget | undefined }) {
  switch (target?.type) {
    case "health":
      return <HealthAction categoryId={target.categoryId} />;
    case "announcement":
      return <AnnouncementAction id={target.id} />;
    case "save":
      return (
        <Button
          size="sm"
          variant="primary"
          onClick={() => openSave(target.saveId)}
        >
          Open Save
        </Button>
      );
    case "settings":
      return (
        <Button
          size="sm"
          variant="primary"
          onClick={() => openSettings(target.section)}
        >
          Open Settings
        </Button>
      );
    default:
      return null;
  }
}

function snoozeItems(
  notification: InboxNotification,
  onLeave: () => void,
): MenuItemSpec[] {
  const snooze = (until: number | null) => {
    onLeave();
    notifications.snooze([notification.id], until);
  };
  const items = snoozeOptions().map(
    (option): MenuItemSpec => ({
      label: option.label,
      icon: createElement(IconCircleDashedClock),
      onClick: () => snooze(option.until),
    }),
  );
  if (isSnoozed(notification))
    items.push(
      { type: "separator" },
      {
        label: "Return to Inbox",
        icon: createElement(IconInbox),
        onClick: () => snooze(null),
      },
    );
  return items;
}

interface DetailProps {
  notification: InboxNotification;
  /** Moves the selection off this notification before it leaves the current tab. */
  onLeave: () => void;
  onStep: (by: 1 | -1) => void;
  onClose: () => void;
}

export function NotificationDetail({
  notification,
  onLeave,
  onStep,
  onClose,
}: DetailProps) {
  const ref = useRef<HTMLDivElement>(null);
  const snoozeRef = useRef<HTMLButtonElement>(null);
  const { id } = notification;
  const unread = isUnread(notification);

  /** Opening marks it read once; U afterwards can still set it back to unread. */
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    const item = notifications.find(id);
    if (item && isUnread(item)) notifications.markRead([id], true);
  }, [id]);

  function remove() {
    onLeave();
    notifications.remove([id]);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey) return;
    if (isEditableTarget(event.target)) return;
    const handled = (() => {
      switch (event.code) {
        case "KeyJ":
        case "ArrowDown":
          onStep(1);
          return true;
        case "KeyK":
        case "ArrowUp":
          onStep(-1);
          return true;
        case "KeyU":
          if (event.altKey) notifications.markAllRead();
          else notifications.markRead([id], unread);
          return true;
        case "KeyH":
          snoozeRef.current?.click();
          return true;
        case "Backspace":
        case "Delete":
          if (event.shiftKey) {
            if (!unread) onLeave();
            notifications.removeRead();
          } else remove();
          return true;
        case "Escape":
          onClose();
          return true;
        default:
          return false;
      }
    })();
    if (handled) event.preventDefault();
  }

  return (
    <div
      ref={ref}
      className={styles.detail}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <article
        className={styles.card}
        data-tone={notificationTone(notification.kind)}
      >
        <header className={styles.head}>
          <span className={styles.icon}>
            <NotificationIcon kind={notification.kind} size={18} />
          </span>
          <h2 className={styles.title}>{notification.title}</h2>
          <time
            className={styles.time}
            dateTime={new Date(notification.updatedAt).toISOString()}
          >
            {relativeTimeFromMs(notification.updatedAt)}
          </time>
        </header>
        {notification.body ? (
          <p className={styles.body}>{notification.body}</p>
        ) : null}
        {notification.snoozedUntil !== undefined ? (
          <p className={styles.status}>
            Snoozed until {formatSnoozeTime(notification.snoozedUntil)}
          </p>
        ) : null}
        <div className={styles.actions}>
          <PrimaryAction target={notification.target} />
          <Tooltip
            label={unread ? "Mark Read" : "Mark Unread"}
            shortcut={<Keyboard.Cluster keys={["U"]} />}
          >
            <Button
              size="sm"
              variant="secondary"
              onClick={() => notifications.markRead([id], unread)}
            >
              <IconEnvelope size={12} />
              {unread ? "Mark Read" : "Mark Unread"}
            </Button>
          </Tooltip>
          <SpecMenu buildItems={() => snoozeItems(notification, onLeave)}>
            <Tooltip
              label="Snooze"
              shortcut={<Keyboard.Cluster keys={["H"]} />}
            >
              <Menu.Trigger ref={snoozeRef} size="sm" variant="secondary">
                <IconCircleDashedClock size={12} />
                Snooze
              </Menu.Trigger>
            </Tooltip>
          </SpecMenu>
          <Tooltip
            label="Delete"
            shortcut={<Keyboard.Cluster keys={["⌫"]} />}
          >
            <Button
              icon
              size="sm"
              variant="ghost"
              aria-label="Delete"
              onClick={remove}
            >
              <IconTrash size={12} />
            </Button>
          </Tooltip>
        </div>
      </article>
    </div>
  );
}
