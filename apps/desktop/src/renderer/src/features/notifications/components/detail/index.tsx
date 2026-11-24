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
import { openSettings } from "@/shared/lib/open-settings";
import { formatSnoozeTime, snoozeOptions } from "@/shared/lib/snooze";
import { isSnoozed, isUnread, notifications } from "../../state/notifications";
import { NotificationIcon, notificationTone } from "../notification-icon";
import { ignoresKey, navigationKey } from "./keys";
import { Detail } from "./layout";

function PrimaryAction({ target }: { target: NotificationTarget | undefined }) {
  switch (target?.type) {
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
  /** Moves the selection off this notification before it leaves the Inbox list. */
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
  const { id, target } = notification;
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
    if (ignoresKey(event)) return;
    const handled = (() => {
      switch (event.code) {
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
        default:
          return navigationKey(event, onStep, onClose);
      }
    })();
    if (handled) event.preventDefault();
  }

  return (
    <Detail.Root
      ref={ref}
      aria-label={notification.title}
      onKeyDown={onKeyDown}
    >
      <Detail.Header tone={notificationTone(notification.kind)}>
        <Detail.Icon>
          <NotificationIcon kind={notification.kind} size={18} />
        </Detail.Icon>
        <Detail.Title>{notification.title}</Detail.Title>
        <Detail.Time at={notification.updatedAt} />
      </Detail.Header>
      {notification.body ? (
        <Detail.Summary>{notification.body}</Detail.Summary>
      ) : null}
      {notification.snoozedUntil !== undefined ? (
        <Detail.Status>
          Snoozed until {formatSnoozeTime(notification.snoozedUntil)}
        </Detail.Status>
      ) : null}
      <Detail.Actions>
        <PrimaryAction target={target} />
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
          <Tooltip label="Snooze" shortcut={<Keyboard.Cluster keys={["H"]} />}>
            <Menu.Trigger ref={snoozeRef} size="sm" variant="secondary">
              <IconCircleDashedClock size={12} />
              Snooze
            </Menu.Trigger>
          </Tooltip>
        </SpecMenu>
        <Tooltip label="Delete" shortcut={<Keyboard.Cluster keys={["⌫"]} />}>
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
      </Detail.Actions>
    </Detail.Root>
  );
}
