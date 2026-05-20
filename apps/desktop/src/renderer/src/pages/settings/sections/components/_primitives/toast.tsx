import { Button, useToast } from "@pond/ui";
import { Cell } from "./cell";

export default function ToastCell() {
  const toast = useToast();

  return (
    <Cell label="Toast">
      <Button
        size="sm"
        onClick={() =>
          toast.add({
            title: "Saved",
            description: "Your changes have been written to disk.",
            type: "success",
          })
        }
      >
        Show success
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() =>
          toast.add({
            title: "Heads up",
            description: "Sync paused while offline.",
            type: "warning",
          })
        }
      >
        Show warning
      </Button>
    </Cell>
  );
}
