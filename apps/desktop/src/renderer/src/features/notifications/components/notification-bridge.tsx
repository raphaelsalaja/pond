import { useHydrateNotifications } from "../state/notifications";

/** Mounted once in the library window, so the log stays loaded. */
export function NotificationBridge() {
  useHydrateNotifications();
  return null;
}
