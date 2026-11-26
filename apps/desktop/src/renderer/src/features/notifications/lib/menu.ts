import {
  IconArrowUpRight,
  IconCircleDashedClock,
  IconCopy,
  IconEnvelope,
  IconInbox,
  IconSliders,
  IconTrash,
} from "@pond/icons";
import type { MenuItemSpec } from "@pond/ui";
import type { InboxNotification } from "@shared/notification-contracts";
import { createElement } from "react";
import { openSave } from "@/features/saves/navigation";
import { openSettings } from "@/shared/lib/open-settings";
import { snoozeOptions } from "@/shared/lib/snooze";
import { notify } from "@/shared/lib/toast";
import { isSnoozed, isUnread, notifications } from "../state/notifications";

export function snoozeItems(
  notification: InboxNotification,
  onLeave: () => void,
): Array<MenuItemSpec> {
  const snooze = (until: number | null) => {
    onLeave();
    notifications.snooze([notification.id], until);
  };
  const items = snoozeOptions().map((option): MenuItemSpec => ({
    label: option.label,
    icon: createElement(IconCircleDashedClock),
    onClick: () => snooze(option.until),
  }));
  if (isSnoozed(notification)) {
    items.push(
      { type: "separator" },
      {
        label: "Return to Inbox",
        icon: createElement(IconInbox),
        onClick: () => snooze(null),
      },
    );
  }
  return items;
}

function copyMessage(notification: InboxNotification): void {
  const text = [notification.title, notification.body]
    .filter(Boolean)
    .join("\n\n");
  void window.pond
    .query("clipboard.writeText", { text })
    .then(() => notify({ id: "copy-notification", title: "Message copied" }));
}

function openItem(notification: InboxNotification): MenuItemSpec | null {
  const { target } = notification;
  switch (target?.type) {
    case "save":
      return {
        label: "Open Save",
        icon: createElement(IconArrowUpRight),
        onClick: () => openSave(target.saveId),
      };
    case "settings":
      return {
        label: "Open Settings",
        icon: createElement(IconSliders),
        onClick: () => openSettings(target.section),
      };
    default:
      return null;
  }
}

/** The detail pane's actions for a Notification, as a menu for its Inbox row. */
export function buildNotificationMenuItems(
  notification: InboxNotification,
  /** Moves the selection off this Notification before it leaves the Inbox list. */
  onLeave: () => void,
): Array<MenuItemSpec> {
  const unread = isUnread(notification);
  const open = openItem(notification);
  return [
    ...(open ? [open, { type: "separator" as const }] : []),
    {
      label: unread ? "Mark Read" : "Mark Unread",
      icon: createElement(IconEnvelope),
      shortcut: "U",
      onClick: () => notifications.markRead([notification.id], unread),
    },
    {
      type: "submenu",
      label: "Snooze",
      icon: createElement(IconCircleDashedClock),
      items: snoozeItems(notification, onLeave),
    },
    {
      label: "Copy Message",
      icon: createElement(IconCopy),
      onClick: () => copyMessage(notification),
    },
    { type: "separator" },
    {
      label: "Delete",
      icon: createElement(IconTrash),
      variant: "destructive",
      shortcut: "⌫",
      onClick: () => {
        onLeave();
        notifications.remove([notification.id]);
      },
    },
  ];
}
