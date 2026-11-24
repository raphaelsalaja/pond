import { z } from "zod";
import type { EmptyInput } from "./query-contracts-shared";

/** Older read notifications drop first once the log passes this size. */
export const NOTIFICATION_CAP = 500;

const NOTIFICATION_IDS_MAX = 1_000;

const NotificationIdSchema = z.string().trim().min(1).max(200);

export const NotificationKindSchema = z.enum(["attention", "activity"]);
export type NotificationKind = z.infer<typeof NotificationKindSchema>;

export const NotificationTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("save"), saveId: z.string().min(1).max(500) }),
  z.object({ type: z.literal("settings"), section: z.string().min(1).max(64) }),
]);
export type NotificationTarget = z.infer<typeof NotificationTargetSchema>;

export const NotificationPostSchema = z.object({
  id: NotificationIdSchema,
  kind: NotificationKindSchema,
  priority: z.boolean(),
  title: z.string().trim().min(1).max(200),
  body: z.string().max(2_000).optional(),
  target: NotificationTargetSchema.optional(),
});
export type NotificationPost = z.infer<typeof NotificationPostSchema>;

export const InboxNotificationSchema = NotificationPostSchema.extend({
  createdAt: z.number(),
  updatedAt: z.number(),
  readAt: z.number().optional(),
  snoozedUntil: z.number().optional(),
});
export type InboxNotification = z.infer<typeof InboxNotificationSchema>;

export const NotificationIdsSchema = z.object({
  ids: z.array(NotificationIdSchema).max(NOTIFICATION_IDS_MAX),
});

export const NotificationMarkReadSchema = NotificationIdsSchema.extend({
  read: z.boolean(),
});

/** `until: null` returns a snoozed notification right away. */
export const NotificationSnoozeSchema = NotificationIdsSchema.extend({
  until: z.number().nullable(),
});

export const NotificationDeleteSchema = z.union([
  NotificationIdsSchema,
  z.object({ read: z.literal(true) }),
]);

export type NotificationEvent = { kind: "changed" };

export interface NotificationQueryInputs {
  "notifications.list": EmptyInput;
  "notifications.post": NotificationPost;
  "notifications.resolve": z.infer<typeof NotificationIdsSchema>;
  "notifications.markRead": z.infer<typeof NotificationMarkReadSchema>;
  "notifications.snooze": z.infer<typeof NotificationSnoozeSchema>;
  "notifications.delete": z.infer<typeof NotificationDeleteSchema>;
}

export interface NotificationQueryResults {
  "notifications.list": InboxNotification[];
  "notifications.post": { ok: true };
  "notifications.resolve": { ok: true };
  "notifications.markRead": { ok: true };
  "notifications.snooze": { ok: true };
  "notifications.delete": { ok: true };
}
