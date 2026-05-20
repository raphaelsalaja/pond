import { Button, useToast } from "@pond/ui";
import { Cell } from "./cell";

export default function NotificationCell() {
  const toast = useToast();

  return (
    <Cell label="Notification">
      <Button
        size="sm"
        onClick={async () => {
          const result = await window.pond.notifications.show({
            title: "Pond",
            body: "This is a native notification from your OS.",
          });
          if (!result.ok) {
            toast.add({
              title: "Notifications unavailable",
              description:
                result.reason === "unsupported"
                  ? "Your OS doesn't support notifications, or pond doesn't have permission yet."
                  : "Invalid notification payload.",
              type: "warning",
            });
          }
        }}
      >
        Show notification
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() =>
          void window.pond.notifications.show({
            title: "Saved from Reddit",
            body: "u/raphaelsalaja just shared a thread.",
            silent: true,
          })
        }
      >
        Show silent
      </Button>
    </Cell>
  );
}
