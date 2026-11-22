import { IconCircleCheck, IconCircleWarning, IconSparkle } from "@pond/icons";
import type { NotificationKind } from "@shared/notification-contracts";

export type NotificationTone = "danger" | "accent" | undefined;

export function notificationTone(kind: NotificationKind): NotificationTone {
  if (kind === "attention") return "danger";
  return kind === "announcement" ? "accent" : undefined;
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
    case "announcement":
      return <IconSparkle size={size} />;
    case "activity":
      return <IconCircleCheck size={size} />;
  }
}
