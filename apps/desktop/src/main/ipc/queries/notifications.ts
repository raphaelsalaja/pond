import { z } from "zod";
import {
  NotificationDeleteSchema,
  NotificationIdsSchema,
  NotificationMarkReadSchema,
  NotificationPostSchema,
  NotificationSnoozeSchema,
} from "../../../shared/notification-contracts";
import { notificationLog } from "../../core/notifications";
import { query } from "./params";

const OK = { ok: true as const };

export const notificationQueries = {
  "notifications.list": query(z.object({}), () => notificationLog.list()),
  "notifications.post": query(NotificationPostSchema, async (input) => {
    await notificationLog.post(input);
    return OK;
  }),
  "notifications.resolve": query(NotificationIdsSchema, async ({ ids }) => {
    await notificationLog.resolve(ids);
    return OK;
  }),
  "notifications.markRead": query(
    NotificationMarkReadSchema,
    async ({ ids, read }) => {
      await notificationLog.markRead(ids, read);
      return OK;
    },
  ),
  "notifications.snooze": query(
    NotificationSnoozeSchema,
    async ({ ids, until }) => {
      await notificationLog.snooze(ids, until);
      return OK;
    },
  ),
  "notifications.delete": query(NotificationDeleteSchema, async (input) => {
    if ("read" in input) {
      await notificationLog.deleteRead();
    } else {
      await notificationLog.delete(input.ids);
    }
    return OK;
  }),
};
