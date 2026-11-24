import { IconCircleCheck, IconCircleWarning } from "@pond/icons";
import type { NotificationKind } from "@shared/notification-contracts";

export type NotificationTone = "danger" | undefined;

export function notificationTone(kind: NotificationKind): NotificationTone {
  return kind === "attention" ? "danger" : undefined;
}

export function NotificationIcon({
  kind,
  size = 12,
}: {
  kind: NotificationKind;
  size?: number;
}) {
  switch (kind) {
    case "attention":
      return <IconCircleWarning size={size} />;
    case "activity":
      return <IconCircleCheck size={size} />;
  }
}
