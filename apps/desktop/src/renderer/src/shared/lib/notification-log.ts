import type { NotificationPost } from "@shared/notification-contracts";

/** Secondary windows and unit tests run without the preload bridge, so posting is skipped there. */
function bridged(): boolean {
  return "pond" in window;
}

export function postNotification(post: NotificationPost): void {
  if (!bridged()) return;
  void window.pond.query("notifications.post", post).catch(() => {});
}

export function resolveNotifications(ids: readonly string[]): void {
  if (!bridged() || ids.length === 0) return;
  void window.pond
    .query("notifications.resolve", { ids: [...ids] })
    .catch(() => {});
}

export function activityNotificationId(): string {
  return `activity:${crypto.randomUUID()}`;
}
