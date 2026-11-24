import type { NotificationPost } from "@shared/notification-contracts";
import log from "electron-log/renderer";

/** Secondary windows and unit tests run without the preload bridge, so posting is skipped there. */
function bridged(): boolean {
  return "pond" in globalThis;
}

export function postNotification(post: NotificationPost): void {
  if (!bridged()) {
    return;
  }
  void window.pond
    .query("notifications.post", post)
    .catch((cause: unknown) => {
      log.warn("[pond notifications] posting a notification failed", cause);
    });
}

export function activityNotificationId(): string {
  return `activity:${crypto.randomUUID()}`;
}
