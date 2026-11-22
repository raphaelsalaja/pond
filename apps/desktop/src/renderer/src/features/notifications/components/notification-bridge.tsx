import { useLiveHealthNotifications } from "../bridges/health";
import { useHydrateNotifications } from "../state/notifications";

/** Mounted once in the library window, so the log stays loaded and live health keeps posting. */
export function NotificationBridge() {
  useHydrateNotifications();
  useLiveHealthNotifications();
  return null;
}
