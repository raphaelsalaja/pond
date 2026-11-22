import { join } from "node:path";
import { IPC } from "../../../shared/constants";
import type { NotificationEvent } from "../../../shared/notification-contracts";
import { broadcast } from "../../lib/broadcast";
import { appDataRoot } from "../../paths";
import { currentLibraryId } from "../prefs-scope";
import { createNotificationLog } from "./store";

export { capNotifications, createNotificationLog } from "./store";
export type { NotificationLog } from "./store";

export const notificationLog = createNotificationLog({
  directory: () => join(appDataRoot(), "notifications"),
  libraryId: currentLibraryId,
  now: Date.now,
  onChange: () =>
    broadcast<NotificationEvent>(IPC.notifications, { kind: "changed" }),
});
